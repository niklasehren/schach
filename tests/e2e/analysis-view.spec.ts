import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/${name}-${test.info().project.name}.png`, fullPage: true });
const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true });

/** Chess.com liefert genau die Partie vom 12.11. (1. d4 d5 2. Sc3 Sf6 3. e4 dxe4 4. f3 exf3 5. Dxf3 Sc6 6. Lb5 Lg4 7. Df1?? …) */
async function importZwischenzug(page: Page) {
  const month = readFileSync(new URL('../fixtures/chesscom-zwischenzug.json', import.meta.url), 'utf8');
  await page.route('https://api.chess.com/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/archives') ? JSON.stringify({ archives: ['https://api.chess.com/pub/player/testspieler/games/2026/11'] }) : month;
    return route.fulfill({ status: 200, contentType: 'application/json', body, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/#/import');
  await page.getByLabel('Chess.com-Benutzername').fill('testspieler');
  await page.getByRole('button', { name: 'Partien importieren' }).click();
  await expect(page.getByTestId('import-result')).toContainText('1 neue Partie');
  await page.getByRole('link', { name: 'Partien', exact: true }).click();
  // Echte Analyse mit Standardtiefe 16
  await expect(page.getByTestId('analysis-count')).toHaveText('Alle Partien analysiert', { timeout: 90000 });
  await page.getByTestId('game-row').click();
  await expect(page.getByTestId('analysis-summary')).toBeVisible();
}

test('Zwischenzug 7. Lxc6+: Pfeile, Erklärung mit Schach, Variante zum Durchklicken', async ({ page }) => {
  test.setTimeout(150000);
  await importZwischenzug(page);

  // Stellung nach 6...Lg4 (Halbzug 12) über die Zugliste (Reiter „Züge“), Erklärung im Reiter „Fehler“
  await page.getByTestId('tab-zuege').click();
  await visible(page, '.movelist-move').filter({ hasText: /^Lg4/ }).click();
  await page.getByTestId('tab-fehler').click();
  const board = page.getByTestId('board').filter({ visible: true });
  await expect(board).toHaveAttribute('data-arrows', /good:b5c6/);
  await expect(board).toHaveAttribute('data-arrows', /bad:f3f1/);
  // Pfeile sind wirklich gezeichnet (SVG-Linien von chessground)
  await expect(board.locator('svg.cg-shapes line, svg.cg-shapes path').first()).toBeAttached();

  const card = page.getByTestId('error-card');
  await expect(card).toContainText('7. Df1??');
  await expect(card).toContainText('Patzer');
  await expect(card).toContainText('besser: Läufer von b5 nach c6');
  const better = page.getByTestId('explain-better');
  await expect(better).toContainText('schlägt dein Läufer von b5 aus den Springer auf c6 (Lxc6+), und zwar mit Schach');
  await expect(better).toContainText('Er hat keine Zeit, deine Dame zu schlagen');
  await expect(page.getByTestId('explain-played')).toContainText('dein Bauer auf d4 bleibt ungedeckt');
  await expect(page.getByTestId('explain-played')).toContainText('einen weiteren Bauern');
  await expect(page.getByTestId('win-words')).toContainText('Vorher ausgeglichen, danach klar schlechter für dich');
  await expect(page.getByTestId('merke')).toHaveText('Merke: Wird eine deiner Figuren angegriffen, schau zuerst, ob du Schach geben oder etwas schlagen kannst.');

  // Fachbegriff antippen zeigt die Erklärung (am Handy per Tippen), nochmal antippen schließt sie
  const term = better.getByTestId('term').filter({ hasText: 'Zwischenzug' });
  const touch = !!test.info().project.use.hasTouch;
  await (touch ? term.tap() : term.click());
  await expect(better.getByTestId('term-def')).toContainText('Zwischenzug: Ein Zug, auf den der Gegner sofort reagieren muss');
  await expect(term).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(300);
  await shot(page, 'begriff');
  await (touch ? term.tap() : term.click());
  await expect(better.getByTestId('term-def')).toHaveCount(0);
  await page.waitForTimeout(400);
  await shot(page, 'fehler-pfeile');

  // Beste Fortsetzung: beginnt mit Lxc6+, als Variante gekennzeichnet
  await page.getByTestId('show-line').click();
  const line = page.getByTestId('variation');
  await expect(line).toContainText('Variante (Engine)');
  await expect(line).toContainText('nicht gespielt');
  await expect(page.getByTestId('variation-move').first()).toHaveText('Lxc6+');
  expect(await page.getByTestId('variation-move').count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.variation-badge').filter({ visible: true })).toBeVisible();
  await expect(page.locator('.variation-card .movelist-move.is-current')).toHaveText('Lxc6+');
  // nächster Zug der Variante als Pfeil: bxc6
  await expect(board).toHaveAttribute('data-arrows', 'good:b7c6');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.variation-card .movelist-move.is-current')).toHaveText('bxc6');
  await page.getByRole('button', { name: 'Variante vor' }).click();
  await expect(page.locator('.variation-card .movelist-move.is-current')).toHaveText('Dxc6+');
  await expect(board).toHaveAttribute('data-arrows', 'good:g4d7');
  await page.waitForTimeout(400);
  await shot(page, 'variante');
  await page.getByTestId('close-line').click();
  await expect(line).toHaveCount(0);
  await expect(board).toHaveAttribute('data-arrows', /good:b5c6/);
  await page.getByTestId('tab-zuege').click();
  await expect(visible(page, '.movelist-move.is-current')).toHaveText(/^Lg4/);

  // 14. Se5?? nach 13...h6: zuerst die übersehene Drohung, dann „Le3 rettet und deckt d4“
  await visible(page, '.movelist-row').nth(12).locator('.movelist-move').nth(1).click();
  await expect(visible(page, '.movelist-move.is-current')).toHaveText(/^h6/);
  await page.getByTestId('tab-fehler').click();
  await expect(page.getByTestId('error-card')).toContainText('14. Se5');
  await expect(page.getByTestId('explain-played').locator('li').first()).toContainText('Der Bauer auf h6 greift deinen Läufer auf g5 an');
  await expect(page.getByTestId('explain-better')).toContainText('löst zwei Probleme auf einmal: Dein Läufer ist in Sicherheit, und er deckt jetzt den Bauern auf d4');
  await expect(page.getByTestId('merke')).toContainText('Was greift er an?');
  await page.waitForTimeout(400);
  await shot(page, 'drohung');

  // 15. Dxc6+?? nach 14...Dd8: das Schach bringt nichts – Merksatz passt zum gespielten Zug
  await page.getByTestId('tab-zuege').click();
  await visible(page, '.movelist-row').nth(13).locator('.movelist-move').nth(1).click();
  await expect(visible(page, '.movelist-move.is-current')).toHaveText(/^Dd8/);
  await page.getByTestId('tab-fehler').click();
  await expect(page.getByTestId('error-card')).toContainText('15. Dxc6+');
  await expect(page.getByTestId('explain-played').locator('li').first()).toContainText(/Dein Schach hilft hier nicht: Schwarz stellt den Läufer von [a-h][1-8] nach d7 dazwischen \(Ld7\) und greift damit deine Dame an/);
  await expect(page.getByTestId('merke')).toHaveText('Merke: Ein Schach ist nur gut, wenn danach etwas für dich herausspringt. Prüfe vorher, wie der Gegner antworten kann.');
  await page.waitForTimeout(400);
  await shot(page, 'schach-bringt-nichts');
});

test('Bewertungsbalken, Kurve mit Fehlerpunkten, Nächster Fehler', async ({ page }) => {
  test.setTimeout(150000);
  await importZwischenzug(page);
  await expect(page.getByTestId('evalbar').filter({ visible: true })).toBeVisible();
  await page.getByTestId('tab-verlauf').click();
  const chart = page.getByTestId('evalchart');
  await expect(chart).toBeVisible();
  expect(await chart.locator('circle.evalchart-dot').count()).toBeGreaterThan(0);

  // Klick auf einen Fehlerpunkt springt zu diesem Zug
  const dot = chart.locator('circle.evalchart-dot').first();
  const ply = Number(await dot.getAttribute('data-ply'));
  await dot.click();
  await expect(chart).toHaveAttribute('aria-valuenow', String(ply));
  await page.waitForTimeout(300);
  await shot(page, 'verlauf');
  await page.getByTestId('tab-zuege').click();
  await expect(visible(page, '.movelist-move.is-current')).toHaveAttribute('data-mark', /.+/);

  // Zum ersten Fehler, dann Nächster Fehler (unter dem Brett): jeweils Stellung vor einem Fehler/Patzer
  await page.getByTestId('tab-fehler').click();
  await page.getByTestId('first-error').click();
  await expect(page.getByTestId('error-card')).toBeVisible();
  await page.getByTestId('tab-verlauf').click();
  const first = Number(await chart.getAttribute('aria-valuenow'));
  await page.getByTestId('next-error').click();
  // „Nächster Fehler“ springt in den Reiter „Fehler“; Kurve wieder öffnen
  await expect(page.getByTestId('error-card')).toBeVisible();
  await page.getByTestId('tab-verlauf').click();
  await expect(chart).not.toHaveAttribute('aria-valuenow', String(first));
  const second = Number(await chart.getAttribute('aria-valuenow'));
  expect(second).toBeGreaterThan(first);
  await page.getByTestId('tab-fehler').click();
  await expect(page.getByTestId('error-card')).toContainText(/Patzer|Fehler/);
  await shot(page, 'kurve');
});
