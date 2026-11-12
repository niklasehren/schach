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
