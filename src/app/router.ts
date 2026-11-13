import { useEffect, useState } from 'react';
import type { Phase, Side } from '../db/schema';

export type Route =
  | { page: 'uebersicht' }
  | { page: 'einstellungen' }
  | { page: 'spielen' }
  | { page: 'partien' }
  | { page: 'partie'; id: string; ply?: number }
  | { page: 'import' }
  /** Brettpartie eintragen (ohne id) oder bearbeiten */
  | { page: 'brett'; id?: string }
  | { page: 'statistik' }
  | { page: 'training'; mode?: TrainingMode; theme?: string; filter?: PuzzleFilter };

/** Auswahl „Meine Fehler“ (Statistik → Training): Spielphase, Eröffnungsfamilie, Farbe, Zeitnot */
export type PuzzleFilter = { phase?: Phase; opening?: string; color?: Side; zeitnot?: boolean };

/** fehler = Tagesziel aus meinen Fehlern, mehr = „Weiter üben“ ohne Limit, auswahl = meine Fehler mit Filter, allgemein = Lichess-Puzzles (Thema oder „schwaechen“) */
export type TrainingMode = 'fehler' | 'mehr' | 'auswahl' | 'allgemein';

const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

export function parseFilter(query: string): PuzzleFilter {
  const q = new URLSearchParams(query);
  const f: PuzzleFilter = {};
  const phase = q.get('phase');
  if (phase && (PHASES as string[]).includes(phase)) f.phase = phase as Phase;
  const opening = q.get('eroeffnung');
  if (opening) f.opening = opening;
  const color = q.get('farbe');
  if (color === 'white' || color === 'black') f.color = color;
  if (q.get('zeitnot') === '1') f.zeitnot = true;
  return f;
}

export function filterQuery(f: PuzzleFilter): string {
  const q = new URLSearchParams();
  if (f.phase) q.set('phase', f.phase);
  if (f.opening) q.set('eroeffnung', f.opening);
  if (f.color) q.set('farbe', f.color);
  if (f.zeitnot) q.set('zeitnot', '1');
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Seiten über den Teil nach „#“ in der Adresse – funktioniert auf GitHub Pages ohne Server-Einstellungen */
export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.split('?');
  const parts = path.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'partien' && parts[1]) return { page: 'partie', id: parts[1], ply: parts[2] !== undefined && /^\d+$/.test(parts[2]) ? Number(parts[2]) : undefined };
  if (parts[0] === 'training') {
    const mode = parts[1] === 'fehler' || parts[1] === 'mehr' || parts[1] === 'auswahl' || parts[1] === 'allgemein' ? parts[1] : undefined;
    if (mode === 'auswahl') return { page: 'training', mode, filter: parseFilter(query) };
    return mode === 'allgemein' ? { page: 'training', mode, theme: parts[2] ?? 'schwaechen' } : mode ? { page: 'training', mode } : { page: 'training' };
  }
  if (parts[0] === 'brett') return parts[1] ? { page: 'brett', id: parts[1] } : { page: 'brett' };
  if (parts[0] === 'spielen') return { page: 'spielen' };
  if (parts[0] === 'statistik') return { page: 'statistik' };
  if (parts[0] === 'einstellungen') return { page: 'einstellungen' };
  if (parts[0] === 'partien') return { page: 'partien' };
  if (parts[0] === 'import') return { page: 'import' };
  return { page: 'uebersicht' };
}

export function href(route: Route): string {
  if (route.page === 'partie') return `#/partien/${encodeURIComponent(route.id)}${route.ply !== undefined ? `/${route.ply}` : ''}`;
  if (route.page === 'brett') return route.id ? `#/brett/${encodeURIComponent(route.id)}` : '#/brett';
  if (route.page === 'training' && route.mode === 'auswahl') return `#/training/auswahl${filterQuery(route.filter ?? {})}`;
  if (route.page === 'training' && route.mode) return `#/training/${route.mode}${route.mode === 'allgemein' && route.theme ? `/${route.theme}` : ''}`;
  return `#/${route.page}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
