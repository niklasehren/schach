import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/** Klickt auf ein Feld (z. B. "e2"); berücksichtigt, ob das Brett gedreht ist. */
export async function clickSquare(page: Page, square: string) {
  const board = page.getByTestId('board');
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
  await page.goto('/');
  await page.getByRole('radio', { name: 'Gegen Freund' }).click();
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
  await page.getByRole('radio', { name: range }).click();
  await page.getByRole('button', { name: 'Partien importieren' }).click();
}

