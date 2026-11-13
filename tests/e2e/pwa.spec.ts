// Progressive Web App: Offline-Start, Update-Meldung, Manifest/Icons, iPhone-Hinweise und Safe Areas.
// Der Service Worker läuft nur im fertigen Build – deshalb baut dieser Test zwei Versionen (A, B) und liefert sie
// wie GitHub Pages unter /schach/ aus.
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { buildApp, serveApp } from './pwaServer';
import { move } from './helpers';

let server: Awaited<ReturnType<typeof serveApp>>;
let dirA = '';
let dirB = '';

test.describe('PWA (Build)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({}, info) => {
    test.setTimeout(240_000);
    dirA = resolve(`test-results/pwa-build-${info.project.name}-a`);
    dirB = resolve(`test-results/pwa-build-${info.project.name}-b`);
    buildApp(dirA, 'A-test');
    buildApp(dirB, 'B-test');
    server = await serveApp(dirA);
  });
  test.afterAll(async () => {
    await server?.close();
  });

  /** Warten, bis der Service Worker alles gespeichert hat und die Seite kontrolliert */
  async function installed(page: Page) {
    await page.goto(server.url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
  }

  test('Manifest, Icons und iPhone-Angaben für /schach/', async ({ page, request }) => {
    const manifest = await (await request.get(`${server.url}manifest.webmanifest`)).json();
    expect(manifest).toMatchObject({ name: 'Schach', short_name: 'Schach', display: 'standalone', start_url: '/schach/', scope: '/schach/', theme_color: '#121519' });
    for (const icon of [...manifest.icons.map((i: { src: string }) => i.src), 'icons/apple-touch-icon.png']) {
      const res = await request.get(server.url + icon);
      expect(res.status(), icon).toBe(200);
      expect(res.headers()['content-type']).toBe('image/png');
    }
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    await page.goto(server.url);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/schach/icons/apple-touch-icon.png');
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black-translucent');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/schach/manifest.webmanifest');
  });

  test('Offline-Start: App, Spielen gegen Stockfish, Analyse und Training ohne Internet', async ({ page, context }) => {
    test.setTimeout(180_000);
    await installed(page);
    await context.setOffline(true);

    // Neu öffnen ohne Internet
    await page.goto(`${server.url}#/spielen`);
    await expect(page.getByRole('heading', { name: 'Neue Partie' })).toBeVisible();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    // Gegen Stockfish: die Engine (WASM) kommt aus dem Offline-Speicher
    await page.getByRole('button', { name: 'Gegen Computer', exact: true }).click();
    await page.getByRole('button', { name: 'Schwarz', exact: true }).click();
    await page.getByRole('button', { name: 'Partie starten' }).click();
    await expect(page.locator('.movelist-move')).toHaveCount(1, { timeout: 20_000 });

    // Gegen Freund spielen (zweiter Tab, ebenfalls offline), danach analysieren
    const p2 = await context.newPage();
    await p2.goto(`${server.url}#/spielen`);
    await p2.getByRole('button', { name: 'Gegen Freund', exact: true }).click();
    await p2.getByRole('button', { name: 'Partie starten' }).click();
    for (const [f, t] of [['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']]) await move(p2, f, t);
    await expect(p2.getByTestId('result')).toContainText('1-0');
    await p2.goto(`${server.url}#/partien`);
    await expect(p2.getByTestId('analysis-count')).toHaveText('Alle Partien analysiert', { timeout: 90_000 });
    await p2.getByTestId('game-row').first().click();
    await expect(p2.getByTestId('evalbar').filter({ visible: true })).toHaveAttribute('aria-label', /Bewertung/);

    // Training: Lichess-Thema aus dem Offline-Speicher
    await p2.goto(`${server.url}#/training/allgemein/mateIn1`);
    await expect(p2.getByTestId('puzzle-theme')).toHaveText('Matt in 1');
    await expect(p2.getByTestId('puzzle-message')).toHaveCount(0, { timeout: 5_000 });
    await p2.screenshot({ path: `test-results/offline-training-${test.info().project.name}.png` });
    await context.setOffline(false);
  });

  test('Update: Meldung „Neue Version verfügbar“, kein automatisches Neuladen, erst auf Klick die neue Version', async ({ page }) => {
    test.setTimeout(120_000);
    await installed(page);
    await page.goto(`${server.url}#/einstellungen`);
    await expect(page.getByTestId('install-card')).toContainText('Version A-test');
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 42));

    // Neue Version auf dem Server; die App sieht nach (wie stündlich bzw. beim Zurückkehren)
    server.setRoot(dirB);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
    await expect(page.getByTestId('update-prompt')).toContainText('Neue Version verfügbar', { timeout: 30_000 });
    await page.screenshot({ path: `test-results/update-meldung-${test.info().project.name}.png` });

    // Nichts passiert von selbst: dieselbe Seite, alte Version
    await page.waitForTimeout(2_000);
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(42);
    await expect(page.getByTestId('install-card')).toContainText('Version A-test');

    // „Neu laden“ → neue Version
    await page.getByTestId('update-reload').click();
    await expect(page.getByTestId('install-card')).toContainText('Version B-test', { timeout: 20_000 });
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBeUndefined();
    await expect(page.getByTestId('update-prompt')).toHaveCount(0);
    server.setRoot(dirA);
  });
});

test.describe('iPhone', () => {
  test('Hinweis „Zum Home-Bildschirm“ nur in Safari am iPhone; Navigation unten nicht verdeckt, Safe Areas', async ({ page }) => {
    const handy = test.info().project.name === 'handy';
    await page.goto('/');
    if (!handy) {
      await expect(page.getByRole('heading', { name: 'Dein persönlicher Schachberater' })).toBeVisible();
      await expect(page.getByTestId('install-hint')).toHaveCount(0);
      return;
    }
    const hint = page.getByTestId('install-hint');
    await expect(hint).toContainText('Zum Home-Bildschirm');
    await expect(hint).toContainText('eigenen Speicher');
    await page.screenshot({ path: `test-results/install-hinweis-handy.png`, fullPage: true });

    // Safe Areas: Kopfzeile oben, Navigation unten und seitlich
    const header = page.locator('header');
    await expect(header).toHaveClass(/safe-area-inset-top/);
    const nav = page.getByRole('navigation', { name: 'Hauptnavigation unten' });
    await expect(nav).toHaveClass(/safe-area-inset-bottom/);
    await expect(nav).toHaveClass(/safe-area-inset-left/);
    // Navigation liegt ganz im Bild, und der letzte Inhalt lässt sich darüber scrollen
    const vp = page.viewportSize()!;
    const navBox = (await nav.boundingBox())!;
    expect(navBox.y + navBox.height).toBeLessThanOrEqual(vp.height + 0.5);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const last = page.locator('main').locator('a, button').last();
    const lastBox = (await last.boundingBox())!;
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual((await nav.boundingBox())!.y);

    // Ausblenden bleibt nach Neuladen
    await page.getByRole('button', { name: 'Hinweis ausblenden' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dein persönlicher Schachberater' })).toBeVisible();
    await expect(page.getByTestId('install-hint')).toHaveCount(0);
  });

  test('Als installierte App: Hinweis auf den eigenen Speicher und einmal anmelden', async ({ browser }) => {
    test.skip(test.info().project.name !== 'handy', 'nur am Handy');
    const context = await browser.newContext({ ...test.info().project.use, baseURL: 'http://localhost:5173' });
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByTestId('standalone-hint')).toContainText('eigenen Speicher');
    await expect(page.getByTestId('install-hint')).toHaveCount(0);
    await page.goto('/#/einstellungen');
    await expect(page.getByTestId('install-card')).toContainText('Du nutzt Schach als App vom Home-Bildschirm');
    await expect(page.getByTestId('storage-note')).toContainText('Melde dich dort einmal mit deinem Konto an');
    await context.close();
  });
});
