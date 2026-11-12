/** Darstellung (pro Gerät): dunkel ist Standard, hell per Schalter; Brett-Theme wählbar */
export type Theme = 'dark' | 'light';
export type BoardTheme = 'walnuss' | 'schiefer' | 'gruen';

export const BOARD_THEMES: { id: BoardTheme; label: string; light: string; dark: string }[] = [
  { id: 'walnuss', label: 'Walnuss', light: '#eedcb9', dark: '#a9774c' },
  { id: 'schiefer', label: 'Schiefer', light: '#dfe7f1', dark: '#7690b4' },
  { id: 'gruen', label: 'Turniergrün', light: '#eeeed2', dark: '#6f8f52' },
];

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // privates Fenster: nur für diese Sitzung
  }
};

export const getTheme = (): Theme => (read('schach.theme') === 'light' ? 'light' : 'dark');
export const getBoardTheme = (): BoardTheme => {
  const v = read('schach.board');
  return v === 'schiefer' || v === 'gruen' ? v : 'walnuss';
};

/** Gestaltung: „klubhaus“ (Grün/Messing) oder „b0“ (shadcn-Preset unverändert) – nur für den Vergleich */
export const getSkin = (): 'klubhaus' | 'b0' => (read('schach.skin') === 'b0' ? 'b0' : 'klubhaus');

export function applyTheme(theme = getTheme(), board = getBoardTheme()) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.skin = getSkin();
  // shadcn schaltet den dunklen Modus über die Klasse „dark“
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.dataset.board = board;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f2ede3' : '#121519');
}

export function setTheme(theme: Theme) {
  write('schach.theme', theme);
  applyTheme(theme, getBoardTheme());
}

export function setBoardTheme(board: BoardTheme) {
  write('schach.board', board);
  applyTheme(getTheme(), board);
}
