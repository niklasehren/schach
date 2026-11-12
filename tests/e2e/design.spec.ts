import { expect, test, type Page } from '@playwright/test';
import { mockChessCom, runImport } from './helpers';

const shot = (page: Page, name: string, full = true) => page.screenshot({ path: `test-results/${name}-${test.info().project.name}.png`, fullPage: full });

test('Übersicht, Filter der Partienliste, Navigation', async ({ page }) => {
  test.setTimeout(150000);
  await page.addInitScript(() => localStorage.setItem('schach.analysisLimit', JSON.stringify({ depth: 10 })));
  // Leere Übersicht: Willkommen mit Wegen zum Import und zum Spielen
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dein persönlicher Schachberater' })).toBeVisible();

  await mockChessCom(page);
  await runImport(page, 'testspieler');
  await expect(page.getByTestId('import-result')).toContainText('6 neue Partien');
  await page.goto('/#/partien');
  await expect(page.getByTestId('analysis-count')).toHaveText('Analyse: 6 von 6 Partien', { timeout: 120000 });

  // Filter: Zeitklasse und Ergebnis
  await expect(page.getByTestId('game-row')).toHaveCount(6);
  await page.getByRole('radiogroup', { name: 'Zeitklasse' }).getByRole('radio', { name: 'Bullet' }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(2);
  await page.getByRole('radiogroup', { name: 'Ergebnis' }).getByRole('radio', { name: 'Niederlagen' }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(0);
  await expect(page.getByText('Keine Partien für diese Filter.')).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Zeitklasse' }).getByRole('radio', { name: 'Alle Zeiten' }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(1);
  await expect(page.getByTestId('game-row')).toContainText('Niederlage');

  // Übersicht über die Navigation (am Handy die Leiste unten)
  const nav = page.getByRole('navigation', { name: test.info().project.name === 'handy' ? 'Hauptnavigation unten' : 'Hauptnavigation', exact: true });
  await nav.getByRole('link', { name: 'Übersicht' }).click();
  await expect(page.getByTestId('overview-due')).toHaveText(/^\d+$/);
  await expect(page.getByText('Allgemeines Training')).toBeVisible();
  await expect(page.getByTestId('rating-card')).toContainText('Chess.com');
  await expect(page.getByTestId('error-types').locator('li')).not.toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('.recent-card').getByTestId('game-row')).toHaveCount(5);
  await expect(page.getByTestId('overview-analysis')).toContainText('6 von 6');
  await page.waitForTimeout(400);
  await shot(page, 'uebersicht');
  await page.getByTestId('overview-start').click();
  await expect(page.getByTestId('due-count')).toBeVisible();
});

test('Einstellungen: heller Modus und Brett-Theme bleiben nach Neuladen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await page.getByTestId('light-mode').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('board-schiefer').click();
  await expect(page.locator('html')).toHaveAttribute('data-board', 'schiefer');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-board', 'schiefer');
  await expect(page.getByTestId('light-mode')).toBeChecked();
  await shot(page, 'einstellungen-hell');
});
