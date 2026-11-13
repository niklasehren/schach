import { expect, test, type Page } from '@playwright/test';
import { mockChessCom, move, runImport, startFriendGame } from './helpers';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/${name}-${test.info().project.name}.png`, fullPage: true });

/** Kleinere Suchtiefe, damit die Tests schnell sind (in der App: Tiefe 16) */
const fastAnalysis = (page: Page, depth: number) =>
  page.addInitScript((d) => localStorage.setItem('schach.analysisLimit', JSON.stringify({ depth: d })), depth);

const count = (page: Page) => page.getByTestId('analysis-count');
/** Nur die sichtbare Zugliste (die Spielseite bleibt im Hintergrund erhalten) */
const moves = (page: Page) => page.locator('.movelist-move').filter({ visible: true });
const current = (page: Page) => page.locator('.movelist-move.is-current').filter({ visible: true });

test('Schäfermatt wird analysiert: Markierungen, Zusammenfassung, Zum ersten Fehler', async ({ page }) => {
  await fastAnalysis(page, 10);
  await startFriendGame(page);
  for (const [from, to] of [
    ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7'],
  ]) {
    await move(page, from, to);
  }
  await page.getByRole('link', { name: 'Partien', exact: true }).click();
  await expect(count(page)).toHaveText('Alle Partien analysiert', { timeout: 30000 });
  await expect(page.getByTestId('analysis-toggle')).toHaveCount(0);
  await expect(page.getByTestId('game-errors')).toBeVisible();

  await page.getByTestId('game-row').click();
  // Gegen Freund: beide Seiten werden bewertet (Zusammenfassung im Reiter „Fehler“)
  await expect(page.getByTestId('analysis-summary')).toContainText('Ben:');
  await expect(page.getByTestId('analysis-summary')).toContainText('1 Patzer');
  await expect(page.getByTestId('analysis-summary')).toContainText('Matt zugelassen');
  // Ansicht startet bei der Grundstellung; Markierungen in der Zugliste
  await page.getByTestId('tab-zuege').click();
  await expect(current(page)).toHaveCount(0);
  await expect(moves(page).filter({ hasText: 'Sf6' })).toHaveAttribute('data-mark', 'blunder');
  await expect(moves(page).filter({ hasText: 'Dxf7#' })).not.toHaveAttribute('data-mark');

  await page.getByTestId('tab-fehler').click();
  await page.getByTestId('first-error').click();
  await expect(page.getByTestId('error-card')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('move-note')).toContainText(/Patzer|Fehler/);
  await page.getByTestId('tab-zuege').click();
  await expect(current(page)).toHaveAttribute('data-mark', /mistake|blunder/);
  await shot(page, 'analyse-schaefermatt');
});

test('Chess.com-Partien: Fortschritt bleibt nach Neuladen, Pause bleibt Pause, Weiter rechnet zu Ende', async ({ page }) => {
  test.setTimeout(150000);
  await fastAnalysis(page, 14);
  await mockChessCom(page);
  await runImport(page, 'testspieler');
  await expect(page.getByTestId('import-result')).toContainText('6 neue Partien');

  await page.getByRole('link', { name: 'Partien', exact: true }).click();
  await expect(count(page)).toHaveText(/Analyse: [1-5] von 6 Partien/, { timeout: 60000 });
  await page.getByTestId('analysis-toggle').click();
  await expect(page.getByTestId('analysis-status')).toHaveText('pausiert');
  await expect(page.getByTestId('analysis-panel')).toContainText('nur, solange die App geöffnet ist');
  const before = Number((await count(page).innerText()).match(/(\d+) von/)![1]);
  await shot(page, 'analyse-pausiert');

  await page.reload();
  await expect(count(page)).toHaveText(`Analyse: ${before} von 6 Partien`);
  await expect(page.getByTestId('analysis-status')).toHaveText('pausiert');
  await expect(page.getByTestId('game-errors')).toHaveCount(before);
  await page.waitForTimeout(1500);
  await expect(count(page)).toHaveText(`Analyse: ${before} von 6 Partien`);

  await page.getByTestId('analysis-toggle').click();
  await expect(count(page)).toHaveText('Alle Partien analysiert', { timeout: 90000 });
  await expect(page.getByTestId('game-errors')).toHaveCount(6);
  await shot(page, 'analyse-fertig');

  // Partie, in der ich mit Schwarz verloren habe: nur meine Züge (Schwarz = gerade Halbzüge) sind markiert
  await page.getByTestId('game-row').filter({ hasText: 'Gegner1' }).click();
  await expect(page.getByTestId('analysis-summary')).toContainText('Deine Fehler:');
  await expect(page.getByTestId('analysis-summary')).toContainText('Patzer');
  await page.getByTestId('tab-zuege').click();
  const marked = page.locator('.movelist-move[data-mark]').filter({ visible: true });
  expect(await marked.count()).toBeGreaterThan(0);
  for (const el of await marked.all()) {
    const box = el.locator('xpath=..');
    // in jeder Zeile ist der zweite Zug (Schwarz) das dritte Kind
    expect(await el.evaluate((n) => Array.from(n.parentElement!.children).indexOf(n))).toBe(2);
    await expect(box).toHaveClass(/movelist-row/);
  }
  await page.getByTestId('tab-fehler').click();
  await page.getByTestId('first-error').click();
  await page.keyboard.press('ArrowRight');
  await page.getByTestId('tab-zuege').click();
  await expect(current(page)).toHaveAttribute('data-mark', /mistake|blunder/);
  await shot(page, 'analyse-partie');
});

test('Noch nicht analysierte Partie: Hinweis und „Als Nächstes analysieren“', async ({ page }) => {
  // Standardtiefe 16: die älteste Partie ist sicher noch nicht dran
  await mockChessCom(page);
  await runImport(page, 'testspieler');
  await expect(page.getByTestId('import-result')).toContainText('6 neue Partien');
  await page.getByRole('link', { name: 'Partien', exact: true }).click();
  await page.getByTestId('analysis-toggle').click();
  await expect(page.getByTestId('analysis-status')).toHaveText('pausiert');
  // Älteste Partie öffnen (kommt sonst zuletzt dran)
  const rows = page.getByTestId('game-row');
  await rows.last().click();
  await expect(page.getByTestId('analysis-pending')).toContainText('Noch nicht analysiert');
  await expect(page.getByTestId('analysis-pending')).toContainText('pausiert');
});
