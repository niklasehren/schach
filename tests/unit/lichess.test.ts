import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import meta from '../../src/data/lichess/meta.json';
import { db, TABLES, type GameRecord } from '../../src/db/schema';
import {
  choosePuzzle,
  expectedScore,
  kFactor,
  loadTheme,
  parseLichess,
  scoreOf,
  startRating,
  updateRating,
  type LichessPuzzle,
  type LichessRow,
} from '../../src/training/lichess';
import { BASE_SHARE, ERROR_THEMES, pickTheme, THEME_KEYS, THEMES, themeWeights } from '../../src/training/themes';
import { getPuzzleRating, nextLichessPuzzle, recordLichessResult, seenLichess, lichessAttemptId } from '../../src/training/general';
import { logAttempt } from '../../src/training/store';

beforeEach(async () => {
  for (const t of TABLES) await db.table(t).clear();
});

/** Echte Zeile aus lichess_db_puzzle.csv (Puzzle 00008) */
const ROW: LichessRow = ['00008', 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24', 'f2g3 e6e7 b2b1 b3c1 b1c1 h6c1', 1819];

describe('Lichess-Format', () => {
  it('FEN ist die Stellung VOR dem Gegnerzug; erster Zug = Gegner, danach meine Lösung', () => {
    const p = parseLichess(ROW, 'fork');
    // In der Datenbank-FEN ist Schwarz (der Gegner) am Zug …
    expect(p.startFen.split(' ')[1]).toBe('b');
    expect(p.opponentMove).toBe('f2g3');
    // … nach seinem Zug f2xg3 bin ich (Weiß) am Zug
    expect(p.fen.split(' ')[1]).toBe('w');
    expect(new Chess(p.fen).get('g3')).toEqual({ type: 'b', color: 'b' });
    expect(p.line).toEqual(['e6e7', 'b2b1', 'b3c1', 'b1c1', 'h6c1']);
    // Die Lösung ist ab der Puzzle-Stellung legal und endet mit meinem Zug
    const c = new Chess(p.fen);
    p.line.forEach((uci, i) => {
      expect(c.turn()).toBe(i % 2 === 0 ? 'w' : 'b');
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    });
    expect(p.line.length % 2).toBe(1);
  });

  it('Zugfolgen ohne eigene Lösung oder mit falscher Länge werden abgelehnt', () => {
    expect(() => parseLichess(['x', ROW[1], 'f2g3', 1000], 'fork')).toThrow();
    expect(() => parseLichess(['x', ROW[1], 'f2g3 e6e7 b2b1', 1000], 'fork')).toThrow();
    // illegaler Gegnerzug
    expect(() => parseLichess(['x', ROW[1], 'e2e4 e6e7', 1000], 'fork')).toThrow();
  });

  it('ausgelieferte Auswahl: je 300 Puzzles pro Thema, Rating 400–1800, alle Zugfolgen legal', async () => {
    expect(Object.keys(meta.counts).sort()).toEqual([...THEME_KEYS].sort());
    for (const theme of THEME_KEYS) {
      const list = await loadTheme(theme);
      expect(list, theme).toHaveLength(300);
      expect(new Set(list.map((p) => p.id)).size).toBe(300);
      for (const p of list) {
        expect(p.rating).toBeGreaterThanOrEqual(400);
        expect(p.rating).toBeLessThan(1800);
        const c = new Chess(p.fen);
        const me = c.turn();
        // Gegner hat gezogen → in der Ausgangs-FEN war die andere Farbe am Zug
        expect(p.startFen.split(' ')[1]).not.toBe(me);
        for (const uci of p.line) c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        if (theme === 'mateIn1' || theme === 'mateIn2' || theme === 'backRankMate') expect(c.isCheckmate(), `${theme} ${p.id}`).toBe(true);
        if (theme === 'mateIn1') expect(p.line).toHaveLength(1);
        if (theme === 'mateIn2') expect(p.line).toHaveLength(3);
      }
    }
  }, 30000);
});

describe('Auswahl passend zum Rating', () => {
  const mk = (id: string, rating: number): LichessPuzzle => ({ id, rating, theme: 'fork', startFen: '', opponentMove: '', fen: '', line: [] });
  const list = [mk('a', 500), mk('b', 700), mk('c', 760), mk('d', 1200), mk('e', 1700)];

  it('ungespielte Puzzles im Fenster ±100 um mein Rating', () => {
    expect(['b', 'c']).toContain(choosePuzzle(list, 720, new Set(), 0)!.id);
    expect(choosePuzzle(list, 720, new Set(), 0.99)!.id).toBe('c');
    expect(choosePuzzle(list, 720, new Set(['b']), 0)!.id).toBe('c');
  });

  it('Fenster wird größer, wenn in der Nähe nichts Ungespieltes liegt; alles gespielt → Wiederholung erlaubt', () => {
    expect(choosePuzzle(list, 720, new Set(['b', 'c']), 0)!.id).toBe('a');
    expect(choosePuzzle(list, 1500, new Set(), 0)!.id).toBe('e');
    expect(choosePuzzle(list, 720, new Set(list.map((p) => p.id)), 0)!.id).toBe('b');
    expect(choosePuzzle([], 720, new Set(), 0)).toBeNull();
  });
});

describe('Puzzle-Rating (vereinfachtes Elo)', () => {
  it('Erwartung und Anpassung', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedScore(1000, 1400)).toBeCloseTo(1 / 11);
    // gleich stark: +20 bzw. −20 (K = 40 am Anfang)
    expect(updateRating(1000, 0, 1000, 1)).toBe(1020);
    expect(updateRating(1000, 0, 1000, 0)).toBe(980);
    // im zweiten Versuch gelöst = halber Punkt → bei gleichem Rating keine Änderung
    expect(updateRating(1000, 0, 1000, scoreOf(true, false))).toBe(1000);
    // schweres Puzzle gelöst bringt viel, leichtes verloren kostet viel
    expect(updateRating(1000, 0, 1400, 1)).toBe(1036);
    expect(updateRating(1000, 0, 600, 0)).toBe(964);
    // ab 15 Puzzles ruhiger (K = 20)
    expect(kFactor(14)).toBe(40);
    expect(kFactor(15)).toBe(20);
    expect(updateRating(1000, 30, 1000, 1)).toBe(1010);
    // Untergrenze
    expect(updateRating(110, 0, 110, 0)).toBe(100);
    expect(scoreOf(true, true)).toBe(1);
    expect(scoreOf(false, false)).toBe(0);
  });

  const g = (date: number, timeClass: GameRecord['timeClass'], rating: number, source: GameRecord['source'] = 'chesscom') =>
    ({ id: `${date}`, source, date, timeClass, myColor: 'white', white: { name: 'ich', rating }, black: { name: 'x', rating: 500 } }) as GameRecord;

  it('Startwert aus der letzten Chess.com-Wertung (Rapid zuerst) + 400, begrenzt auf 600–1800', () => {
    expect(startRating([])).toBe(1000);
    expect(startRating([g(1, 'rapid', 300), g(2, 'rapid', 351), g(3, 'blitz', 900)])).toBe(751);
    expect(startRating([g(1, 'blitz', 900)])).toBe(1300);
    expect(startRating([g(1, 'rapid', 100)])).toBe(600);
    expect(startRating([g(1, 'rapid', 2000)])).toBe(1800);
    expect(startRating([g(1, 'rapid', 351, 'app')])).toBe(1000);
  });

  it('Ergebnis wird gespeichert; gespielte Puzzles kommen nicht sofort wieder', async () => {
    const p = parseLichess(ROW, 'fork');
    expect(await getPuzzleRating()).toEqual({ rating: 1000, played: 0, updated: null });
    const r = await recordLichessResult(p, true, true, 5);
    expect(r).toEqual({ before: 1000, after: 1000 + Math.round(40 * (1 - expectedScore(1000, 1819))) });
    expect(await getPuzzleRating()).toEqual({ rating: r.after, played: 1, updated: 5 });
    await logAttempt(lichessAttemptId('00008'), 'e6e7', true, 1, 1000);
    await logAttempt('g:12', 'e2e4', true, 1, 1000);
    expect(await seenLichess()).toEqual(new Set(['00008']));
    // Thema „Gabel“: nie dasselbe Puzzle zweimal hintereinander
    const first = await nextLichessPuzzle('fork', [], () => 0);
    const second = await nextLichessPuzzle('fork', [first!.id], () => 0);
    expect(first!.theme).toBe('fork');
    expect(second!.id).not.toBe(first!.id);
    expect(Math.abs(first!.rating - r.after)).toBeLessThanOrEqual(100);
  });
});

describe('Themen-Gewichtung nach meinen Schwächen', () => {
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  it('ohne passende Fehler: alle Themen gleich', () => {
    for (const counts of [[], [{ type: 'other', count: 12 }]]) {
      const w = themeWeights(counts);
      expect(sum(w)).toBeCloseTo(1);
      for (const v of w.values()) expect(v).toBeCloseTo(1 / THEMES.length);
    }
  });

  it('80 % nach Fehlerarten, 20 % gleichmäßig; häufigste Fehlerart → ihre Themen vorn', () => {
    const w = themeWeights([
      { type: 'fork', count: 6 },
      { type: 'undefended', count: 4 },
      { type: 'other', count: 30 },
    ]);
    expect(sum(w)).toBeCloseTo(1);
    const base = BASE_SHARE / THEMES.length;
    // fork: 6 von 10 Fehlerpunkten; undefended: je 2 auf hangingPiece und defensiveMove
    expect(w.get('fork')).toBeCloseTo(base + 0.8 * 0.6);
    expect(w.get('hangingPiece')).toBeCloseTo(base + 0.8 * 0.2);
    expect(w.get('defensiveMove')).toBeCloseTo(base + 0.8 * 0.2);
    // nicht betroffene Themen behalten nur den Grundanteil, verschwinden aber nicht
    expect(w.get('promotion')).toBeCloseTo(base);
    const top = [...w.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe('fork');
  });

  it('„Matt zugelassen“ 42×: Matt-Muster und Verteidigen vorn, Gefangene Figur nur mit Grundanteil', () => {
    const w = themeWeights([
      { type: 'mateAllowed', count: 42 },
      { type: 'pieceTaken', count: 5 },
      { type: 'undefended', count: 4 },
      { type: 'threatMissed', count: 2 },
      { type: 'other', count: 14 },
    ]);
    const top4 = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
    expect(top4.sort()).toEqual(['backRankMate', 'defensiveMove', 'mateIn1', 'mateIn2']);
    const base = BASE_SHARE / THEMES.length;
    for (const t of ['trappedPiece', 'pin', 'skewer', 'discoveredAttack', 'attraction', 'promotion'] as const) expect(w.get(t)).toBeCloseTo(base);
    // gut drei Viertel des Trainings sind Matt-Muster und Verteidigen
    const mate = ['mateIn1', 'mateIn2', 'backRankMate', 'defensiveMove'].reduce((sum, k) => sum + w.get(k as never)!, 0);
    expect(mate).toBeGreaterThan(0.75);
  });

  it('jede Fehlerart verweist nur auf vorhandene Themen; Ziehen nach Gewicht', () => {
    for (const themes of Object.values(ERROR_THEMES)) for (const t of themes) expect(THEME_KEYS).toContain(t);
    const w = themeWeights([{ type: 'fork', count: 1 }]);
    // kumulativ: die ersten Themen haben nur den Grundanteil, „fork“ (2. Stelle) den großen Rest
    expect(pickTheme(w, 0)).toBe('hangingPiece');
    expect(pickTheme(w, 0.5)).toBe('fork');
    expect(pickTheme(w, 0.999999)).toBe('promotion');
  });
});
