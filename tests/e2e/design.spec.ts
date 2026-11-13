import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { importZwischenzug, mockChessCom, runImport } from './helpers';

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
  await page.getByRole('group', { name: 'Zeitklasse' }).getByRole('button', { name: 'Bullet', exact: true }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(2);
  await page.getByRole('group', { name: 'Ergebnis' }).getByRole('button', { name: 'Niederlagen', exact: true }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(0);
  await expect(page.getByText('Keine Partien für diese Filter.')).toBeVisible();
  await page.getByRole('group', { name: 'Zeitklasse' }).getByRole('button', { name: 'Alle Zeiten', exact: true }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(1);
  await expect(page.getByTestId('game-row')).toContainText('Niederlage');

  // Übersicht über die Navigation (am Handy die Leiste unten)
  const nav = page.getByRole('navigation', { name: test.info().project.name === 'handy' ? 'Hauptnavigation unten' : 'Hauptnavigation', exact: true });
  await nav.getByRole('link', { name: 'Übersicht' }).click();
  await expect(page.getByTestId('overview-due')).toHaveText(/^\d+$/);
  await expect(page.getByText('Allgemeines Training')).toBeVisible();
  await expect(page.getByTestId('rating-card')).toContainText('Chess.com');
  await expect(page.getByTestId('error-types').locator('li')).not.toHaveCount(0, { timeout: 15000 });
  // Top 3 nur konkrete Fehlerarten; Fehler ohne klare Taktik als eigene Zeile
  await expect(page.getByTestId('error-types')).not.toContainText('Stellungsfehler');
  await expect(page.getByTestId('error-types').locator('li').first()).not.toHaveText('');
  await expect(page.getByTestId('positional-errors')).toHaveText(/^Dazu \d+ Stellungsfehler ohne klare Taktik\.$/);
  // Letzte Partien: kleines Brett der Endstellung mit markiertem letzten Zug, Patzer als ruhige Angabe
  const recent = page.getByTestId('recent-games').getByTestId('game-row');
  await expect(recent).toHaveCount(5);
  await expect(recent.first().locator('square.last-move')).toHaveCount(2);
  await expect(page.getByTestId('game-errors').first()).toHaveText(/^, (\d+ Patzer|ohne Patzer|fehlerfrei)$/);
  await expect(page.getByTestId('overview-analysis')).toHaveText('Alle 6 Partien analysiert.');
  // Coach: ehrlich bei wenig Daten (6 Partien reichen für keinen Vergleich)
  await expect(page.getByTestId('coach-blunders')).toHaveText(/^Diese Woche (erst|\d)/);
  // Navigation: aktive Seite markiert, ohne Pille
  await expect(nav.getByRole('link', { name: 'Übersicht' })).toHaveAttribute('aria-current', 'page');
  await page.waitForTimeout(400);
  await shot(page, 'uebersicht');
  // Beide Trainingsarten mit eigenem Startknopf und Puzzle-Rating (Startwert aus der Chess.com-Wertung)
  await expect(page.getByTestId('overview-puzzle-rating')).toHaveText(/^\d{3,4}$/);
  await page.getByTestId('overview-start').click();
  await expect(page.getByTestId('puzzle-task')).toContainText('Finde einen besseren Zug');
  await page.goBack();
  // Antippen des großen Bretts startet ebenfalls das erste Puzzle
  await page.getByTestId('overview-board').click();
  await expect(page).toHaveURL(/#\/training\/fehler$/);
  await expect(page.getByTestId('puzzle-task')).toContainText('Finde einen besseren Zug');
  await page.goBack();
  // Antippen einer letzten Partie öffnet die Analyse
  await page.getByTestId('recent-games').getByTestId('game-row').first().click();
  await expect(page).toHaveURL(/#\/partien\/.+/);
  await page.goBack();
  await page.getByTestId('overview-start-general').click();
  await expect(page.getByTestId('puzzle-theme')).toContainText('passend zu deinen Schwächen');
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

test('Analyse am Mac (1440×900) ohne Scrollen', async ({ page }) => {
  test.skip(test.info().project.name !== 'mac', 'nur Mac-Größe');
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await importZwischenzug(page);
  await page.getByTestId('game-row').click();
  await page.getByTestId('next-error').click();
  await expect(page.getByTestId('error-card')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
});

test('Rating-Grafik: Zeitraum passt sich an die Daten an, Datumsmarken ohne Überlappung, Erklärung der Wertung', async ({ page }) => {
  test.setTimeout(120000);
  await page.clock.setFixedTime(new Date(2026, 10, 12, 18));
  await page.addInitScript(() => localStorage.setItem('schach.analysisLimit', JSON.stringify({ depth: 6 })));
  // 9 Rapid-Partien: 1.–3.11., Pause, 9.–12.11. (mehrere am selben Tag)
  const base = JSON.parse(readFileSync(new URL('../fixtures/chesscom-2026-11.json', import.meta.url), 'utf8')).games[0];
  const days: [number, number][] = [[1, 300], [2, 310], [3, 305], [9, 320], [10, 330], [10, 340], [11, 335], [12, 345], [12, 351]];
  const games = days.map(([d, r], i) => ({
    ...base,
    url: `https://www.chess.com/game/live/9100000000${i}`,
    uuid: `22222222-0000-0000-0000-00000000000${i}`,
    end_time: Math.floor(new Date(2026, 10, d, 10 + i).getTime() / 1000),
    black: { ...base.black, rating: r },
  }));
  await page.route('https://api.chess.com/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/archives') ? { archives: ['https://api.chess.com/pub/player/testspieler/games/2026/11'] } : { games };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
  });
  await runImport(page, 'testspieler');
  await expect(page.getByTestId('import-result')).toContainText('9 neue Partien');
  await page.goto('/#/uebersicht');

  const card = page.getByTestId('rating-card');
  await expect(card).toContainText('Chess.com, Rapid');
  await expect(page.getByTestId('rating-now')).toHaveText('351');
  // Ab der ersten Partie, ein Punkt pro Partie, keine Lücke
  await expect(page.getByTestId('rating-delta')).toHaveText('+51 seit 01.11.');
  await expect(page.getByTestId('rating-best')).toHaveText('Bestwert 351');
  await expect(page.getByTestId('rating-stats')).toHaveText('Ein Punkt pro Partie, 9 Rapid-Partien');
  await expect(page.getByTestId('rating-chart')).toHaveAttribute('data-points', '9');
  // Nur ein Monat Daten: keine Zeitraum-Knöpfe, die dasselbe zeigen würden
  await expect(card.getByRole('group', { name: 'Zeitraum' })).toHaveCount(0);
  // Datumsmarken: verschieden, gleichmäßig verteilt, ohne Überlappung
  const ticks = page.getByTestId('rating-chart').locator('svg text').filter({ hasText: /^\d\d\.\d\d\.$/ });
  await expect(ticks.first()).toBeVisible();
  const labels = await ticks.allTextContents();
  expect(new Set(labels).size).toBe(labels.length);
  const boxes = await ticks.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })));
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].left).toBeGreaterThan(boxes[i - 1].right);
  await page.waitForTimeout(300);
  await shot(page, 'rating', false);

  // Erklärung der Wertung per Info-Symbol (auch am Handy)
  const info = card.getByTestId('info-btn');
  await (test.info().project.use.hasTouch ? info.tap() : info.click());
  await expect(page.getByTestId('info-text')).toContainText('Jede Zeitklasse (Rapid, Blitz, Bullet, Täglich) hat ihre eigene Wertung.');
});

test('Rating-Grafik: Zeitklassen wechseln, auch mit wenigen Partien', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 12, 18));
  await page.addInitScript(() => localStorage.setItem('schach.analysisLimit', JSON.stringify({ depth: 6 })));
  await mockChessCom(page);
  await runImport(page, 'testspieler');
  await expect(page.getByTestId('import-result')).toContainText('6 neue Partien');
  await page.goto('/#/uebersicht');
  const classes = page.getByTestId('rating-card').getByRole('group', { name: 'Zeitklasse' });
  await expect(classes.getByRole('button', { name: 'Rapid' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('rating-chart')).toHaveAttribute('data-points', /^[2-9]$/);
  await classes.getByRole('button', { name: 'Bullet' }).click();
  await expect(page.getByTestId('rating-card')).toContainText('Chess.com, Bullet');
  await expect(page.getByTestId('rating-stats')).toHaveText(/^Ein Punkt pro Partie, 2 Bullet-Partien$/);
});
