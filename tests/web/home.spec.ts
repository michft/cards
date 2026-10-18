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

test('failed writes stay visible and retry the latest local deal', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    let unavailable = false;
    window.addEventListener('fail-saves', () => { unavailable = true; });
    window.addEventListener('restore-saves', () => { unavailable = false; });
    Storage.prototype.setItem = function(key: string, value: string) {
      if (key === 'mumscards.saves' && unavailable) {
        document.documentElement.dataset.failedWrites = String(Number(document.documentElement.dataset.failedWrites ?? 0) + 1);
        throw new Error('Quota exceeded');
      }
      return original.call(this, key, value);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'New Klondike', exact: true }).click();
  await expect(page).toHaveURL(/mode=resume$/);
  const initial = await savedKlondike(page);
  await page.evaluate(() => window.dispatchEvent(new Event('fail-saves')));
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Changes could not be saved');
  expect(await savedKlondike(page)).toEqual(initial);
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.failedWrites))).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event('restore-saves')));
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect.poll(async () => (await savedKlondike(page))?.waste.length).toBe(6);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  expect((await savedKlondike(page))?.waste).toHaveLength(6);
});

test('tabs merge different games and block stale same-game writes', async ({ page, context }) => {
  const other = await context.newPage();
  await Promise.all([page.goto('/'), other.goto('/')]);
  await Promise.all([
    page.getByRole('button', { name: 'New Klondike', exact: true }).click(),
    other.getByRole('button', { name: 'New FreeCell', exact: true }).click(),
  ]);
  await expect(page).toHaveURL(/\/game\/klondike\?mode=resume$/);
  await expect(other).toHaveURL(/\/game\/freecell\?mode=resume$/);
  expect(await savedKlondike(page)).toBeTruthy();
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect.poll(async () => (await savedKlondike(page))?.waste.length).toBe(3);
  await other.goto('/game/klondike?mode=resume');
  await expect(other.getByRole('button', { name: 'Draw', exact: true })).toBeVisible();
  // The new→resume remount saves once more. Capture its final envelope after
  // leaving FreeCell, so a legitimate mount timestamp is not a merge failure.
  const freecell = await page.evaluate(() => JSON.parse(localStorage.getItem('mumscards.saves')!).freecell);
  expect(freecell).toBeTruthy();
  for (let count = 6; count <= 9; count += 3) {
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await expect.poll(async () => (await savedKlondike(page))?.waste.length).toBe(count);
  }
  const latest = await savedKlondike(page);
  await other.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('changed in another tab');
  expect(await savedKlondike(page)).toEqual(latest);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mumscards.saves')!).freecell)).toEqual(freecell);
  await other.getByRole('button', { name: 'Load latest saves', exact: true }).click();
  await expect(other.getByText("Mum's Cards")).toBeVisible();
  await other.getByRole('button', { name: 'Continue Last Game', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Draw', exact: true })).toBeVisible();
  expect(await savedKlondike(other)).toEqual(latest);
  await expect(other.getByRole('alert')).toHaveCount(0);
});

test('malformed saves and inherited rules keys do not crash screens', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('mumscards.saves', JSON.stringify({
    klondike: { gameId: 'klondike', updatedAt: '2026-10-18', state: {} },
  })));
  await page.goto('/game/klondike?mode=resume');
  await expect(page.getByRole('button', { name: 'Draw', exact: true })).toBeVisible();
  await expect.poll(async () => (await savedKlondike(page))?.stock.length).toBe(24);
  await page.goto('/rules?game=toString');
  await expect(page.getByText('Klondike', { exact: true })).toBeVisible();
  await expect(page.getByText('Build tableau piles down in alternating colours.')).toBeVisible();
});

test('reload and game navigation preserve deal, history, and Restart origin', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Klondike', exact: true }).click();
  await expect(page).toHaveURL(/\/game\/klondike\?mode=resume$/);
  const initial = await savedKlondike(page);
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect.poll(async () => (await savedKlondike(page))?.waste.length).toBe(3);
  const progressed = await savedKlondike(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  expect(await savedKlondike(page)).toEqual(progressed);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => savedKlondike(page)).toEqual(initial);
  await page.reload();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => savedKlondike(page)).toEqual(progressed);

  await page.getByRole('button', { name: 'Games ▾', exact: true }).click();
  await page.getByRole('button', { name: 'FreeCell', exact: true }).click();
  await expect(page).toHaveURL(/\/game\/freecell\?mode=resume$/);
  await page.getByRole('button', { name: 'Games ▾', exact: true }).click();
  await page.getByRole('button', { name: 'Klondike', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Draw', exact: true })).toBeVisible();
  expect(await savedKlondike(page)).toEqual(progressed);

  await page.getByRole('button', { name: 'Games ▾', exact: true }).click();
  await page.getByRole('button', { name: '< home', exact: true }).click();
  await page.getByRole('button', { name: 'Continue Last Game', exact: true }).click();
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect.poll(async () => (await savedKlondike(page))?.waste.length).toBe(6);
  const latest = await savedKlondike(page);
  await page.goBack();
  await page.goBack();
  await expect(page.getByText("Mum's Cards")).toBeVisible();
  expect(await savedKlondike(page)).toEqual(latest);
  await page.goForward();
  await page.getByRole('button', { name: 'Continue Last Game', exact: true }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect.poll(() => savedKlondike(page)).toEqual(initial);
});

test('failed storage read blocks game writes until retry recovers saves', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Klondike', exact: true }).click();
  await expect(page).toHaveURL(/mode=resume$/);
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect.poll(async () => (await savedKlondike(page))?.waste.length).toBe(3);
  const before = await savedKlondike(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    let unavailable = true;
    window.addEventListener('storage-ready', () => { unavailable = false; });
    Storage.prototype.getItem = function(key: string) {
      if (key === 'mumscards.saves' && unavailable) throw new Error('Storage unavailable');
      return original.call(this, key);
    };
  });
  await page.goto('/game/freecell?mode=new');
  await expect(page.getByRole('alert')).toContainText('Saved games could not be read');
  await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('storage-ready')));
  expect(await savedKlondike(page)).toEqual(before);
  await page.getByRole('button', { name: 'Retry storage', exact: true }).click();
  await expect(page).toHaveURL(/\/game\/freecell\?mode=resume$/);
  expect(await savedKlondike(page)).toEqual(before);
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
