import { expect, test, type Page } from '@playwright/test';
import { rankLabel } from '../../packages/engine-core/src/cards';
import { applyFreeCellMove, createFreeCellGame } from '../../packages/game-freecell/src/engine';
import type { FreeCellDestination } from '../../packages/game-freecell/src/types';

test.use({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true });

const state = createFreeCellGame(() => 0.5);
const pileIndex = state.tableau.findIndex((pile) => pile.at(-1)?.rank !== 1);
const cardIndex = state.tableau[pileIndex].length - 1;
const card = state.tableau[pileIndex][cardIndex];
const suit = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }[card.suit];

async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mumscards.saves')!).freecell.state);
}

async function rejectTwice(page: Page) {
  await page.goto('/');
  await page.evaluate((state) => localStorage.setItem('mumscards.saves', JSON.stringify({
    freecell: { gameId: 'freecell', updatedAt: '2026-10-18T00:00:00Z', state },
  })), state);
  await page.goto('/game/freecell?mode=resume');
  await page.getByRole('button', { name: `${rankLabel(card.rank)} ${suit} ${suit} ${suit}`, exact: true }).tap();
  const wrong = page.getByRole('button', { name: 'A', exact: true }).first();
  const before = await wrong.boundingBox();
  if (!before) throw new Error('Missing wrong destination');
  const point = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.getByRole('status')).toContainText('An empty foundation must start with an Ace.');
  await expect(page.locator('[data-testid^="move-hint-"]')).toHaveCount(0);
  expect(await wrong.boundingBox()).toEqual(before);
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.getByRole('status')).toContainText('Try this move:');
  await expect(page.locator('[data-testid^="move-hint-"]')).toHaveCount(2);
  await expect(page.getByTestId(`move-hint-tableau-${pileIndex}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect(await saved(page)).toEqual(state);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mumscards.failed-moves') ?? '[]').length)).toBe(2);
}

test('repeated physical taps flash a legal move without moving cards or blocking its manual destination', async ({ page }, testInfo) => {
  await rejectTwice(page);
  const sourceKey = `move-hint-tableau-${pileIndex}`;
  const highlights = page.locator('[data-testid^="move-hint-"]');
  const keys = await highlights.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')!));
  const destinationKey = keys.find((key) => key !== sourceKey);
  if (!destinationKey) throw new Error('Missing highlighted destination');
  const match = /^move-hint-(cell|tableau|foundation)-(\d+)$/.exec(destinationKey);
  if (!match) throw new Error('Unexpected destination');
  const index = Number(match[2]);
  const destination: FreeCellDestination = match[1] === 'cell' ? { zone: 'cell', cellIndex: index }
    : match[1] === 'foundation' ? { zone: 'foundation', pileIndex: index } : { zone: 'tableau', pileIndex: index };
  const expected = applyFreeCellMove(state, { zone: 'tableau', pileIndex, cardIndex }, destination);
  expect(expected).not.toEqual(state);
  await expect.poll(async () => Number(await page.getByTestId(sourceKey).evaluate((node) => getComputedStyle(node).opacity))).toBeLessThan(0.95);
  await page.screenshot({ path: testInfo.outputPath('repeated-tap-hint.png') });
  const box = await page.getByTestId(destinationKey).boundingBox();
  if (!box) throw new Error('Missing destination bounds');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height - 20);
  await expect.poll(() => saved(page)).toEqual(expected);
  await expect(highlights).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
});

test('Reduce Motion keeps suggestion steady until it expires', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await rejectTwice(page);
  const highlight = page.getByTestId(`move-hint-tableau-${pileIndex}`);
  await expect(highlight).toHaveCSS('opacity', '1');
  await page.waitForTimeout(750);
  await expect(highlight).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-testid^="move-hint-"]')).toHaveCount(0);
  expect(await saved(page)).toEqual(state);
  await expect(page.getByRole('status')).toContainText('An empty foundation must start with an Ace.');
});
