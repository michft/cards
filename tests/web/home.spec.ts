import { expect, test, type Page } from '@playwright/test';
import { createDeck } from '../../packages/engine-core/src/cards';
import type { KlondikeState } from '../../packages/game-klondike/src/types';

async function savedKlondike(page: Page) {
  return page.evaluate(() => {
    const saves: { klondike?: { state: KlondikeState } } = JSON.parse(localStorage.getItem('mumscards.saves') ?? '{}');
    return saves.klondike?.state ?? null;
  });
}

test('new game and continue flows preserve progress', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText("Mum's Cards")).toBeVisible();
  await page.getByRole('button', { name: 'New Klondike', exact: true }).click();
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect.poll(async () => (await savedKlondike(page))?.waste.length).toBe(3);
  const before = await savedKlondike(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Continue Last Game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Draw', exact: true })).toBeVisible();
  await expect.poll(() => savedKlondike(page)).toEqual(before);
});

test('settings preserve deal and hidden shortcuts leave it untouched', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Klondike', exact: true }).click();
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect.poll(async () => (await savedKlondike(page))?.waste.length).toBe(3);
  const before = await savedKlondike(page);
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByRole('button', { name: 'Draw 1 Draw one card from stock each time.', exact: true }).click();
  await expect.poll(() => savedKlondike(page)).toEqual(before);

  for (const ctrlKey of [false, true]) {
    const intercepted = await page.evaluate((ctrlKey) => {
      const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey, bubbles: true, cancelable: true });
      return !window.dispatchEvent(event);
    }, ctrlKey);
    expect(intercepted).toBe(false);
  }
  expect(await savedKlondike(page)).toEqual(before);
  await page.getByRole('link', { name: 'game/[gameId], back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Draw', exact: true })).toBeVisible();
  expect(await savedKlondike(page)).toEqual(before);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect.poll(async () => (await savedKlondike(page))?.drawCount).toBe(1);
});

test('drag moves selected run onto a legal destination', async ({ page }) => {
  const deck = createDeck('drag');
  const take = (suit: string, rank: number) => {
    const found = deck.find((card) => card.suit === suit && card.rank === rank);
    if (!found) throw new Error('Missing fixture card');
    return { ...found, faceUp: true };
  };
  const tableau = [[take('clubs', 9), take('hearts', 8), take('spades', 7)], [take('diamonds', 8)], [], [], [], [], []];
  const used = new Set(tableau.flat().map((card) => card.id));
  const state: KlondikeState = {
    gameId: 'klondike', drawCount: 3, emptyTableauPolicy: 'any', completed: false,
    foundations: [[], [], [], []], tableau, waste: [], stock: deck.filter((card) => !used.has(card.id)),
  };
  await page.goto('/');
  await page.evaluate((state) => {
    localStorage.setItem('mumscards.saves', JSON.stringify({ klondike: { gameId: 'klondike', updatedAt: '2026-10-11', state } }));
  }, state);
  await page.goto('/game/klondike?mode=resume');
  const source = page.getByRole('button', { name: '7 ♠ ♠ ♠', exact: true }).first();
  const target = page.getByRole('button', { name: '8 ♦ ♦ ♦', exact: true }).last();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Missing drag target');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 12, sourceBox.y + sourceBox.height / 2 + 12);
  await expect(source).toHaveCSS('opacity', '0');
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await savedKlondike(page))?.tableau[1].map((card) => card.id)).toEqual(['drag-diamonds-8', 'drag-spades-7']);
  expect((await savedKlondike(page))?.tableau[0].map((card) => card.id)).toEqual(['drag-clubs-9', 'drag-hearts-8']);
});
