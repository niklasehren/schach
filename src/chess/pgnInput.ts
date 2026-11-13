import { Chess } from 'chess.js';

/**
 * Eingefügte Züge lesen – in deutscher (K D T L S) oder englischer (K Q R B N) Schreibweise, auch gemischt.
 * Pro Zug eindeutig: D/T/L/S gibt es nur deutsch, Q/R/N nur englisch, B nur englisch (deutsch „L“);
 * Linien a–h sind klein geschrieben und werden nie umgewandelt.
 */

const GERMAN: Record<string, string> = { D: 'Q', T: 'R', L: 'B', S: 'N' };
const piece = (c: string) => GERMAN[c] ?? c;

/** Einen Zug (SAN) in englische Schreibweise bringen; alles andere (Zugnummern, Ergebnisse, NAGs) bleibt unverändert */
export function toEnglishSan(token: string): string {
  // Zugnummer direkt davor („1.Sf3“, „12...Lxc6+“)
  const num = /^(\d+\.+)(.+)$/.exec(token);
  if (num) return num[1] + toEnglishSan(num[2]);
  // Rochade mit Null oder O, auch gemischt („0-0“, „O-O-O+“)
  const castle = /^([0O])-([0O])(-([0O]))?([+#]?[!?]*)$/.exec(token);
  if (castle) return (castle[3] ? 'O-O-O' : 'O-O') + castle[5];
  // Figurenzug: Figur, optional Ausgangslinie/-reihe, optional Schlagen (x oder :), Zielfeld
  const pieceMove = /^([KDTLSQRBN])([a-h]?[1-8]?)([x:]?)([a-h][1-8])([+#]?[!?]*)$/.exec(token);
  if (pieceMove) return piece(pieceMove[1]) + pieceMove[2] + (pieceMove[3] ? 'x' : '') + pieceMove[4] + pieceMove[5];
  // Bauernzug, optional mit Umwandlung („e8=D“, „e8D“, „dxe8=S+“)
  const pawn = /^([a-h])([x:][a-h])?([1-8])(=?([DTLSQRBN]))?(e\.p\.)?([+#]?[!?]*)$/.exec(token);
  if (pawn) return pawn[1] + (pawn[2] ? 'x' + pawn[2].slice(1) : '') + pawn[3] + (pawn[5] ? '=' + piece(pawn[5]) : '') + pawn[7];
  return token;
}

/** Teile der PGN, in denen keine Züge stehen (Kopfzeilen, Kommentare) – werden unverändert übernommen */
const SKIP = /(\[[^\]]*\]|\{[^}]*\}|;[^\n]*)/;

/** Ganze PGN in englische Schreibweise bringen; Kopfzeilen und Kommentare (z. B. Uhrzeiten) bleiben erhalten */
export function normalizePgn(text: string): string {
  return text
    .replace(/e\.\s?p\./g, '')
    .split(SKIP)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/[^\s()]+/g, (tok) => toEnglishSan(tok))))
    .join('');
}

/** Nur die Züge (ohne Kopfzeilen, Kommentare, Varianten, Zugnummern, Bewertungszeichen, Ergebnis) */
function moveTokens(text: string): string[] {
  let t = text.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  // Varianten (auch verschachtelt) entfernen
  let prev;
  do {
    prev = t;
    t = t.replace(/\([^()]*\)/g, ' ');
  } while (t !== prev);
  return t
    .split(/\s+/)
    .map((tok) => tok.replace(/^\d+\.+/, ''))
    .filter((tok) => tok && !/^\$\d+$/.test(tok) && !/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(tok) && !/^\d+\.*$/.test(tok));
}

export class MoveInputError extends Error {}

const colorName = (c: 'w' | 'b') => (c === 'w' ? 'Weiß' : 'Schwarz');

/**
 * Züge einlesen (deutsch, englisch oder gemischt). Leerer Text = null.
 * Wirft MoveInputError mit Zugnummer, wenn ein Zug in der Stellung nicht möglich ist.
 */
export function parseMoveInput(text: string): Chess | null {
  const t = text.trim();
  if (!t) return null;
  const pgn = normalizePgn(t);
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
    if (chess.history().length > 0) return chess;
  } catch {
    // unten Zug für Zug nachspielen, um den ungültigen Zug zu finden
  }
  const replay = new Chess();
  const tokens = moveTokens(pgn);
  if (tokens.length === 0) throw new MoveInputError('Im eingefügten Text stehen keine Züge.');
  const original = moveTokens(t.replace(/e\.\s?p\./g, ''));
  for (let i = 0; i < tokens.length; i++) {
    const no = replay.moveNumber();
    const side = replay.turn();
    try {
      replay.move(tokens[i]);
    } catch {
      const shown = original[i] ?? tokens[i];
      return fail(`Zug ${no}${side === 'b' ? ' …' : '.'} ${shown} (${colorName(side)}) ist in dieser Stellung nicht möglich.`);
    }
  }
  // Alle Züge gültig, nur das Drumherum war nicht lesbar (z. B. kaputte Kopfzeile) → Züge ohne Kommentare übernehmen
  return replay;
}

function fail(msg: string): never {
  throw new MoveInputError(msg);
}
