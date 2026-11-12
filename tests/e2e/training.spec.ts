import { expect, test, type Page } from '@playwright/test';
import { clickSquare, importZwischenzug } from './helpers';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/${name}-${test.info().project.name}.png`, fullPage: true });
const dueCount = async (page: Page) => Number((await page.getByTestId('due-count').innerText()).match(/(\d+)/)![1]);

async function openTraining(page: Page) {
  await importZwischenzug(page);
  await page.getByRole('link', { name: 'Training', exact: true }).click();
  await expect(page.getByTestId('due-count')).toContainText(/Heute fällig: [1-9]/);
  const before = await dueCount(page);
  await page.getByTestId('start-training').click();
  // Erstes Puzzle: Patzer zuerst, in Zugreihenfolge → Stellung nach 6...Lg4 (in der Partie 7. Df1??)
  await expect(page.getByTestId('puzzle-task')).toContainText('Dort hast du hier Df1 gespielt – ein Patzer');
  return before;
}

test('Puzzle aus der eigenen Partie richtig lösen: Lxc6+ bxc6 Dxc6+', async ({ page }) => {
  test.setTimeout(150000);
  const before = await openTraining(page);
  await shot(page, 'puzzle-start');

  await clickSquare(page, 'b5');
  await clickSquare(page, 'c6');
  await expect(page.getByTestId('puzzle-message')).toContainText('Richtig! Der Gegner antwortet mit bxc6');
  await clickSquare(page, 'f3');
  await clickSquare(page, 'c6');
  await expect(page.getByTestId('puzzle-result')).toContainText('Richtig gelöst!');
  await expect(page.getByTestId('next-due')).toHaveText('Nächste Wiederholung: in 3 Tagen.');
  // Danach dieselbe Erklärung und Pfeile wie in der Analyse, plus Link zur Originalpartie
  await expect(page.getByTestId('error-card')).toContainText('Zwischenzug');
  await expect(page.getByTestId('board').filter({ visible: true })).toHaveAttribute('data-arrows', 'bad:f3f1,good:b5c6');
  await expect(page.getByTestId('to-game')).toHaveAttribute('href', /#\/partien\/.+\/12$/);
  await page.waitForTimeout(300);
  await shot(page, 'puzzle-geloest');

  await page.getByRole('button', { name: '← Training' }).click();
  await expect(page.getByTestId('due-count')).toContainText(`Heute fällig: ${before - 1}`);
});

test('Puzzle falsch lösen: zweiter Versuch, dann Lösung; morgen wieder fällig', async ({ page }) => {
  test.setTimeout(150000);
  const before = await openTraining(page);
  // Kein Hinweis-Knopf vor dem ersten Versuch
  await expect(page.getByRole('button', { name: /Hinweis|Lösung/ })).toHaveCount(0);

  await clickSquare(page, 'f3');
  await clickSquare(page, 'f1');
  await expect(page.getByTestId('puzzle-message')).toContainText('Df1 ist nicht der beste Zug. Versuch es noch einmal.', { timeout: 20000 });
  // Brett ist wieder in der Ausgangsstellung: noch einmal versuchen
  await expect(page.getByTestId('puzzle-result')).toHaveCount(0);
  await page.waitForTimeout(900);
  await clickSquare(page, 'f3');
  await clickSquare(page, 'f1');
  await expect(page.getByTestId('puzzle-result')).toContainText('Nicht gelöst. Besser war Lxc6+', { timeout: 20000 });
  await expect(page.getByTestId('next-due')).toHaveText('Nächste Wiederholung: morgen.');
  await page.getByTestId('show-line').click();
  await expect(page.getByTestId('variation-move').first()).toHaveText('Lxc6+');
  await page.waitForTimeout(300);
  await shot(page, 'puzzle-falsch');

  await page.getByRole('button', { name: '← Training' }).click();
  await expect(page.getByTestId('due-count')).toContainText(`Heute fällig: ${before - 1}`);
  // Ein Puzzle liegt jetzt in Kasten 1
  await expect(page.locator('.box').first()).toContainText('1');
});

test('Gegen Freund: Frage „Wer bist du?“', async ({ page }) => {
  await page.goto('/#/spielen');
  await page.getByRole('button', { name: 'Gegen Freund', exact: true }).click();
  await page.getByLabel('Name Weiß').fill('Anna');
  await page.getByLabel('Name Schwarz').fill('Niklas');
  const who = page.getByRole('group', { name: 'Wer bist du?' });
  await expect(who.getByRole('button', { name: 'Keiner', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await who.getByRole('button', { name: 'Niklas', exact: true }).click();
  await expect(who.getByRole('button', { name: 'Niklas', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Übersicht nach dem Tagesziel: „Tagesziel geschafft“, heute geübt, „Weiter üben“', async ({ page }) => {
  test.setTimeout(150000);
  await importZwischenzug(page);
  await page.getByRole('link', { name: 'Training', exact: true }).click();
  await expect(page.getByTestId('due-count')).toContainText(/Heute fällig: [1-9]/);
  // So, als wären heute schon 10 neue Puzzles geübt worden (direkt in der lokalen Datenbank)
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('schach');
        req.onsuccess = () => {
          const tx = req.result.transaction(['puzzles', 'attempts'], 'readwrite');
          const now = Date.now();
          for (let i = 0; i < 10; i++) {
            tx.objectStore('puzzles').put({
              id: `geuebt:${i}`, userId: null, createdAt: now, gameId: 'geuebt', gameDate: 0, ply: i, fen: '', fenKey: `geuebt-${i}`, played: '', line: [],
              class: 'mistake', winBefore: 50, box: 2, due: now + 3 * 86400000, firstSeen: now,
            });
            tx.objectStore('attempts').put({ id: `geuebt-a${i}`, puzzleId: `geuebt:${i}`, date: now, correct: true, ms: 1000, move: 'e2e4', try: 1 });
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  // Neu laden: Dexie hält Abfragen im Speicher und sieht Schreibvorgänge an ihm vorbei erst danach
  await page.goto('/#/uebersicht');
  await page.reload();
  await expect(page.getByTestId('overview-goal')).toHaveText('Tagesziel geschafft');
  await expect(page.getByTestId('overview-due')).toHaveCount(0);
  await expect(page.getByTestId('overview-practiced')).toContainText('Heute geübt: 10 Puzzles. Noch');
  await expect(page.getByTestId('overview-start')).toHaveText('Weiter üben');
  await shot(page, 'uebersicht-tagesziel');
  await page.getByTestId('overview-start').click();
  await expect(page).toHaveURL(/#\/training\/mehr$/);
  await expect(page.getByTestId('puzzle-task')).toContainText('Finde einen besseren Zug');
  await expect(page.getByTestId('puzzle-status')).toContainText(/noch \d+ neue/);
});
