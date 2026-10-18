import { expect, test, type Locator, type Page } from '@playwright/test';
import { rankLabel, type PlayingCard } from '../../packages/engine-core/src/cards';
import { createClockGame, drawClockStock, placeClockActiveCard } from '../../packages/game-clock/src/engine';
import type { ClockState } from '../../packages/game-clock/src/types';
import { applyFreeCellMove, createFreeCellGame } from '../../packages/game-freecell/src/engine';
import type { FreeCellState } from '../../packages/game-freecell/src/types';
import { createPyramidGame, removePyramidCards } from '../../packages/game-pyramid/src/engine';
import type { PyramidSource, PyramidState } from '../../packages/game-pyramid/src/types';
import { createSpiderGame } from '../../packages/game-spider/src/engine';
import type { SpiderState, SpiderTableauCard } from '../../packages/game-spider/src/types';

type GameState = ClockState | FreeCellState | PyramidState | SpiderState;
const suits: Record<PlayingCard['suit'], string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };

test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true });

function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function cardLocator(page: Page, card: PlayingCard) {
  const suit = suits[card.suit];
  return page.getByRole('button', { name: `${rankLabel(card.rank)} ${suit} ${suit} ${suit}`, exact: true }).first();
}

async function saved(page: Page, game: GameState['gameId']) {
  return page.evaluate((game) => {
    const games: Partial<Record<GameState['gameId'], { state: GameState }>> = JSON.parse(localStorage.getItem('mumscards.saves') ?? '{}');
    return games[game]?.state ?? null;
  }, game);
}

async function resume(page: Page, state: GameState) {
  await page.goto('/');
  await page.evaluate((state) => localStorage.setItem('mumscards.saves', JSON.stringify({
    [state.gameId]: { gameId: state.gameId, updatedAt: '2026-10-18T00:00:00.000Z', state },
  })), state);
  await page.goto(`/game/${state.gameId}?mode=resume`);
  await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeVisible();
  await expect.poll(() => saved(page, state.gameId)).toEqual(state);
}

async function drag(page: Page, source: Locator, target: Locator | null, exposedStrip = false) {
  await source.scrollIntoViewIfNeeded();
  const box = await source.boundingBox();
  if (!box) throw new Error('Missing source card');
  const x = box.x + box.width / 2;
  const y = box.y + (exposedStrip ? 8 : box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 2);
  await expect(source).toHaveCSS('opacity', '0');
  const destination = await target?.boundingBox();
  if (target && !destination) throw new Error('Missing drop target');
  await page.mouse.move(destination ? destination.x + destination.width / 2 : 5,
    destination ? destination.y + destination.height / 2 : 5, { steps: 20 });
  await page.mouse.up();
}

async function rejectThenMove(page: Page, state: GameState, source: Locator, target: Locator,
  expected: GameState, exposedStrip = false) {
  await drag(page, source, null, exposedStrip);
  await expect(source).toHaveCSS('opacity', '1');
  expect(await saved(page, state.gameId)).toEqual(state);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await drag(page, source, target, exposedStrip);
  await expect.poll(() => saved(page, state.gameId)).toEqual(expected);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => saved(page, state.gameId)).toEqual(state);
}

test('Clock active card drags to its matching hour; invalid drops preserve the deal', async ({ page }) => {
  const initial = createClockGame(random(42));
  const pileIndex = initial.stockPiles.findIndex((pile) => pile.at(-1)?.rank !== 13);
  const state = drawClockStock(initial, pileIndex);
  const active = state.activeCard;
  if (!active || active.rank === 13) throw new Error('Missing non-King Clock fixture');
  await resume(page, state);
  await rejectThenMove(page, state, cardLocator(page, active),
    page.getByTestId(`clock-hour-${active.rank === 12 ? 0 : active.rank}`), placeClockActiveCard(state));
  // A card drawn from an hour must keep its label and drag target reachable.
  const placed = placeClockActiveCard(state);
  await drag(page, cardLocator(page, active), page.getByTestId(`clock-hour-${active.rank === 12 ? 0 : active.rank}`));
  await expect.poll(() => saved(page, 'clock')).toEqual(placed);
  const next = placed.activeCard;
  if (!next) throw new Error('Missing active Clock hour fixture');
  await expect(cardLocator(page, next)).toBeVisible({ timeout: 3000 });
  await drag(page, cardLocator(page, next), next.rank === 13
    ? page.getByTestId(`clock-stock-${placed.activeStockPileIndex}`)
    : page.getByTestId(`clock-hour-${next.rank === 12 ? 0 : next.rank}`));
  await expect.poll(() => saved(page, 'clock')).toEqual(placeClockActiveCard(placed));
});

test('Pyramid cards drag onto legal partners; invalid drops preserve the deal', async ({ page }) => {
  let pair: { state: PyramidState; source: PyramidSource; destination: PyramidSource; lead: PlayingCard } | undefined;
  for (let seed = 1; seed <= 20 && !pair; seed += 1) {
    const state = createPyramidGame(random(seed));
    for (let left = 0; left < 7 && !pair; left += 1) {
      for (let right = left + 1; right < 7 && !pair; right += 1) {
        const source: PyramidSource = { zone: 'tableau', rowIndex: 6, cardIndex: left };
        const destination: PyramidSource = { zone: 'tableau', rowIndex: 6, cardIndex: right };
        const lead = state.tableau[6][left];
        if (lead && removePyramidCards(state, [source, destination]) !== state) {
          pair = { state, source, destination, lead };
        }
      }
    }
  }
  if (!pair || pair.destination.zone !== 'tableau') throw new Error('Missing legal Pyramid fixture');
  await resume(page, pair.state);
  await rejectThenMove(page, pair.state, cardLocator(page, pair.lead),
    page.getByTestId(`pyramid-cell-${pair.destination.rowIndex}-${pair.destination.cardIndex}`),
    removePyramidCards(pair.state, [pair.source, pair.destination]));
});

test('FreeCell card drags into a free cell; invalid drops preserve the deal', async ({ page }) => {
  const state = createFreeCellGame(random(42));
  const pile = state.tableau[0];
  const card = pile.at(-1);
  if (!card) throw new Error('Missing FreeCell fixture');
  await resume(page, state);
  await rejectThenMove(page, state, cardLocator(page, card), page.getByText('Free', { exact: true }).first(),
    applyFreeCellMove(state, { zone: 'tableau', pileIndex: 0, cardIndex: pile.length - 1 }, { zone: 'cell', cellIndex: 0 }));
});

test('Spider drags an entire same-suit run; invalid drops preserve the deal', async ({ page }) => {
  const state = createSpiderGame(random(42), { suitMode: 'spades-only' });
  const pool = state.tableau.flat();
  function take(rank: number): SpiderTableauCard {
    const index = pool.findIndex((card) => card.rank === rank);
    if (index < 0) throw new Error('Missing Spider fixture rank');
    return { ...pool.splice(index, 1)[0], faceUp: true };
  }
  const lead = take(7);
  const tail = take(6);
  const target = take(8);
  // Rearrange only the existing 54 tableau cards; all 104 card IDs and 50 stock cards remain.
  state.tableau = state.tableau.map((pile, pileIndex) => {
    const reserved = pileIndex === 0 ? [lead, tail] : pileIndex === 1 ? [target] : [];
    const cards = pool.splice(0, pile.length - reserved.length)
      .map((card) => ({ ...card, faceUp: false }));
    if (!reserved.length && cards.length) cards[cards.length - 1].faceUp = true;
    return [...cards, ...reserved];
  });
  const expected = structuredClone(state);
  expected.tableau[1].push(...expected.tableau[0].splice(-2));
  expected.tableau[0][expected.tableau[0].length - 1].faceUp = true;
  await resume(page, state);
  await rejectThenMove(page, state, cardLocator(page, lead), cardLocator(page, target), expected, true);
});
