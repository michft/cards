import { expect, test, type Page } from '@playwright/test';
import { createClockGame, drawClockStock, placeClockActiveCard } from '../../packages/game-clock/src/engine';
import { createFreeCellGame } from '../../packages/game-freecell/src/engine';
import { createKlondikeGame } from '../../packages/game-klondike/src/engine';
import { createPyramidGame, drawPyramidStock } from '../../packages/game-pyramid/src/engine';
import { createSpiderGame } from '../../packages/game-spider/src/engine';
import type { GameStateMap, GameVariant } from '../../apps/app/src/state/types';

function random(seed = 42) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function longSavedLayouts(): GameStateMap {
  const freecell = createFreeCellGame(random());
  const freeCards = freecell.tableau.flat();
  freecell.tableau = [freeCards.splice(0, 19), ...Array.from({ length: 7 }, (_, index) =>
    freeCards.slice(index * 5, index * 5 + 5))];

  const klondike = createKlondikeGame(random());
  const klondikeCards = [...klondike.stock, ...klondike.tableau.flat()];
  const run = Array.from({ length: 13 }, (_, index) => {
    const rank = 13 - index;
    const suit = index % 2 === 0 ? 'spades' : 'hearts';
    const cardIndex = klondikeCards.findIndex((card) => card.rank === rank && card.suit === suit);
    return { ...klondikeCards.splice(cardIndex, 1)[0], faceUp: true };
  });
  klondike.stock = [];
  klondike.tableau = [
    [...klondikeCards.splice(0, 6).map((card) => ({ ...card, faceUp: false })), ...run],
    ...Array.from({ length: 6 }, (_, index) => klondikeCards.slice(index * 6, index * 6 + 6)
      .map((card) => ({ ...card, faceUp: true }))),
  ];

  const spider = createSpiderGame(random());
  const spiderCards = spider.tableau.flat();
  spider.tableau = [
    spiderCards.splice(0, 32).map((card, index) => ({ ...card, faceUp: index >= 5 })),
    ...Array.from({ length: 9 }, (_, index) => spiderCards.slice(index * 3, index * 3 + 3)
      .map((card) => ({ ...card, faceUp: true }))),
  ];

  let clock = createClockGame(random());
  for (let move = 0; move < 60 && !clock.won && !clock.lost; move += 1) {
    const pile = clock.stockPiles.findIndex((cards, index) => cards.length > 0 && !clock.completedStockPiles.includes(index));
    clock = clock.activeCard ? placeClockActiveCard(clock) : drawClockStock(clock, pile);
    if (clock.placedCardIds.length >= 8 && clock.activeSource?.zone === 'hour') break;
  }
  // Stress saved layouts retain every original card; only Clock is reached through engine moves.
  return { freecell, klondike, spider, clock, pyramid: drawPyramidStock(createPyramidGame(random())) };
}

const layouts = longSavedLayouts();

async function saved(page: Page, game: GameVariant) {
  return page.evaluate((game) => JSON.parse(localStorage.getItem('mumscards.saves') ?? '{}')[game]?.state, game);
}

async function expectBoardFits(page: Page) {
  // Inspect descendants too: a correctly sized container can still have overflowing cards or labels.
  await expect.poll(() => page.getByTestId('game-board').evaluate((board) => {
    const errors: string[] = [];
    const bounds = board.getBoundingClientRect();
    for (const node of [board, ...board.querySelectorAll('*')]) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1
        || rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1) {
        errors.push(`${node.getAttribute('data-testid') ?? node.getAttribute('role') ?? node.tagName}: ${JSON.stringify(rect.toJSON())}`);
      }
    }
    if (document.documentElement.scrollWidth > innerWidth) errors.push('horizontal page overflow');
    return errors;
  })).toEqual([]);
}

for (const viewport of [
  { width: 834, height: 1194 }, { width: 1194, height: 834 }, { width: 1194, height: 734 },
  { width: 600, height: 900 }, { width: 900, height: 600 },
  { width: 390, height: 844 }, { width: 844, height: 390 },
]) {
  test.describe(`bounded boards ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('all five long saved layouts fit, including hints and held-open piles', async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await page.goto('/');
      await page.evaluate((layouts) => localStorage.setItem('mumscards.saves', JSON.stringify(
        Object.fromEntries(Object.entries(layouts).map(([gameId, state]) => [gameId, {
          gameId, state, updatedAt: '2026-10-18T00:00:00Z',
        }])),
      )), layouts);
      for (const game of Object.keys(layouts) as GameVariant[]) {
        await page.goto(`/game/${game}?mode=resume`);
        await expect(page.getByRole('button', { name: 'Restart', exact: true }).first()).toBeVisible();
        await test.step(`${game}: board bounds`, () => expectBoardFits(page));
        expect(await saved(page, game)).toEqual(layouts[game]);
        if (game === 'klondike' || game === 'freecell' || game === 'spider') {
          const pile = page.getByTestId('game-tableau-0');
          const cards = pile.getByRole('button');
          const count = game === 'spider' ? 32 : 19;
          // Klondike also has the containing destination button.
          await expect(cards).toHaveCount(count + (game === 'klondike' ? 1 : 0));
          const runLead = game === 'klondike' ? await cards.nth(7).boundingBox() : null;
          const bottom = await cards.last().boundingBox();
          if (!bottom) throw new Error(`Missing ${game} bottom card`);
          await page.mouse.move(bottom.x + bottom.width / 2, bottom.y + bottom.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(350);
          await expectBoardFits(page);
          await expect(cards).toHaveCount(count + (game === 'klondike' ? 1 : 0));
          await page.mouse.up();
          if (game === 'klondike') {
            await expect.poll(async () => (await cards.nth(7).boundingBox())?.y).toBe(runLead!.y);
            const lead = await cards.nth(7).boundingBox(); // First face-up card starts a 13-card run.
            const next = await cards.nth(8).boundingBox();
            if (!lead || !next) throw new Error('Missing long run');
            expect(next.y - lead.y).toBeGreaterThan(0);
            const exposedY = lead.y + (next.y - lead.y) / 2;
            await page.mouse.move(lead.x + lead.width / 2, exposedY);
            await page.mouse.down();
            await page.mouse.move(lead.x + lead.width / 2 + 12, exposedY, { steps: 3 });
            const preview = page.getByTestId('drag-preview');
            await expect(preview).toBeVisible();
            await page.mouse.move(viewport.width - 2, viewport.height - 2, { steps: 4 });
            await expect.poll(() => preview.evaluate((root) => [...root.querySelectorAll('[role="button"]')].flatMap((node) => {
              const rect = node.getBoundingClientRect();
              return rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1
                ? [] : [JSON.stringify(rect.toJSON())];
            }))).toEqual([]);
            await expect(preview.getByRole('button')).toHaveCount(13);
            await page.mouse.up();
          }
          await page.getByRole('button', { name: 'Hint', exact: true }).tap();
          await expectBoardFits(page);
          expect(await saved(page, game)).toEqual(layouts[game]);
        }
        if (game === 'freecell') {
          const index = layouts.freecell.tableau.findIndex((pile) => pile.length && pile.at(-1)!.rank !== 1);
          await page.getByTestId(`game-tableau-${index}`).getByRole('button').last().tap();
          await page.getByRole('button', { name: 'A', exact: true }).first().tap();
          await expect(page.getByRole('status')).toContainText('An empty foundation must start with an Ace.');
          const footer = await page.getByTestId('move-feedback').boundingBox();
          const board = await page.getByTestId('game-board').boundingBox();
          expect(footer!.y).toBeGreaterThanOrEqual(board!.y + board!.height);
          expect(footer!.y + footer!.height).toBeLessThanOrEqual(viewport.height);
          expect(await saved(page, game)).toEqual(layouts[game]);
        }
        await page.screenshot({ path: testInfo.outputPath(`${game}.png`) });
      }
    });
  });
}
