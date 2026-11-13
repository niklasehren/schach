import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/${name}-${test.info().project.name}.png`, fullPage: true });

test('Brettpartie in wenigen Schritten eintragen, in der Liste finden, Filter „Brett“, bearbeiten und löschen', async ({ page }) => {
  await page.goto('/#/');
  // Übersicht ohne Partien: Knopf im Willkommens-Bereich
  await page.getByRole('link', { name: 'Brettpartie eintragen' }).first().click();
  await expect(page.getByRole('heading', { name: 'Brettpartie eintragen' })).toBeVisible();
  await expect(page.getByTestId('board-save')).toBeDisabled();

  // Eintrag: 4 Antipper + Name + Speichern
  const t0 = Date.now();
  await page.getByRole('group', { name: 'Ergebnis' }).getByRole('button', { name: 'Niederlage' }).click();
  await page.getByRole('group', { name: 'Meine Farbe' }).getByRole('button', { name: 'Schwarz' }).click();
  await page.getByLabel('Gegner', { exact: true }).fill('Lena');
  await page.getByRole('group', { name: 'Entschieden in' }).getByRole('button', { name: 'Mittelspiel' }).click();
  await page.getByRole('group', { name: 'Hauptgründe' }).getByRole('button', { name: 'Figur eingestellt' }).click();
  await page.getByRole('group', { name: 'Hauptgründe' }).getByRole('button', { name: 'Zeitnot' }).click();
  await expect(page.getByRole('group', { name: 'Anlass' }).getByRole('button', { name: 'Schülerliga' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Heute' })).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'brett-eintrag');
  await page.getByTestId('board-save').click();
  expect(Date.now() - t0).toBeLessThan(10_000);

  // Liste: Eintrag mit Badge „Brett“, ohne Analyse-Symbol
  await expect(page).toHaveURL(/#\/partien$/);
  const row = page.getByTestId('game-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Niederlage');
  await expect(row).toContainText('Lena');
  await expect(row).toContainText('Schülerliga');
  await expect(row.getByTestId('board-badge')).toHaveText('Brett');
  await expect(row.getByTestId('status-open')).toHaveCount(0);
  // Keine Analyse für Einträge ohne Züge
  await expect(page.getByTestId('analysis-count')).toHaveCount(0);

  // Zweiter Eintrag mit Zügen, Gegner aus den Vorschlägen
  await page.getByRole('link', { name: 'Brettpartie eintragen' }).click();
  await page.getByTestId('opponent-suggestions').getByRole('button', { name: 'Lena' }).click();
  await expect(page.getByLabel('Gegner', { exact: true })).toHaveValue('Lena');
  await page.getByRole('group', { name: 'Ergebnis' }).getByRole('button', { name: 'Sieg' }).click();
  await page.getByRole('group', { name: 'Meine Farbe' }).getByRole('button', { name: 'Weiß' }).click();
  await page.getByRole('button', { name: 'Züge einfügen (PGN)' }).click();
  // Ungültiger Zug → Meldung mit Zugnummer; danach deutsche Schreibweise (gemischt mit englisch)
  await page.getByLabel('Züge (PGN)').fill('1. e4 e5 2. Lc4 Sf5');
  await page.getByTestId('board-save').click();
  await expect(page.getByTestId('board-error')).toHaveText('Zug 2 … Sf5 (Schwarz) ist in dieser Stellung nicht möglich.');
  await page.getByLabel('Züge (PGN)').fill('1. e4 e5 2. Lc4 Nc6 3. Dh5 Sf6 4. Dxf7#');
  await page.getByTestId('board-save').click();
  // Mit Zügen geht es direkt zur Partie
  await expect(page.getByTestId('game-header')).toContainText('Sieg');
  await expect(page.getByTestId('board-info')).toContainText('Schülerliga');
  // Zugliste zeigt die Züge (deutsch, wie überall in der App)
  await page.getByTestId('tab-zuege').click();
  await page.keyboard.press('End');
  await expect(page.locator('.movelist-move.is-current').filter({ visible: true })).toHaveText(/^Dxf7#/);

  // Filter „Brett“ zeigt nur Brettpartien
  await page.getByRole('link', { name: 'Partien', exact: true }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Chess.com' }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Brett', exact: true }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(2);
  await shot(page, 'brett-liste');

  // Bearbeiten: Eintrag ohne Züge öffnet das Formular
  await page.getByTestId('game-row').filter({ hasText: 'Niederlage' }).click();
  await expect(page.getByRole('heading', { name: 'Brettpartie bearbeiten' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Hauptgründe' }).getByRole('button', { name: 'Zeitnot' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Ergebnis' }).getByRole('button', { name: 'Remis' }).click();
  await page.getByLabel('Notiz').fill('Doch noch Dauerschach');
  await page.getByTestId('board-save').click();
  await expect(page.getByTestId('game-row').filter({ hasText: 'Remis' })).toHaveCount(1);

  // Nach Neuladen noch da
  await page.reload();
  await expect(page.getByTestId('game-row')).toHaveCount(2);

  // Löschen mit Rückfrage
  await page.getByTestId('game-row').filter({ hasText: 'Remis' }).click();
  await page.getByRole('button', { name: 'Eintrag löschen' }).click();
  await page.getByRole('button', { name: 'Ja, löschen' }).click();
  await expect(page).toHaveURL(/#\/partien$/);
  await expect(page.getByTestId('game-row')).toHaveCount(1);
});

test('Knopf auf der Übersicht, wenn schon Partien da sind', async ({ page }) => {
  await page.goto('/#/brett');
  await page.getByRole('group', { name: 'Ergebnis' }).getByRole('button', { name: 'Sieg' }).click();
  await page.getByRole('group', { name: 'Meine Farbe' }).getByRole('button', { name: 'Weiß' }).click();
  await page.getByTestId('board-save').click();
  await expect(page.getByTestId('game-row')).toHaveCount(1);
  await page.goto('/#/');
  await page.getByTestId('overview-board-entry').click();
  await expect(page.getByRole('heading', { name: 'Brettpartie eintragen' })).toBeVisible();
});
