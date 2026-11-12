import { afterAll, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import nov from '../fixtures/chesscom-2026-11.json';
import okt from '../fixtures/chesscom-2026-10.json';
import {
  allowedMate,
  baseTimeFrom,
  inTimeTrouble,
  judge,
  materialLossAfterPv,
  missedMate,
  phaseOf,
  pov,
  winningChances,
  mateWinningChances,
} from '../../src/analysis/rules';
import { analyseGame, buildAnalysis, parseGame, summaryText } from '../../src/analysis/analyze';
import { convertChessComGame, type ChessComGame } from '../../src/chesscom/convert';
import { buildAppGame } from '../../src/db/games';
import { createSession, defaultSetup } from '../../src/chess/session';
import type { PositionEval } from '../../src/db/schema';
import { nodeEngine } from './nodeEngine';

describe('Gewinnchance (Lichess-Formel)', () => {
  it('feste Werte', () => {
    expect(winningChances(0)).toBe(0);
    expect(winningChances(100)).toBeCloseTo(0.1821, 3);
    expect(winningChances(-300)).toBeCloseTo(-0.5023, 3);
    // auf ±1000 begrenzt
    expect(winningChances(5000)).toBe(winningChances(1000));
    expect(winningChances(1000)).toBeCloseTo(0.9509, 3);
    // Matt in 1 ≈ 2000 cp (ungekappt), Matt in 10+ ≈ 1100 cp
    expect(mateWinningChances(1)).toBeCloseTo(2 / (1 + Math.exp(-0.00368208 * 2000)) - 1, 6);
    expect(mateWinningChances(-15)).toBeCloseTo(-(2 / (1 + Math.exp(-0.00368208 * 1100)) - 1), 6);
  });
});

describe('Klassen', () => {
  // Verlust an Gewinnchance auf der Skala −1…+1: ≥0,3 Patzer, ≥0,2 Fehler, ≥0,1 Ungenauigkeit
  it('Schwellen', () => {
    expect(judge({ cp: 0 }, { cp: -20 })).toBeNull();
    expect(judge({ cp: 0 }, { cp: -60 })?.class).toBe('inaccuracy'); // 0,110
    expect(judge({ cp: 0 }, { cp: -110 })?.class).toBe('inaccuracy'); // 0,1998 – knapp unter 0,2
    expect(judge({ cp: 0 }, { cp: -115 })?.class).toBe('mistake'); // 0,209
    expect(judge({ cp: 0 }, { cp: -170 })?.class).toBe('blunder'); // 0,304
    // gleicher cp-Verlust zählt bei großem Vorteil weniger
    expect(judge({ cp: 800 }, { cp: 500 })?.class).toBe('inaccuracy');
    expect(judge({ cp: 1500 }, { cp: 1100 })).toBeNull();
    // Verbesserung ist nie ein Fehler
    expect(judge({ cp: -100 }, { cp: 300 })).toBeNull();
  });

  it('Sicht der Farbe', () => {
    expect(pov({ cp: 150 }, 'black')).toEqual({ cp: -150 });
    expect(pov({ mate: 3 }, 'black')).toEqual({ mate: -3 });
    expect(pov({ mate: 0 }, 'black')).toEqual({ mate: 0 });
  });

  it('Matt zugelassen: Patzer, ab −7 Fehler, ab −10 Ungenauigkeit', () => {
    expect(judge({ cp: 50 }, { mate: -3 })).toEqual({ class: 'blunder', kind: 'mateCreated' });
    expect(judge({ cp: -750 }, { mate: -3 })?.class).toBe('mistake');
    expect(judge({ cp: -1200 }, { mate: -3 })?.class).toBe('inaccuracy');
    expect(judge({ cp: -700 }, { mate: -3 })?.class).toBe('blunder');
    // schon vorher Matt gegen mich: keine neue Bewertung
    expect(judge({ mate: -5 }, { mate: -2 })).toBeNull();
  });

  it('Eigenes Matt verloren: Patzer, über +7 Fehler, über +10 Ungenauigkeit', () => {
    expect(judge({ mate: 2 }, { cp: 300 })).toEqual({ class: 'blunder', kind: 'mateLost' });
    expect(judge({ mate: 2 }, { cp: 800 })?.class).toBe('mistake');
    expect(judge({ mate: 2 }, { cp: 1500 })?.class).toBe('inaccuracy');
    expect(judge({ mate: 2 }, { mate: -4 })?.class).toBe('blunder');
    // Matt bleibt (auch wenn länger), Matt gesetzt (mate 0): kein Fehler
    expect(judge({ mate: 2 }, { mate: 5 })).toBeNull();
    expect(judge({ mate: 1 }, { mate: 0 })).toBeNull();
  });

  it('Merkmale Matt übersehen / zugelassen', () => {
    expect(missedMate({ mate: 2 }, { cp: 500 })).toBe(true);
    expect(missedMate({ mate: 2 }, { mate: 1 })).toBe(false);
    // Matt gesetzt
    expect(missedMate({ mate: 1 }, { mate: 0 })).toBe(false);
    expect(allowedMate({ cp: 0 }, { mate: -2 })).toBe(true);
    expect(allowedMate({ mate: -4 }, { mate: -3 })).toBe(false);
  });
});

describe('Spielphase', () => {
  it('Eröffnung, Mittelspiel, Endspiel', () => {
    expect(phaseOf(new Chess().fen())).toBe('opening');
    // Zug 15 mit allen Figuren: Mittelspiel
    expect(phaseOf('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 15')).toBe('middlegame');
    // Zug 8, aber schon 3 Figuren getauscht: Mittelspiel
    expect(phaseOf('r2qkb1r/ppp2ppp/8/4p3/4P3/8/PPP2PPP/R1BQK2R w KQkq - 0 8')).toBe('middlegame');
    // Damen weg, je 2 Türme: Endspiel
    expect(phaseOf('r4rk1/5ppp/8/8/8/8/5PPP/R4RK1 w - - 0 30')).toBe('endgame');
    // Damen weg, je 3 Figuren: noch Mittelspiel
    expect(phaseOf('r1b2rk1/5ppp/8/8/8/8/5PPP/R1B2RK1 w - - 0 30')).toBe('middlegame');
    // Damen weg, aber je 3 Figuren: Mittelspiel (Regel aus dem Plan)
    expect(phaseOf('r1b2rk1/5ppp/8/8/8/8/5PPP/R1B2RK1 w - - 0 31')).toBe('middlegame');
    // Damen da, aber nur 4 Figuren insgesamt: Endspiel
    expect(phaseOf('3qr1k1/5ppp/8/8/8/8/5PPP/3QR1K1 w - - 0 40')).toBe('endgame');
  });
});

describe('Figur eingestellt', () => {
  it('Springer hängt, Abtausch zählt nicht, Gabel zählt', () => {
    // Weiß zieht Sd4?? (ungedeckt), Schwarz schlägt mit der Dame
    const before = 'rnb1kbnr/pppp1ppp/8/4p2q/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3';
    const after = 'rnb1kbnr/pppp1ppp/8/4p2q/3N4/8/PPPPPPPP/RNBQKB1R b KQkq - 1 3';
    expect(materialLossAfterPv(before, after, ['e5d4', 'e2e3', 'd4e3', 'd2e3'], 'white')).toBe(3);
    // Abtausch: Springer gegen Springer
    const b2 = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4';
    const a2 = 'r1bqkb1r/pppp1ppp/2n2n2/3Np3/4P3/5N2/PPPP1PPP/R1BQKB1R b KQkq - 5 4';
    expect(materialLossAfterPv(b2, a2, ['f6d5', 'e4d5', 'c6d4', 'f3d4'], 'white')).toBe(0);
  });
});

describe('Zeitnot', () => {
  it('unter 10 % der Grundzeit; Fernschach und Partien ohne Uhr ausgenommen', () => {
    expect(baseTimeFrom('600')).toBe(600);
    expect(baseTimeFrom('180+2')).toBe(180);
    expect(baseTimeFrom('1/86400')).toBeNull();
    expect(baseTimeFrom('-')).toBeNull();
    expect(baseTimeFrom('600', 'daily')).toBeNull();
    expect(baseTimeFrom(null)).toBeNull();
    expect(inTimeTrouble(59, 600)).toBe(true);
    expect(inTimeTrouble(60, 600)).toBe(false);
    expect(inTimeTrouble(null, 600)).toBeNull();
    expect(inTimeTrouble(10, null)).toBeNull();
  });

  it('Zeitnot pro Zug aus %clk; Daily-Partie ohne Zeitnot', () => {
    const bullet = convertChessComGame(nov.games.find((g) => g.url.endsWith('004')) as ChessComGame, 'testspieler')!;
    const parsed = parseGame(bullet);
    const fake = parsed.fens.map((): PositionEval => ({ cp: 0, depth: 1 }));
    const a = buildAnalysis(bullet, parsed, fake);
    expect(a.baseTime).toBe(60);
    // Erster Zug: Restzeit vor dem Zug = Grundzeit
    expect(a.sides.white[0].clock).toBe(60);
    expect(a.sides.white[0].timeTrouble).toBe(false);
    // Zeitnot genau dann, wenn die Restzeit vor dem Zug unter 6 s (10 % von 60 s) liegt
    const all = [...a.sides.white, ...a.sides.black];
    expect(all.some((m) => m.timeTrouble === true)).toBe(true);
    for (const m of all) expect(m.timeTrouble).toBe(m.clock! < 6);

    const daily = convertChessComGame(okt.games.find((g) => g.url.endsWith('005')) as ChessComGame, 'testspieler')!;
    const pd = parseGame(daily);
    const ad = buildAnalysis(daily, pd, pd.fens.map((): PositionEval => ({ cp: 0, depth: 1 })));
    expect(ad.baseTime).toBeNull();
    expect(ad.sides.black.every((m) => m.timeTrouble === null)).toBe(true);
    expect(ad.summary.black.timeTroubleKnown).toBe(false);
  });
});

describe('Echte Engine (Stockfish 19 Lite in Node)', () => {
  const engine = nodeEngine();
  afterAll(() => engine.terminate());

  it('Schäfermatt: 3...Sf6?? ist Patzer mit „Matt zugelassen“', async () => {
    const c = new Chess();
    for (const m of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']) c.move(m);
    const game = buildAppGame(createSession({ ...defaultSetup, mode: 'computer', colorChoice: 'black' }), c, { winner: 'white', reason: 'checkmate' });
    const a = (await analyseGame(game, engine, { depth: 10 }))!;
    const nf6 = a.sides!.black[2];
    expect(nf6.san).toBe('Nf6');
    expect(nf6.class).toBe('blunder');
    expect(nf6.allowedMate).toBe(true);
    expect(a.evals[6]!.mate).toBe(1);
    expect(a.evals[7]).toEqual({ mate: 0, depth: 0 });
    // Das Matt selbst ist kein Fehler
    expect(a.sides!.white[3]).toMatchObject({ san: 'Qxf7#', class: undefined, missedMate: false });
    expect(a.summary!.black.blunders).toBe(1);
    expect(summaryText(a.summary!.black)).toContain('1 Patzer');
    expect(summaryText(a.summary!.black)).toContain('1× Matt zugelassen');
  }, 30000);

  it('Echte Chess.com-Partie (ich mit Schwarz): 6...b5?? und 9...Dd7 stellen Figuren ein', async () => {
    const game = convertChessComGame(nov.games.find((g) => g.url.endsWith('001')) as ChessComGame, 'testspieler')!;
    const a = (await analyseGame(game, engine, { depth: 12 }))!;
    expect(a.status).toBe('done');
    expect(a.myColor).toBe('black');
    expect(a.timeClass).toBe('rapid');
    expect(a.baseTime).toBe(600);
    expect(a.evals).toHaveLength(game.plies + 1);
    const mine = a.sides![a.myColor!];
    // 6...b5?? – 7. Dxc6+ gewinnt den Springer
    expect(mine.find((m) => m.ply === 12)).toMatchObject({ san: 'b5', class: 'blunder', hanging: true, phase: 'opening', timeTrouble: false });
    // 9...Dd7 – 10. Dxa8+ gewinnt den Turm
    expect(mine.find((m) => m.ply === 18)).toMatchObject({ san: 'Qd7', hanging: true });
    expect(mine.find((m) => m.ply === 18)!.class).toMatch(/mistake|blunder/);
    expect(a.summary!.black.hanging).toBeGreaterThanOrEqual(2);
    expect(summaryText(a.summary!.black)).toMatch(/Figuren eingestellt/);
    // Die Züge des Gegners sind getrennt gespeichert
    expect(a.sides!.white.every((m) => m.ply % 2 === 1)).toBe(true);
  }, 120000);

  it('6. g4 ist ein Patzer, stellt aber nach der Engine-Variante (Lxc2) keine Figur ein', async () => {
    const game = convertChessComGame(nov.games.find((g) => g.url.endsWith('003')) as ChessComGame, 'testspieler')!;
    const a = (await analyseGame(game, engine, { depth: 12 }))!;
    expect(a.sides!.white.find((m) => m.ply === 11)).toMatchObject({ san: 'g4', class: 'blunder', hanging: false, bestSan: 'Bd3' });
  }, 120000);
});
