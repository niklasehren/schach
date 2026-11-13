import { expect, test } from '@playwright/test';
import { clickSquare, mockChessCom, move, runImport, startFriendGame } from './helpers';

// Keine React-Warnungen in der Konsole (z. B. „The tag <piece> is unrecognized“ bei geschlagenen Figuren/Umwandlung)
let warnings: string[] = [];
test.beforeEach(({ page }) => {
  warnings = [];
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && /unrecognized|React|Warning:/.test(m.text())) warnings.push(m.text());
  });
});
test.afterEach(() => {
  expect(warnings).toEqual([]);
});

test('Gegen Freund: Schäfermatt mit Namen und Ergebnis', async ({ page }) => {
  await startFriendGame(page);
  for (const [from, to] of [
    ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7'],
  ]) {
    await move(page, from, to);
  }
  await expect(page.getByTestId('result')).toContainText('1-0');
  await expect(page.getByTestId('result')).toContainText('Anna gewinnt');
  await expect(page.getByTestId('result')).toContainText('durch Schachmatt');
  await expect(page.getByTestId('movelist')).toContainText('Dxf7#');
  // Anna hat einen Bauern geschlagen: +1
  await expect(page.getByTestId('player-white')).toContainText('+1');
  await page.screenshot({ path: `test-results/freund-matt-${test.info().project.name}.png` });
});

test('Gegen Freund: Aufgeben mit Rückfrage', async ({ page }) => {
  await startFriendGame(page);
  await move(page, 'e2', 'e4');
  await page.getByRole('button', { name: 'Aufgeben' }).click();
  await page.getByRole('button', { name: 'Weiterspielen' }).click();
  await expect(page.getByTestId('status')).toHaveText('Ben ist am Zug');
  await page.getByRole('button', { name: 'Aufgeben' }).click();
  await page.getByRole('button', { name: 'Ben gibt auf' }).click();
  await expect(page.getByTestId('result')).toContainText('Anna gewinnt');
  await expect(page.getByTestId('result')).toContainText('durch Aufgabe');
});

test('Züge durchblättern mit Pfeiltasten und Knöpfen', async ({ page }) => {
  await startFriendGame(page);
  await move(page, 'e2', 'e4');
  await move(page, 'd7', 'd5');
  await move(page, 'e4', 'd5');
  await expect(page.getByTestId('player-white')).toContainText('+1');

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.movelist-move.is-current')).toHaveText('d5');
  await expect(page.getByTestId('player-white')).not.toContainText('+1');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.movelist-move.is-current')).toHaveCount(0);
  // In der Vergangenheit kann nicht gezogen werden
  await clickSquare(page, 'g8');
  await clickSquare(page, 'f6');
  await expect(page.getByTestId('movelist')).not.toContainText('Sf6');

  await page.getByRole('button', { name: 'Zug vor' }).click();
  await expect(page.locator('.movelist-move.is-current')).toHaveText('e4');
  await page.keyboard.press('End');
  await expect(page.locator('.movelist-move.is-current')).toHaveText('exd5');
  await move(page, 'd8', 'd5');
  await expect(page.getByTestId('player-white')).not.toContainText('+1');
});

test('Gegen Stockfish als Schwarz: Computer eröffnet und antwortet', async ({ page }) => {
  await page.goto('/#/spielen');
  await page.getByRole('button', { name: 'Gegen Computer', exact: true }).click();
  await page.getByRole('button', { name: 'Schwarz', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Spielstärke' });
  await slider.focus();
  await slider.press('Home');
  await expect(page.locator('.strength-label')).toHaveText('Einsteiger 1/4');
  await page.getByRole('button', { name: 'Partie starten' }).click();

  // Stockfish (Weiß) zieht zuerst
  await expect(page.locator('.movelist-move')).toHaveCount(1, { timeout: 15000 });
  await expect(page.getByTestId('status')).toHaveText('Du bist am Zug');
  await expect(page.getByTestId('player-white')).toContainText('Stockfish');
  await expect(page.getByTestId('board')).toHaveClass(/orientation-black/);

  // Ein legaler Zug für Schwarz, danach antwortet Stockfish
  await move(page, 'b8', 'c6');
  await expect(page.locator('.movelist-move')).toHaveCount(3, { timeout: 15000 });
  await page.screenshot({ path: `test-results/stockfish-${test.info().project.name}.png` });

  await page.getByRole('button', { name: 'Aufgeben' }).click();
  await page.getByRole('button', { name: 'Ja, aufgeben' }).click();
  await expect(page.getByTestId('result')).toContainText('Stockfish gewinnt');
  await expect(page.getByTestId('result')).toContainText('1-0');
});

test('Startbildschirm', async ({ page }) => {
  await page.goto('/#/spielen');
  await expect(page.getByRole('heading', { name: 'Neue Partie' })).toBeVisible();
  await page.screenshot({ path: `test-results/start-${test.info().project.name}.png` });
});

test('Bauernumwandlung mit Auswahl', async ({ page }) => {
  await startFriendGame(page);
  for (const [from, to] of [
    ['h2', 'h4'], ['g7', 'g5'], ['h4', 'g5'], ['h7', 'h6'], ['g5', 'h6'], ['f8', 'g7'], ['h6', 'g7'], ['g8', 'f6'],
  ]) {
    await move(page, from, to);
  }
  await clickSquare(page, 'g7');
  await clickSquare(page, 'h8');
  await expect(page.getByRole('dialog', { name: 'Umwandlung wählen' })).toBeVisible();
  await page.getByRole('button', { name: 'Springer' }).click();
  await expect(page.getByTestId('movelist')).toContainText('gxh8=S');
  await expect(page.getByTestId('status')).toHaveText('Ben ist am Zug');
});

test('Spielstärke: Empfehlung aus der Chess.com-Wertung, eigene Wahl wird gemerkt; Farbe als Kreis', async ({ page }) => {
  // Ohne Chess.com-Partien: Einstiegs-Empfehlung statt Elo 1500
  await page.goto('/#/spielen');
  await expect(page.locator('.strength-label')).toHaveText('Einsteiger 2/4');
  await expect(page.getByTestId('strength-note')).toHaveText('Stockfish-Elo ist nicht mit einer Chess.com-Wertung vergleichbar. Empfohlen zum Einstieg: Einsteiger 2/4 (gewählt).');

  // Mit Chess.com-Partien (Wertung um 350): Einsteiger 1/4
  await mockChessCom(page);
  await runImport(page, 'testspieler');
  await expect(page.getByTestId('import-result')).toContainText('6 neue Partien');
  await page.goto('/#/spielen');
  await page.reload();
  await expect(page.locator('.strength-label')).toHaveText('Einsteiger 1/4');
  await expect(page.getByTestId('strength-note')).toContainText('nicht mit deiner Chess.com-Wertung vergleichbar. Empfohlen für dich: Einsteiger 1/4 (gewählt).');

  // Eigene Wahl bleibt nach Neuladen; Antippen der Empfehlung setzt sie wieder
  const slider = page.getByRole('slider', { name: 'Spielstärke' });
  await slider.focus();
  await slider.press('End');
  await expect(page.locator('.strength-label')).toHaveText('Elo 3000');
  await page.reload();
  await expect(page.locator('.strength-label')).toHaveText('Elo 3000');
  await page.getByTestId('strength-recommended').click();
  await expect(page.locator('.strength-label')).toHaveText('Einsteiger 1/4');
  await page.reload();
  await expect(page.locator('.strength-label')).toHaveText('Einsteiger 1/4');

  // Farbe der Spieler als gefüllter Kreis
  const dot = page.getByTestId('player-white').locator('.color-dot');
  await expect(dot).toHaveAttribute('data-color', 'white');
  await expect(dot).toHaveClass(/rounded-full/);
});
