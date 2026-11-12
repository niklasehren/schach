import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/** Klickt auf ein Feld (z. B. "e2"); berücksichtigt, ob das Brett gedreht ist. */
export async function clickSquare(page: Page, square: string) {
  // nur das sichtbare Brett (die Spielseite bleibt im Hintergrund erhalten)
  const board = page.getByTestId('board').filter({ visible: true });
  // Brett mittig ins Bild holen (die feste Kopf- und Fußleiste dürfen nichts verdecken)
  await board.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await board.boundingBox())!;
  const black = (await board.getAttribute('class'))!.includes('orientation-black');
  const size = box.width / 8;
  let file = square.charCodeAt(0) - 97;
  let rank = Number(square[1]) - 1;
  if (black) {
    file = 7 - file;
    rank = 7 - rank;
  }
  await page.mouse.click(box.x + (file + 0.5) * size, box.y + (7 - rank + 0.5) * size);
}

/** Zieht und wartet, bis der Zug in der Zugliste steht. */
export async function move(page: Page, from: string, to: string) {
  const before = await page.getByTestId('movelist').innerText();
  await clickSquare(page, from);
  await clickSquare(page, to);
  await expect(page.getByTestId('movelist')).not.toHaveText(before);
  // Zug-Animation (180 ms) abwarten, wie ein Mensch es auch tut
  await page.waitForTimeout(200);
}

export async function startFriendGame(page: Page, white = 'Anna', black = 'Ben') {
  await page.goto('/#/spielen');
  await page.getByRole('button', { name: 'Gegen Freund', exact: true }).click();
  await page.getByLabel('Name Weiß').fill(white);
  await page.getByLabel('Name Schwarz').fill(black);
  await page.getByRole('button', { name: 'Partie starten' }).click();
  await expect(page.getByTestId('status')).toHaveText(`${white} ist am Zug`);
}

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

/** Nachgestellte Chess.com-API für den Benutzer „testspieler“ */
export async function mockChessCom(page: Page, status: Record<string, number> = {}) {
  const calls: string[] = [];
  await page.route('https://api.chess.com/**', async (route) => {
    const url = route.request().url();
    calls.push(url);
    const path = new URL(url).pathname;
    if (status[path]) return route.fulfill({ status: status[path], body: '{}' });
    const bodies: Record<string, string> = {
      '/pub/player/testspieler/games/archives': fixture('chesscom-archives.json'),
      '/pub/player/testspieler/games/2026/11': fixture('chesscom-2026-11.json'),
      '/pub/player/testspieler/games/2026/10': fixture('chesscom-2026-10.json'),
      '/pub/player/testspieler/games/2026/06': '{"games":[]}',
    };
    if (path in bodies) return route.fulfill({ status: 200, contentType: 'application/json', body: bodies[path], headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":0,"message":"not found"}', headers: { 'access-control-allow-origin': '*' } });
  });
  return calls;
}

export async function runImport(page: Page, name: string, range: 'Alle' | 'Letzte 3 Monate' = 'Alle') {
  await page.goto('/#/import');
  await page.getByLabel('Chess.com-Benutzername').fill(name);
  await page.getByRole('button', { name: range, exact: true }).click();
  await page.getByRole('button', { name: 'Partien importieren' }).click();
}


/** Chess.com liefert genau die Partie vom 12.11. gegen „Gegner7“ (Zwischenzug-Partie); danach Analyse abwarten */
export async function importZwischenzug(page: Page) {
  const month = fixture('chesscom-zwischenzug.json');
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
  await expect(page.getByTestId('analysis-count')).toHaveText('Analyse: 1 von 1 Partien', { timeout: 90000 });
}
