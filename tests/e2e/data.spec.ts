import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { mockChessCom, move, runImport, startFriendGame } from './helpers';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/${name}-${test.info().project.name}.png`, fullPage: true });

test('App-Partie wird bei Matt gespeichert und ist nach Neuladen in der Liste', async ({ page }) => {
  await startFriendGame(page);
  for (const [from, to] of [
    ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7'],
  ]) {
    await move(page, from, to);
  }
  await expect(page.getByTestId('saved')).toBeVisible();

  await page.reload();
  await page.getByRole('link', { name: 'Partien', exact: true }).click();
  const row = page.getByTestId('game-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Anna – Ben');
  await expect(row).toContainText('1-0');
  await expect(row).toContainText('App');
  await shot(page, 'partien-app');

  await row.click();
  await expect(page.getByTestId('game-header')).toContainText('Anna gewinnt');
  await expect(page.getByTestId('game-header')).toContainText('durch Schachmatt');
  // Ansicht startet bei der Grundstellung (vor Zug 1); Zugliste im Reiter „Züge“
  await page.getByTestId('tab-zuege').click();
  await expect(page.locator('.movelist-move.is-current').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Zum Anfang' })).toBeDisabled();
  // Nur ansehen: Durchblättern geht
  await page.keyboard.press('End');
  await expect(page.locator('.movelist-move.is-current').filter({ visible: true })).toHaveText(/^Dxf7#/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.movelist-move.is-current').filter({ visible: true })).toHaveText(/^Sf6/);

  // Nebenaktionen im „…“-Menü
  const download = page.waitForEvent('download');
  await page.getByTestId('more-menu').click();
  await page.getByRole('menuitem', { name: 'PGN exportieren' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Anna-Ben-\d{4}-\d{2}-\d{2}\.pgn$/);
  const pgn = readFileSync((await file.path())!, 'utf8');
  expect(pgn).toContain('[White "Anna"]');
  expect(pgn).toContain('4. Qxf7# 1-0');
});

test('Aufgabe gegen Computer wird als Niederlage gespeichert', async ({ page }) => {
  await page.goto('/#/spielen');
  await page.getByRole('radio', { name: 'Gegen Computer' }).click();
  await page.getByRole('radio', { name: 'Weiß' }).click();
  await page.getByRole('button', { name: 'Partie starten' }).click();
  await move(page, 'e2', 'e4');
  await expect(page.locator('.movelist-move')).toHaveCount(2, { timeout: 15000 });
  await page.getByRole('button', { name: 'Aufgeben' }).click();
  await page.getByRole('button', { name: 'Ja, aufgeben' }).click();
  await expect(page.getByTestId('saved')).toBeVisible();
  await page.getByTestId('saved').click();
  await expect(page.getByTestId('game-header')).toContainText('Niederlage');
  await expect(page.getByTestId('game-header')).toContainText('durch Aufgabe');
  await page.getByRole('link', { name: 'Partien', exact: true }).click();
  await expect(page.getByTestId('game-row')).toContainText('Niederlage');
  await expect(page.getByTestId('game-row')).toContainText('Stockfish');
});

test('Chess.com-Import mit nachgestellter API, erneuter Import holt nur Neues', async ({ page }) => {
  const calls = await mockChessCom(page);
  await runImport(page, 'TestSpieler');
  await expect(page.getByTestId('import-result')).toContainText('6 neue Partien importiert');
  await expect(page.getByTestId('import-result')).toContainText('3 Monate durchsucht');
  await expect(page.getByTestId('import-result')).toContainText('1 Variante übersprungen');
  await shot(page, 'import-fertig');
  // Monate nacheinander, neueste zuerst
  expect(calls.map((u) => new URL(u).pathname.split('/games/')[1])).toEqual(['archives', '2026/11', '2026/10', '2026/06']);

  await page.getByRole('link', { name: 'Zur Partienliste' }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(6);
  await page.getByRole('radio', { name: 'App' }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Chess.com' }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(6);
  await shot(page, 'partien-chesscom');

  // Niederlage als Schwarz gegen Gegner1 (Rating 175) öffnen: Brett aus meiner Sicht, Restzeiten sichtbar
  const lost = page.getByTestId('game-row').filter({ hasText: 'Gegner1' });
  await expect(lost).toContainText('Niederlage');
  await expect(lost).toContainText('10 min');
  await lost.click();
  await expect(page.getByTestId('board').filter({ visible: true })).toHaveClass(/orientation-black/);
  await expect(page.getByTestId('game-header')).toContainText('D00');
  await expect(page.getByTestId('clock-white')).toBeVisible();
  // Start bei der Grundstellung: volle Grundzeit
  await expect(page.getByTestId('clock-white')).toHaveText('10:00');
  await page.getByRole('button', { name: 'Zug vor' }).click();
  await page.getByRole('button', { name: 'Zug vor' }).click();
  await page.getByRole('button', { name: 'Zug vor' }).click();
  await expect(page.getByTestId('clock-white')).toHaveText('9:58');
  await shot(page, 'partie-chesscom');

  // Name ist gespeichert; zweiter Import findet nichts Neues
  await page.reload();
  await page.getByRole('link', { name: 'Import' }).click();
  await expect(page.getByLabel('Chess.com-Benutzername')).toHaveValue('TestSpieler');
  await page.getByRole('radio', { name: 'Alle' }).click();
  await page.getByRole('button', { name: 'Partien importieren' }).click();
  await expect(page.getByTestId('import-result')).toContainText('Keine neuen Partien');
  await expect(page.getByTestId('import-result')).toContainText('6 schon vorhanden');
});

test('Import: verständliche Fehlermeldungen', async ({ page }) => {
  await mockChessCom(page, { '/pub/player/testspieler/games/2026/10': 429 });
  await runImport(page, 'gibtsnicht');
  await expect(page.getByTestId('import-error')).toContainText('Den Benutzer „gibtsnicht“ gibt es auf Chess.com nicht');
  await shot(page, 'import-fehler');

  // Zu viele Anfragen (nach einem zweiten Versuch); Bisheriges bleibt gespeichert
  await page.getByLabel('Chess.com-Benutzername').fill('testspieler');
  await page.getByRole('button', { name: 'Partien importieren' }).click();
  await expect(page.getByTestId('import-error')).toContainText('zu viele Anfragen', { timeout: 15000 });
  await expect(page.getByTestId('import-error')).toContainText('4 neue Partien wurden vorher schon gespeichert');

  // Kein Internet
  await page.unroute('https://api.chess.com/**');
  await page.route('https://api.chess.com/**', (r) => r.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Partien importieren' }).click();
  await expect(page.getByTestId('import-error')).toContainText('Keine Verbindung zu Chess.com');
});

test('Datensicherung: Export und Import auf einem „anderen Gerät“', async ({ page, browser }) => {
  await mockChessCom(page);
  await runImport(page, 'testspieler');
  await expect(page.getByTestId('import-result')).toContainText('6 neue Partien');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Alle Daten sichern' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^schach-sicherung-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByTestId('backup-message')).toContainText('6 Partien');
  const path = (await file.path())!;

  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page2 = await other.newPage();
  await page2.goto('/#/import');
  await page2.getByTestId('backup-file').setInputFiles(path);
  await expect(page2.getByTestId('backup-message')).toContainText('6 Partien übernommen');
  await page2.goto('/#/partien');
  await expect(page2.getByTestId('game-row')).toHaveCount(6);
  await other.close();
});
