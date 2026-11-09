import { expect, test, type Page } from '@playwright/test';

/** Klickt auf ein Feld (z. B. "e2"), ausgehend von Weiß unten. */
async function clickSquare(page: Page, square: string, orientation: 'white' | 'black' = 'white') {
  const box = (await page.getByTestId('board').boundingBox())!;
  const size = box.width / 8;
  let file = square.charCodeAt(0) - 97;
  let rank = Number(square[1]) - 1;
  if (orientation === 'black') {
    file = 7 - file;
    rank = 7 - rank;
  }
  await page.mouse.click(box.x + (file + 0.5) * size, box.y + (7 - rank + 0.5) * size);
}

/** Zieht und wartet, bis der Zug in der Zugliste steht (sonst klickt der Test schneller, als das Brett umschaltet). */
async function move(page: Page, from: string, to: string) {
  const before = await page.getByTestId('movelist').innerText();
  await clickSquare(page, from);
  await clickSquare(page, to);
  await expect(page.getByTestId('movelist')).not.toHaveText(before);
}

test('Schäfermatt bis zum Ende spielen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveText('Weiß am Zug');
  for (const [from, to] of [
    ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7'],
  ]) {
    await move(page, from, to);
  }
  await expect(page.getByTestId('status')).toHaveText('Schachmatt – Weiß gewinnt');
  await expect(page.getByTestId('movelist')).toContainText('Lc4');
  await expect(page.getByTestId('movelist')).toContainText('Dxf7#');
  await page.screenshot({ path: `test-results/matt-${test.info().project.name}.png` });

  // Illegaler Zug nach Matt bewirkt nichts, neue Partie setzt zurück
  await page.getByRole('button', { name: 'Neue Partie' }).click();
  await expect(page.getByTestId('status')).toHaveText('Weiß am Zug');
  await expect(page.getByTestId('movelist')).toContainText('Noch keine Züge');
});

test('illegale Züge werden abgelehnt', async ({ page }) => {
  await page.goto('/');
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e5');
  await expect(page.getByTestId('movelist')).toContainText('Noch keine Züge');
  await move(page, 'e2', 'e4');
  await expect(page.getByTestId('status')).toHaveText('Schwarz am Zug');
});

test('Bauernumwandlung mit Auswahl', async ({ page }) => {
  await page.goto('/');
  // Schneller Weg zu einer Umwandlung: Bauer frisst sich nach vorn
  for (const [from, to] of [
    ['h2', 'h4'], ['g7', 'g5'], ['h4', 'g5'], ['h7', 'h6'], ['g5', 'h6'], ['f8', 'g7'], ['h6', 'g7'], ['g8', 'f6'],
  ]) {
    await move(page, from, to);
  }
  await clickSquare(page, 'g7');
  await clickSquare(page, 'h8');
  await expect(page.getByRole('dialog', { name: 'Umwandlung wählen' })).toBeVisible();
  await page.screenshot({ path: `test-results/umwandlung-${test.info().project.name}.png` });
  await page.getByRole('button', { name: 'Springer' }).click();
  await expect(page.getByTestId('movelist')).toContainText('gxh8=S');
  await expect(page.getByTestId('status')).toHaveText('Schwarz am Zug');
});

test('Brett drehen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Brett drehen' }).click();
  await clickSquare(page, 'd2', 'black');
  await clickSquare(page, 'd4', 'black');
  await expect(page.getByTestId('movelist')).toContainText('d4');
});
