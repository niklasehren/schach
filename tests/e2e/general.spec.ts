import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';
import { clickSquare } from './helpers';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/${name}-${test.info().project.name}.png`, fullPage: true });

type Row = [string, string, string, number];
const themeRows = (theme: string): Row[] => JSON.parse(readFileSync(join(import.meta.dirname, `../../src/data/lichess/${theme}.json`), 'utf8'));

/** Das gerade gezeigte Lichess-Puzzle über den Link im Lizenzhinweis finden */
async function currentPuzzle(page: Page, theme: string) {
  const link = page.getByRole('link', { name: 'Lichess', exact: true });
  const id = (await link.getAttribute('href'))!.split('/').pop()!;
  const row = themeRows(theme).find((r) => r[0] === id)!;
  const [opp, ...line] = row[2].split(' ');
  return { id, startFen: row[1], opp, line, rating: row[3] };
}

async function play(page: Page, uci: string) {
  await clickSquare(page, uci.slice(0, 2));
  await clickSquare(page, uci.slice(2, 4));
}

test('Allgemeines Training: Thema wählen, Gegnerzug wird vorgespielt, Lösung, Rating steigt', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/#/training');
  const card = page.getByTestId('general-card');
  // ohne Chess.com-Partien: Startwert 1000
  await expect(card.getByTestId('puzzle-rating')).toHaveText('1000');
  await expect(card).toContainText('Puzzles: Lichess, CC0');
  await expect(card.getByTestId('focus-themes')).toContainText('alle Themen kommen gleich oft dran');
  await card.getByRole('button', { name: 'Thema wählen' }).click();
  await expect(card.getByRole('listitem')).toHaveCount(14);
  await shot(page, 'training-allgemein');
  await card.getByTestId('theme-mateIn2').click();
  await expect(page).toHaveURL(/#\/training\/allgemein\/mateIn2$/);

  await expect(page.getByTestId('puzzle-theme')).toHaveText('Matt in 2');
  const p = await currentPuzzle(page, 'mateIn2');
  expect(Math.abs(p.rating - 1000)).toBeLessThanOrEqual(100);
  // Der Gegnerzug (erster Zug in „Moves“) wird gespielt; danach bin ich am Zug und markiert ist sein Zug
  const oppSan = new Chess(p.startFen).move({ from: p.opp.slice(0, 2), to: p.opp.slice(2, 4), promotion: p.opp[4] }).san;
  await expect(page.getByTestId('puzzle-task')).toContainText(`Der Gegner hat ${oppSan.replace(/[NBRQK]/g, (c) => ({ N: 'S', B: 'L', R: 'T', Q: 'D', K: 'K' })[c]!)} gespielt`);
  const board = page.getByTestId('board').filter({ visible: true });
  await expect(board.locator('square.last-move')).toHaveCount(2);
  await expect(page.getByTestId('puzzle-message')).toHaveCount(0);
  const meWhite = p.startFen.split(' ')[1] === 'b';
  await expect(board).toHaveClass(meWhite ? /orientation-white/ : /orientation-black/);

  // Lösung: mein Zug, Antwort des Gegners, Matt
  await play(page, p.line[0]);
  await expect(page.getByTestId('puzzle-message')).toContainText('Richtig! Der Gegner antwortet mit');
  await play(page, p.line[2]);
  await expect(page.getByTestId('puzzle-result')).toContainText('Richtig gelöst!');
  await expect(page.getByTestId('rating-change')).toHaveText(/^Puzzle-Rating: 1000 → 10[0-3]\d \(\+\d+\)$/);
  await expect(page.getByTestId('theme-card')).toContainText('Mit zwei Zügen setzt du matt');
  await expect(board).toHaveAttribute('data-arrows', `good:${p.line[0]}`);
  await page.waitForTimeout(300);
  await shot(page, 'lichess-geloest');

  // Nächstes Puzzle: zweimal falsch → nicht gelöst, Lösung zeigen
  await page.getByTestId('next-puzzle').click();
  await expect(page.getByTestId('puzzle-theme')).toHaveText('Matt in 2');
  await expect.poll(async () => (await currentPuzzle(page, 'mateIn2')).id).not.toBe(p.id);
  const q = await currentPuzzle(page, 'mateIn2');
  await expect(board.locator('square.last-move')).toHaveCount(2);
  const pos = new Chess(q.startFen);
  pos.move({ from: q.opp.slice(0, 2), to: q.opp.slice(2, 4), promotion: q.opp[4] });
  const wrong = pos.moves({ verbose: true }).find((m) => m.from + m.to !== q.line[0].slice(0, 4) && !m.promotion && !m.san.includes('#'))!;
  await play(page, wrong.from + wrong.to);
  await expect(page.getByTestId('puzzle-message')).toContainText('ist nicht der beste Zug. Versuch es noch einmal.');
  await page.waitForTimeout(900);
  await play(page, wrong.from + wrong.to);
  await expect(page.getByTestId('puzzle-result')).toContainText('Nicht gelöst. Besser war');
  await expect(page.getByTestId('rating-change')).toHaveText(/\(−\d+\)$/);
  await expect(board).toHaveAttribute('data-arrows', `bad:${wrong.from + wrong.to},good:${q.line[0]}`);
  await page.getByTestId('show-line').click();
  await expect(page.getByTestId('variation')).toContainText('Lösung');
  await expect(page.getByTestId('variation-move')).toHaveCount(3);
  await page.waitForTimeout(300);
  await shot(page, 'lichess-loesung');

  // Zurück: Rating auf der Trainingsseite angepasst
  await page.getByRole('button', { name: '← Training' }).click();
  await expect(page.getByTestId('puzzle-rating')).not.toHaveText('1000');
});

test('Allgemeines Training startet passend zu meinen Schwächen', async ({ page }) => {
  // Ohne Partien zeigt die Übersicht nur die Begrüßung – der Knopf in der Übersicht wird in design.spec.ts geprüft
  await page.goto('/#/training');
  await page.getByTestId('start-general').click();
  await expect(page).toHaveURL(/#\/training\/allgemein\/schwaechen$/);
  await expect(page.getByTestId('puzzle-theme')).toContainText('passend zu deinen Schwächen');
  await expect(page.getByTestId('puzzle-status')).toHaveText('Puzzle-Rating 1000');
});
