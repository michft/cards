import { expect, test, type Page } from '@playwright/test';
import { rankLabel } from '../../packages/engine-core/src/cards';
import { createClockGame, drawClockStock, placeClockActiveCard } from '../../packages/game-clock/src/engine';
import type { SavedGames } from '../../apps/app/src/state/types';

const games = ['Clock', 'FreeCell', 'Klondike', 'Pyramid', 'Spider'] as const;
const visibleGames = ['FreeCell', 'Klondike', 'Spider'] as const;

for (const viewport of [{ width: 834, height: 1194 }, { width: 1194, height: 834 }, { width: 1194, height: 734 }]) {
  test.describe(`11-inch iPad ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('home previews and Continue fit the iPad', async ({ page }, testInfo) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: "Mum's Cards" })).toBeVisible();
      for (const game of visibleGames) {
        const tile = page.getByRole('button', { name: `New ${game}`, exact: true });
        await expect(tile).toBeInViewport();
        const box = await tile.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(240);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      }
      await expect(page.getByRole('button', { name: 'Continue unavailable', exact: true })).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
    });

    test('all games keep touch controls and navigation within the viewport', async ({ page }) => {
      for (const game of games) {
        await page.goto(`/game/${game.toLowerCase()}?mode=new`);
        await expect(page).toHaveURL(/mode=resume$/);
        const menu = page.getByRole('button', { name: 'Games ▾', exact: true });
        for (const name of ['Games ▾', 'New', 'Restart', 'Rules', 'Open settings']) {
          const button = page.getByRole('button', { name, exact: true });
          await expect(button).toBeVisible();
          const box = await button.boundingBox();
          expect(box, `${game}: ${name}`).not.toBeNull();
          expect(box!.width, `${game}: ${name} width`).toBeGreaterThanOrEqual(44);
          expect(box!.height, `${game}: ${name} height`).toBeGreaterThanOrEqual(44);
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        }
        const menuBox = await menu.boundingBox();
        const newBox = await page.getByRole('button', { name: 'New', exact: true }).boundingBox();
        expect(newBox!.y).toBeGreaterThanOrEqual(menuBox!.y + menuBox!.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
        const board = await page.getByTestId('game-board').boundingBox();
        expect(board, `${game}: board`).not.toBeNull();
        expect(board!.x, `${game}: board left`).toBeGreaterThanOrEqual(0);
        expect(board!.y, `${game}: board top`).toBeGreaterThanOrEqual(0);
        expect(board!.x + board!.width, `${game}: board right`).toBeLessThanOrEqual(viewport.width);
        expect(board!.y + board!.height, `${game}: board bottom`).toBeLessThanOrEqual(viewport.height);

        await menu.tap();
        for (const name of [...visibleGames.filter((name) => name !== game), '< home']) {
          const item = page.getByRole('button', { name, exact: true });
          const box = await item.boundingBox();
          expect(box, `${game}: menu ${name}`).not.toBeNull();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
          expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
        }
        await page.getByRole('button', { name: '< home', exact: true }).tap();
        await expect(page.getByText("Mum's Cards", { exact: true })).toBeVisible();
      }
    });
  });
}

test.describe('narrow home screen', () => {
  test.use({ viewport: { width: 320, height: 740 }, hasTouch: true, isMobile: true });

  test('game tiles stay inside a phone viewport', async ({ page }) => {
    await page.goto('/');
    for (const game of visibleGames) {
      const tile = page.getByRole('button', { name: `New ${game}`, exact: true });
      await tile.scrollIntoViewIfNeeded();
      const box = await tile.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
      await expect(tile).toBeInViewport();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });
});

test.describe('iPad rotation and progressed boards', () => {
  test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true });

  async function savedGame(page: Page, game: string) {
    return page.evaluate((game) => {
      const saves: Record<string, { state: object; history?: { initial: object; past: object[]; future: object[] } }> =
        JSON.parse(localStorage.getItem('mumscards.saves') ?? '{}');
      return saves[game] ?? null;
    }, game);
  }

  async function expectBoardFits(page: Page, viewport: { width: number; height: number }) {
    await expect.poll(async () => {
      const box = await page.getByTestId('game-board').boundingBox();
      return Boolean(box && box.x >= 0 && box.y >= 0
        && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
    }).toBe(true);
  }

  test('rotating every game preserves its progressed deal and undo history', async ({ page }, testInfo) => {
    for (const game of games) {
      const gameId = game.toLowerCase();
      await page.setViewportSize({ width: 834, height: 1194 });
      await page.goto(`/game/${gameId}?mode=new`);
      await expect(page).toHaveURL(/mode=resume$/);
      if (game === 'Clock') {
        await page.getByRole('button', { name: 'Stock pile 1', exact: true }).tap();
      } else if (game === 'FreeCell') {
        const card = await page.evaluate(() => {
          const saves: SavedGames = JSON.parse(localStorage.getItem('mumscards.saves') ?? '{}');
          return saves.freecell?.state.tableau[0].at(-1);
        });
        if (!card) throw new Error('Missing FreeCell rotation fixture');
        const suit = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }[card.suit];
        await page.getByRole('button', { name: `${rankLabel(card.rank)} ${suit} ${suit} ${suit}`, exact: true }).tap();
        await page.getByText('Free', { exact: true }).first().tap();
      } else if (game === 'Spider') {
        await page.getByTestId('game-board').getByRole('button').first().tap();
      } else {
        await page.getByRole('button', { name: 'Draw', exact: true }).tap();
      }
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
      await expect.poll(async () => (await savedGame(page, gameId))?.history?.past.length ?? 0).toBeGreaterThan(0);
      const progressed = await savedGame(page, gameId);

      await page.setViewportSize({ width: 1194, height: 834 });
      await expectBoardFits(page, { width: 1194, height: 834 });
      expect(await savedGame(page, gameId)).toEqual(progressed);
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath(`${gameId}-landscape.png`) });

      await page.setViewportSize({ width: 834, height: 1194 });
      await expectBoardFits(page, { width: 834, height: 1194 });
      expect(await savedGame(page, gameId)).toEqual(progressed);
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    }
  });

  test('progressed Clock hour fans fit landscape with browser chrome', async ({ page }) => {
    let seed = 42;
    const initial = createClockGame(() => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    });
    let state = initial;
    const past = [];
    for (let move = 0; move < 60 && !state.won && !state.lost; move += 1) {
      const pileIndex = state.stockPiles.findIndex((pile, index) =>
        pile.length > 0 && !state.completedStockPiles.includes(index));
      if (!state.activeCard && pileIndex < 0) break;
      const next = state.activeCard ? placeClockActiveCard(state) : drawClockStock(state, pileIndex);
      if (next === state) break;
      past.push(state);
      state = next;
      if (state.placedCardIds.length >= 8 && state.activeSource?.zone === 'hour') break;
    }
    expect(state.placedCardIds.length).toBeGreaterThanOrEqual(8);
    expect(state.activeSource?.zone).toBe('hour');
    // Engine piles remain four cards; the active hour card makes a five-card fan.
    expect(Math.max(...state.hours.map((pile, index) => pile.length
      + (state.activeSource?.zone === 'hour' && state.activeSource.hourIndex === index ? 1 : 0)))).toBe(5);
    await page.goto('/');
    await page.evaluate(({ initial, state, past }) => localStorage.setItem('mumscards.saves', JSON.stringify({
      clock: { gameId: 'clock', updatedAt: '2026-10-18T00:00:00.000Z', state, history: { initial, past, future: [] } },
    })), { initial, state, past });
    await page.setViewportSize({ width: 1194, height: 734 });
    await page.goto('/game/clock?mode=resume');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    await expectBoardFits(page, { width: 1194, height: 734 });
    for (let hour = 0; hour < 12; hour += 1) {
      const box = await page.getByTestId(`clock-hour-${hour}`).boundingBox();
      expect(box, `Clock hour ${hour}`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(1194);
      expect(box!.y + box!.height).toBeLessThanOrEqual(734);
    }
    expect((await savedGame(page, 'clock'))?.state).toEqual(state);
  });
});
