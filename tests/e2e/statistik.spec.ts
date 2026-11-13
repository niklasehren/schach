import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/${name}-${test.info().project.name}.png`, fullPage: true });
const DAY = 86_400_000;

/**
 * Erfundene, schon analysierte Partien (keine echten Gegnernamen im Repo):
 * 12 mit Weiß (8 Siege, ohne Patzer), 12 mit Schwarz in Französisch (3 Siege, je 2 Patzer, entscheidend im Mittelspiel),
 * dazu 1 Puzzle aus dem Mittelspiel-Patzer einer Schwarz-Partie.
 */
function backup(chesscomName: string | null) {
  const now = Date.now();
  const pgn = '1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5';
  const mv = (ply: number, winBefore: number, winAfter: number, o: Record<string, unknown> = {}) => {
    const loss = Math.max(0, winBefore - winAfter);
    return { ply, san: 'e4', uci: 'e2e4', winBefore, winAfter, loss, class: loss >= 15 ? 'blunder' : undefined, phase: 'opening', hanging: false, missedMate: false, allowedMate: false, clock: 500, timeTrouble: false, ...o };
  };
  const games: unknown[] = [];
  const analyses: unknown[] = [];
  for (let i = 0; i < 24; i++) {
    const white = i < 12;
    const win = white ? i < 8 : i < 15;
    const id = `syn-${i}`;
    const me = white ? 'white' : 'black';
    const myResult = win ? 'win' : 'loss';
    const result = (white && win) || (!white && !win) ? '1-0' : '0-1';
    games.push({
      id, userId: null, createdAt: 0, updatedAt: 0, date: now - (i % 20) * DAY - 3600_000, source: 'chesscom', mode: 'online',
      white: { name: white ? 'Ich' : `Gegner${i}`, rating: 400 }, black: { name: white ? `Gegner${i}` : 'Ich', rating: 400 },
      myColor: me, myResult, result, termination: 'resign', timeControl: '600', timeClass: 'rapid', rated: true,
      eco: white ? 'B20' : 'C01', pgn, plies: 8, externalId: `https://example.org/${id}`,
    });
    // Meine Züge: bei Schwarz zwei Patzer im Mittelspiel (der zweite entscheidet in Niederlagen)
    const mine = white
      ? [mv(1, 50, 50), mv(3, 52, 52), mv(5, 55, 55), mv(7, 58, 58)]
      : [mv(2, 50, 50), mv(4, 60, 30, { phase: 'middlegame', errorType: 'pieceTaken' }), mv(6, 45, 45), mv(8, win ? 70 : 45, win ? 70 : 20, { phase: 'middlegame', errorType: 'threatMissed' })];
    const theirs = (white ? [2, 4, 6, 8] : [1, 3, 5, 7]).map((p) => mv(p, 50, 50));
    analyses.push({
      gameId: id, createdAt: 0, updatedAt: 0, status: 'done', engine: 'test', limit: { depth: 16 },
      evals: Array.from({ length: 9 }, () => ({ cp: 20, depth: 16 })), myColor: me, timeClass: 'rapid', baseTime: 600,
      sides: { white: white ? mine : theirs, black: white ? theirs : mine },
      summary: { white: { blunders: 0 }, black: { blunders: white ? 0 : 2 } }, ms: 0, errorTypesVersion: 1,
    });
  }
  const puzzles = [
    {
      id: 'syn-20:4', userId: null, createdAt: 0, gameId: 'syn-20', gameDate: now, ply: 4,
      fen: 'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2', fenKey: 'x', played: 'g8e7', line: ['d7d5'],
      class: 'blunder', winBefore: 60, box: 0, due: null, firstSeen: null,
    },
  ];
  const settings: unknown[] = [{ key: 'analysisPaused', value: true }];
  if (chesscomName) settings.push({ key: 'chesscomUsername', value: chesscomName });
  return { format: 'schach-backup', version: 1, exportedAt: new Date().toISOString(), tables: { games, analyses, puzzles, attempts: [], settings } };
}

async function load(page: Page, chesscomName: string | null) {
  await page.route('https://api.chess.com/**', (r) => r.abort());
  await page.goto('/#/import');
  await page.getByTestId('backup-file').setInputFiles({ name: 'sicherung.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup(chesscomName))) });
  await expect(page.getByTestId('backup-message')).toBeVisible();
}

const nav = (page: Page) => page.getByRole('navigation', { name: test.info().project.name === 'handy' ? 'Hauptnavigation unten' : 'Hauptnavigation', exact: true });

test('Statistik: Vermutungen mit Urteil und Anzahl Partien, Einzelheiten, Filter, Aktion führt ins gefilterte Training', async ({ page }) => {
  await load(page, 'niklasehren');
  await nav(page).getByRole('link', { name: 'Statistik' }).click();
  await expect(page).toHaveURL(/#\/statistik$/);
  await expect(nav(page).getByRole('link', { name: 'Statistik' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('stats-count')).toHaveText('24 Partien in den letzten 4 Wochen, alle analysiert.');

  // Fünf Vermutungen des Besitzers, jede mit Urteil
  const hyp = page.getByTestId('hypothesis');
  await expect(hyp).toHaveCount(5);
  const color = hyp.filter({ hasText: 'Mit Weiß spiele ich besser' });
  await expect(color).toHaveAttribute('data-verdict', 'stimmt');
  await expect(color.getByTestId('verdict')).toHaveText('Stimmt');
  await expect(color.getByTestId('hypothesis-summary')).toHaveText('Mit Weiß holst du 67 % der Punkte (12 Partien), mit Schwarz 25 % (12 Partien). Patzer pro Partie: 0,0 gegenüber 1,8.');
  // Endspiel: entscheidend war das Mittelspiel (Weiß-Niederlagen ohne Patzer: ohne entscheidenden Fehler), davor durch Übersehen → teilweise
  const phase = hyp.filter({ hasText: 'Endspiel' });
  await expect(phase).toHaveAttribute('data-verdict', 'teilweise');
  await expect(phase.getByTestId('hypothesis-summary')).toHaveText(
    'In 13 Niederlagen lag der entscheidende Fehler so: Eröffnung 0, Mittelspiel 9, Endspiel 0; 4 ohne einzelnen entscheidenden Fehler. Von den 9 entscheidenden Fehlern vor dem Endspiel waren 9 Übersehen, am häufigsten „Material eingestellt“.',
  );
  // Zeitnot: keine Partie in Zeitnot → noch zu wenig Daten
  await expect(hyp.filter({ hasText: 'Zeitnot' })).toHaveAttribute('data-verdict', 'zuWenig');
  await expect(hyp.filter({ hasText: 'Zeitnot' }).getByTestId('verdict')).toHaveText('Noch zu wenig Daten');
  // Französisch: nur Französisch mit Schwarz, keine anderen Schwarz-Partien → zu wenig
  await expect(hyp.filter({ hasText: 'Französisch' })).toHaveAttribute('data-verdict', 'zuWenig');
  await expect(hyp.filter({ hasText: 'Französisch' }).getByTestId('hypothesis-summary')).toContainText('bisher 12 Partien analysiert, andere mit Schwarz 0');
  // Fortschritt: alles aus den letzten 2–3 Wochen … ohne ein Davor mit 10 Partien kein Urteil
  await expect(hyp.filter({ hasText: 'besser' }).last()).toHaveAttribute('data-verdict', 'zuWenig');

  // Einzelheiten mit Anzahl Partien
  await expect(page.getByTestId('stats-farbe')).toContainText('Weiß');
  await expect(page.getByTestId('stats-phase')).toContainText('9 von 13');
  await expect(page.getByTestId('openings-black')).toContainText('Französisch');
  await expect(page.getByTestId('openings-white')).toContainText('Sizilianisch');
  await expect(page.getByTestId('progress-weeks')).toContainText('Partien je Woche:');
  await expect(page.getByTestId('no-board')).toBeVisible();
  await shot(page, 'statistik');

  // Filter: Zeitklasse und Zeitraum
  await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: 'Alles' }).click();
  await expect(page.getByTestId('stats-count')).toHaveText('24 Partien insgesamt, alle analysiert.');
  await page.reload();
  await expect(page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: 'Alles' })).toHaveAttribute('aria-pressed', 'true');

  // Aktion: aus der Phase-Erkenntnis ins gefilterte Training (Mittelspiel)
  await phase.getByTestId('stats-action').click();
  await expect(page).toHaveURL(/#\/training\/auswahl\?phase=middlegame$/);
  await expect(page.getByTestId('puzzle-status')).toHaveText('Mittelspiel: noch 0');
  await page.goBack();
  // Französisch-Aktion: das Puzzle aus der Französisch-Partie
  await hyp.filter({ hasText: 'Französisch' }).getByTestId('stats-action').click();
  await expect(page).toHaveURL(/eroeffnung=French\+Defense&farbe=black/);
  await expect(page.getByTestId('puzzle-status')).toHaveText('Französisch mit Schwarz: noch 0');
});

test('Training: Meine Fehler nach Phase, Farbe, Eröffnung und Zeitnot filtern', async ({ page }) => {
  await load(page, null);
  await page.goto('/#/training');
  const f = page.getByTestId('puzzle-filter');
  await expect(f.getByTestId('filter-start')).toHaveText('1 Puzzle üben');
  await f.getByRole('group', { name: 'Spielphase' }).getByRole('button', { name: 'Endspiel' }).click();
  await expect(f.getByTestId('filter-empty')).toBeVisible();
  await f.getByRole('group', { name: 'Zeitnot' }).getByRole('button', { name: 'Nur in Zeitnot' }).click();
  await expect(f.getByTestId('filter-empty')).toBeVisible();
  await f.getByRole('group', { name: 'Zeitnot' }).getByRole('button', { name: 'Egal' }).click();
  await page.goto('/#/training/auswahl?phase=endgame');
  await expect(page.getByTestId('filter-none')).toContainText('Auswahl: Endspiel');
  await page.goBack();
  await f.getByRole('group', { name: 'Spielphase' }).getByRole('button', { name: 'Alle' }).click();
  await f.getByRole('group', { name: 'Farbe' }).getByRole('button', { name: 'Schwarz' }).click();
  await f.getByTestId('filter-opening').selectOption({ label: 'Französisch (1)' });
  await expect(f).toContainText('Auswahl: Französisch mit Schwarz');
  await f.getByTestId('filter-start').click();
  await expect(page).toHaveURL(/#\/training\/auswahl\?eroeffnung=French\+Defense&farbe=black$/);
  await expect(page.getByRole('heading', { name: 'Finde einen besseren Zug' })).toBeVisible();
});

test('Freunde starten ohne Vermutungen; Vorschlag übernehmen, eigene anlegen, bearbeiten, löschen', async ({ page }) => {
  await load(page, 'freund');
  await page.goto('/#/statistik');
  await expect(page.getByTestId('hypothesis')).toHaveCount(0);
  await page.getByTestId('edit-hypotheses').click();
  await expect(page).toHaveURL(/#\/einstellungen$/);
  const s = page.getByTestId('hypotheses-settings');
  await expect(s.getByTestId('hypothesis-item')).toHaveCount(0);
  await expect(s.getByTestId('suggestions').getByRole('listitem')).toHaveCount(5);
  await s.getByTestId('suggestions').getByRole('listitem').filter({ hasText: 'Mit Weiß' }).getByRole('button', { name: 'Übernehmen' }).click();
  await expect(s.getByTestId('hypothesis-item')).toHaveCount(1);

  // Eigene: Eröffnung Sizilianisch mit Weiß liegt mir nicht
  await s.getByTestId('add-opening').click();
  const ed = s.getByTestId('hypothesis-editor');
  await ed.getByLabel('Eröffnung').selectOption({ label: 'Sizilianisch' });
  await ed.getByRole('group', { name: 'Farbe' }).getByRole('button', { name: 'Weiß' }).click();
  await ed.getByRole('group', { name: 'Liegt mir' }).getByRole('button', { name: 'Nein' }).click();
  await expect(ed.getByTestId('hypothesis-text')).toHaveValue('Sizilianisch liegt mir als Weiß nicht');
  await ed.getByTestId('hypothesis-save').click();
  await expect(s.getByTestId('hypothesis-item')).toHaveCount(2);
  await shot(page, 'vermutungen');

  // Text ändern
  await s.getByRole('button', { name: '„Sizilianisch liegt mir als Weiß nicht“ bearbeiten' }).click();
  await s.getByTestId('hypothesis-text').fill('Gegen Sizilianisch tue ich mich schwer');
  await s.getByTestId('hypothesis-save').click();
  await expect(s.getByTestId('hypothesis-item').nth(1)).toContainText('Gegen Sizilianisch tue ich mich schwer');

  // In der Statistik: Weiß-Partien sind alle Sizilianisch, keine anderen mit Weiß → zu wenig Daten
  await page.goto('/#/statistik');
  await expect(page.getByTestId('hypothesis')).toHaveCount(2);
  await expect(page.getByTestId('hypothesis').nth(1)).toHaveAttribute('data-verdict', 'zuWenig');

  // Löschen
  await page.goto('/#/einstellungen');
  await s.getByRole('button', { name: '„Mit Weiß spiele ich besser“ löschen' }).click();
  await expect(s.getByTestId('hypothesis-item')).toHaveCount(1);
  await page.reload();
  await expect(s.getByTestId('hypothesis-item')).toHaveCount(1);
});
