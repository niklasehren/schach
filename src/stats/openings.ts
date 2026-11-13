import { Chess } from 'chess.js';
import data from '../data/openings.json';
import type { GameRecord } from '../db/schema';

/**
 * Eröffnung einer Partie als „Familie“ (z. B. French Defense), aus der freien Liste lichess-org/chess-openings (CC0-1.0).
 * - Chess.com: aus dem ECO-Header (Code → Familie des allgemeinsten Eintrags mit diesem Code); bei Sammelcodes wie A00
 *   (mehr als drei Familien unter einem Code) und ohne Header entscheiden die Züge
 * - App- und Brettpartien mit Zügen: tiefste Stellung der Partie, die in der Liste vorkommt (erkennt auch Zugumstellungen)
 * Erzeugt mit `node scripts/openings.mjs`.
 */
type OpeningData = { families: string[]; eco: Record<string, number>; pos: Record<string, number> };
const OPENINGS = data as OpeningData;

/** Nur so weit in die Partie schauen (die längsten Einträge der Liste haben gut 30 Halbzüge) */
const MAX_PLIES = 40;

/** Deutsche Namen der häufigen Familien; alle anderen bleiben englisch wie in der Liste */
const GERMAN: Record<string, string> = {
  'French Defense': 'Französisch',
  'Sicilian Defense': 'Sizilianisch',
  'Caro-Kann Defense': 'Caro-Kann',
  'Italian Game': 'Italienisch',
  'Ruy Lopez': 'Spanisch',
  'Scotch Game': 'Schottisch',
  'Scandinavian Defense': 'Skandinavisch',
  "Queen's Gambit Declined": 'Abgelehntes Damengambit',
  "Queen's Gambit Accepted": 'Angenommenes Damengambit',
  "Queen's Gambit": 'Damengambit',
  "Queen's Pawn Game": 'Damenbauernspiel',
  "King's Pawn Game": 'Königsbauernspiel',
  "King's Pawn Opening": 'Königsbauernspiel',
  "King's Knight Opening": 'Königsspringerspiel',
  "King's Gambit": 'Königsgambit',
  "King's Indian Defense": 'Königsindisch',
  "King's Indian Attack": 'Königsindischer Angriff',
  "Queen's Indian Defense": 'Damenindisch',
  'Nimzo-Indian Defense': 'Nimzoindisch',
  'Bogo-Indian Defense': 'Bogoljubow-Indisch',
  'Old Indian Defense': 'Altindisch',
  'Indian Defense': 'Indisch',
  'English Opening': 'Englisch',
  'Dutch Defense': 'Holländisch',
  'Slav Defense': 'Slawisch',
  'Semi-Slav Defense': 'Halbslawisch',
  'Grünfeld Defense': 'Grünfeld-Indisch',
  'Benoni Defense': 'Benoni',
  "Petrov's Defense": 'Russisch',
  'Philidor Defense': 'Philidor-Verteidigung',
  'Four Knights Game': 'Vierspringerspiel',
  'Three Knights Opening': 'Dreispringerspiel',
  'Vienna Game': 'Wiener Partie',
  "Bishop's Opening": 'Läuferspiel',
  'Center Game': 'Mittelgambit',
  'Alekhine Defense': 'Aljechin-Verteidigung',
  'Pirc Defense': 'Pirc-Verteidigung',
  'Modern Defense': 'Moderne Verteidigung',
  'Nimzowitsch Defense': 'Nimzowitsch-Verteidigung',
  'Owen Defense': 'Owen-Verteidigung',
  'Zukertort Opening': 'Zukertort-Eröffnung',
  'Réti Opening': 'Réti-Eröffnung',
  'Bird Opening': 'Bird-Eröffnung',
  'London System': 'Londoner System',
  'Colle System': 'Colle-System',
  'Catalan Opening': 'Katalanisch',
  'Danish Gambit': 'Nordisches Gambit',
  'Ponziani Opening': 'Ponziani-Eröffnung',
  'Elephant Gambit': 'Elefantengambit',
  'Latvian Gambit': 'Lettisches Gambit',
  'Englund Gambit': 'Englund-Gambit',
  'Blackmar-Diemer Gambit': 'Blackmar-Diemer-Gambit',
  'Polish Opening': 'Polnische Eröffnung',
  'Van Geet Opening': 'Dunst-Eröffnung',
  'Hungarian Opening': 'Ungarische Eröffnung',
  'Trompowsky Attack': 'Trompowsky-Angriff',
  'Torre Attack': 'Torre-Angriff',
  'Tarrasch Defense': 'Tarrasch-Verteidigung',
  'Rat Defense': 'Rattenverteidigung',
};

export const FRENCH = 'French Defense';

export const openingLabel = (family: string) => GERMAN[family] ?? family;

/** Alle Familien der Liste (für die Auswahl in den Einstellungen) */
export const allFamilies = () => [...new Set(OPENINGS.families)].sort((a, b) => openingLabel(a).localeCompare(openingLabel(b), 'de'));

const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

/** Familie aus einem ECO-Code („C01“); null, wenn der Code nicht in der Liste steht */
export function familyFromEco(eco: string | undefined): string | null {
  if (!eco) return null;
  const i = OPENINGS.eco[eco.trim().toUpperCase()];
  return i === undefined || i < 0 ? null : OPENINGS.families[i];
}

/** Familie aus den Zügen (PGN): tiefste bekannte Stellung; null, wenn schon der erste Zug nicht in der Liste steht */
export function familyFromPgn(pgn: string): string | null {
  if (!pgn) return null;
  const c = new Chess();
  try {
    c.loadPgn(pgn);
  } catch {
    return null;
  }
  const moves = c.history();
  const walk = new Chess();
  let found: string | null = null;
  for (const m of moves.slice(0, MAX_PLIES)) {
    walk.move(m);
    const i = OPENINGS.pos[posKey(walk.fen())];
    if (i !== undefined) found = OPENINGS.families[i];
  }
  return found;
}

/** Eröffnungsfamilie einer Partie (siehe oben) */
export function openingOf(g: Pick<GameRecord, 'source' | 'eco' | 'pgn'>): string | null {
  if (g.source === 'chesscom') return familyFromEco(g.eco) ?? familyFromPgn(g.pgn);
  return familyFromPgn(g.pgn);
}
