import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { rankLabel } from '../../packages/engine-core/src/cards';
import { createFreeCellGame } from '../../packages/game-freecell/src/engine';

const state = createFreeCellGame(() => 0.5);
const sourcePile = state.tableau.findIndex((pile) => pile.at(-1)?.rank !== 1);
const card = state.tableau[sourcePile].at(-1)!;
const suits = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };

async function rejectFoundation(page: Page) {
  await page.getByRole('button', { name: `${rankLabel(card.rank)} ${suits[card.suit]} ${suits[card.suit]} ${suits[card.suit]}`, exact: true }).click();
  await page.getByText('A', { exact: true }).first().click();
  await expect(page.getByRole('status')).toContainText('An empty foundation must start with an Ace.');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mumscards.saves')!).freecell.state)).toEqual(state);
}

test('invalid move explains the rule, persists a training example, exports JSONL, and updates other tabs', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate((state) => localStorage.setItem('mumscards.saves', JSON.stringify({
    freecell: { gameId: 'freecell', updatedAt: '2026-10-18', state },
  })), state);
  await page.goto('/game/freecell?mode=resume');
  await rejectFoundation(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mumscards.failed-moves') ?? '[]').length)).toBe(1);
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await expect(page.getByText('1 saved attempt', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export training log', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('mumscards-failed-moves.jsonl');
  const path = await file.path();
  if (!path) throw new Error('Missing exported training log');
  const lines = (await readFile(path, 'utf8')).trim().split('\n');
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({
    schemaVersion: 1, game: 'freecell', interaction: 'press',
    position: { tableauBuildPolicy: 'alternate-red-black' },
    attempt: { kind: 'move', source: { zone: 'tableau', pileIndex: sourcePile }, destination: { zone: 'foundation', pileIndex: 0 } },
    rejection: { code: 'foundation-ace' },
  });
  await page.reload();
  await expect(page.getByText('1 saved attempt', { exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/game/freecell?mode=resume');
  await rejectFoundation(other);
  await expect(page.getByText('2 saved attempts', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear failed-move log', exact: true }).click();
  await expect(page.getByText('0 saved attempts', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mumscards.saves')!).freecell.state)).toEqual(state);
});

test('failed training-log writes are visible and retry without altering the game', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    let failing = true;
    window.addEventListener('restore-training-log', () => { failing = false; });
    Storage.prototype.setItem = function(key: string, value: string) {
      if (key === 'mumscards.failed-moves' && failing) throw new Error('Training log quota exceeded');
      return original.call(this, key, value);
    };
  });
  await page.goto('/');
  await page.evaluate((state) => localStorage.setItem('mumscards.saves', JSON.stringify({
    freecell: { gameId: 'freecell', updatedAt: '2026-10-18', state },
  })), state);
  await page.goto('/game/freecell?mode=resume');
  await rejectFoundation(page);
  await expect(page.getByText('This attempt is not saved to the training log. Retry logging in Settings.')).toBeVisible();
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await expect(page.getByText('0 saved attempts · 1 pending', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('restore-training-log')));
  await page.getByRole('button', { name: 'Retry failed-move logging', exact: true }).click();
  await expect(page.getByText('1 saved attempt', { exact: true })).toBeVisible();
});
