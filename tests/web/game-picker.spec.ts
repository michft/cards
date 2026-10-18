import { expect, test, type Page } from '@playwright/test';
import { createClockGame } from '../../packages/game-clock/src/engine';
import { createFreeCellGame } from '../../packages/game-freecell/src/engine';
import { createKlondikeGame, drawFromStock } from '../../packages/game-klondike/src/engine';
import { createPyramidGame } from '../../packages/game-pyramid/src/engine';
import { createSpiderGame } from '../../packages/game-spider/src/engine';

const games = [{ id: 'klondike', name: 'Klondike' }, { id: 'freecell', name: 'FreeCell' }, { id: 'spider', name: 'Spider' }] as const;
const clock = createClockGame(() => 0.5);
const pyramid = createPyramidGame(() => 0.5);

async function seed(page: Page) {
  const klondike = createKlondikeGame(() => 0.5);
  const freecell = createFreeCellGame(() => 0.5);
  const spider = createSpiderGame(() => 0.5);
  const progressedFreeCell = structuredClone(freecell);
  progressedFreeCell.freeCells[0] = progressedFreeCell.tableau[0].pop()!;
  const progressedSpider = structuredClone(spider);
  for (const pile of progressedSpider.tableau) pile.push({ ...progressedSpider.stock.pop()!, faceUp: true });
  const positions = {
    clock: { initial: clock, state: clock }, pyramid: { initial: pyramid, state: pyramid },
    klondike: { initial: klondike, state: drawFromStock(klondike) },
    freecell: { initial: freecell, state: progressedFreeCell }, spider: { initial: spider, state: progressedSpider },
  };
  await page.goto('/');
  await page.evaluate((positions) => localStorage.setItem('mumscards.saves', JSON.stringify(
    Object.fromEntries(Object.entries(positions).map(([gameId, { initial, state }]) => [gameId, {
      gameId, state, updatedAt: '2026-10-18T00:00:00Z', history: { initial, past: [initial], future: [] },
    }])),
  )), positions);
}

for (const viewport of [{ width: 834, height: 1194 }, { width: 1194, height: 734 }]) {
  test.describe(`image game picker ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('right-side images start new current and different games, keeping hidden saves', async ({ page }, testInfo) => {
      for (let index = 0; index < games.length; index += 1) {
        const game = games[index];
        await seed(page);
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'New Clock', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'New Pyramid', exact: true })).toHaveCount(0);
        await page.goto(`/game/${game.id}?mode=resume`);
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
        const rail = page.getByTestId('new-game-rail');
        const board = page.getByTestId('game-board');
        await expect(rail.getByRole('button')).toHaveCount(3);
        for (const choice of games) {
          const box = await rail.getByRole('button', { name: `New ${choice.name}`, exact: true }).boundingBox();
          const boardBox = await board.boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(boardBox!.x + boardBox!.width);
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
          expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
        }
        await page.getByRole('button', { name: 'Games ▾', exact: true }).tap();
        await expect(page.getByRole('button', { name: 'Clock', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Pyramid', exact: true })).toHaveCount(0);
        await rail.getByRole('button', { name: `New ${game.name}`, exact: true }).tap();
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
        await expect.poll(() => page.evaluate((id) => {
          const save = JSON.parse(localStorage.getItem('mumscards.saves')!)[id];
          return save.history.past.length === 0 && save.history.future.length === 0
            && JSON.stringify(save.history.initial) === JSON.stringify(save.state);
        }, game.id)).toBe(true);
        const next = games[(index + 1) % games.length];
        await rail.getByRole('button', { name: `New ${next.name}`, exact: true }).tap();
        await expect(page).toHaveURL(new RegExp(`/game/${next.id}\\?mode=resume$`));
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
        const saves = await page.evaluate(() => JSON.parse(localStorage.getItem('mumscards.saves')!));
        expect(saves.clock.state).toEqual(clock);
        expect(saves.pyramid.state).toEqual(pyramid);
        expect(saves[next.id].history.past).toEqual([]);
      }
      await page.screenshot({ path: testInfo.outputPath('right-side-game-images.png') });
    });
  });
}
