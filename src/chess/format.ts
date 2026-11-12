import type { GameRecord, Termination } from '../db/schema';

/** Chess.com-Zeitkontrolle lesbar: „600“ → „10 min“, „180+2“ → „3+2“, „1/86400“ → „1 Tag“ */
export function formatTimeControl(tc: string | null | undefined): string {
  if (!tc) return '–';
  const daily = tc.match(/^1\/(\d+)$/);
  if (daily) {
    const days = Math.round(Number(daily[1]) / 86400);
    return days === 1 ? '1 Tag' : `${days} Tage`;
  }
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return tc;
  const base = Number(m[1]);
  const inc = m[2];
  const baseText = base % 60 === 0 ? String(base / 60) : base < 60 ? `${base} s` : String(Math.round((base / 60) * 10) / 10).replace('.', ',');
  if (inc !== undefined) return `${baseText}+${inc}`;
  return base < 60 ? baseText : `${baseText} min`;
}

/** Grundzeit in Sekunden (für die Uhr vor dem ersten Zug), sonst null */
export function baseSeconds(tc: string | null | undefined): number | null {
  const m = tc?.match(/^(\d+)(?:\+\d+)?$/);
  return m ? Number(m[1]) : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${formatDate(ms)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const terminationText: Record<Termination, string> = {
  checkmate: 'Schachmatt',
  resign: 'Aufgabe',
  timeout: 'Zeitüberschreitung',
  abandoned: 'Partie verlassen',
  stalemate: 'Patt',
  repetition: 'Stellungswiederholung',
  insufficient: 'zu wenig Material',
  fiftyMoves: '50-Züge-Regel',
  agreement: 'Einigung',
  timeoutVsInsufficient: 'Zeit, aber zu wenig Material',
  other: 'sonstiges',
};

export const myResultText: Record<'win' | 'loss' | 'draw', string> = { win: 'Sieg', loss: 'Niederlage', draw: 'Remis' };

export const sourceText: Record<GameRecord['source'], string> = { app: 'App', chesscom: 'Chess.com', brett: 'Brett' };

export function scoreText(result: GameRecord['result']): string {
  return result === '1/2-1/2' ? '½-½' : result;
}

/** „[%clk 0:09:58.9]“ → 598.9 Sekunden */
export function parseClock(comment: string | undefined): number | null {
  const m = comment?.match(/\[%clk\s+(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\]/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Restzeit anzeigen: „9:58“, „1:02:03“, unter 10 s mit Zehnteln („0:08,4“) */
export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  if (s < 10) return `0:${pad(sec)},${Math.floor((s * 10) % 10)}`;
  return `${m}:${pad(sec)}`;
}
