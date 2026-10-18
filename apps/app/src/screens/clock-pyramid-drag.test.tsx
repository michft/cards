import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDeck, type PlayingCard } from '@mumscards/engine-core';
import { createClockGame, type ClockState } from '@mumscards/game-clock';
import { createPyramidGame, type PyramidState } from '@mumscards/game-pyramid';

import type { useAppModel } from '../state/app-provider';
import { defaultSavedGames, defaultSavedSnapshots, defaultSettings } from '../state/types';
import type { CardStack, DragPayload } from './shared/card-stack';
import { ClockGameScreen } from './clock-game-screen';
import { PyramidGameScreen } from './pyramid-game-screen';

type AppModel = ReturnType<typeof useAppModel>;
let model: AppModel;
const saveGame = vi.fn<AppModel['saveGame']>();
const stacks = new Map<string, ComponentProps<typeof CardStack>>();
const deck = createDeck('drag');

vi.mock('../state/app-provider', () => ({ useAppModel: () => model }));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => useEffect(callback, [callback]),
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('./shared/card-stack', () => ({
  CardStack: (props: ComponentProps<typeof CardStack>) => {
    if (props.onCardPress || props.onCardDragStart) {
      for (const card of props.cards) stacks.set(card.id, props);
    }
    return <div>{props.cards.map((card) => <span key={card.id}>{card.id}</span>)}</div>;
  },
}));

function card(rank: number, suit: PlayingCard['suit'] = 'spades'): PlayingCard {
  const found = deck.find((item) => item.rank === rank && item.suit === suit);
  if (!found) throw new Error('Missing fixture card');
  return found;
}

function source(rank: number) {
  const stack = stacks.get(card(rank).id);
  if (!stack) throw new Error('Missing source card');
  return stack;
}

function payload(pageX: number): DragPayload {
  return { pageX, pageY: 20, layout: { x: 0, y: 0, width: 50, height: 70 } };
}

function drag(rank: number, releaseX: number) {
  act(() => { source(rank).onCardDragStart?.(0, payload(10)); });
  act(() => { vi.runAllTimers(); });
  act(() => { source(rank).onCardDragMove?.(0, payload(110)); });
  act(() => { source(rank).onCardDragEnd?.(0, payload(releaseX)); });
  act(() => { vi.runAllTimers(); });
}

function present() {
  const state = saveGame.mock.calls.at(-1)?.[1].state;
  if (!state) throw new Error('Missing saved deal');
  return state;
}

function resume(state: ClockState | PyramidState) {
  model.saves = {
    ...defaultSavedGames,
    [state.gameId]: { gameId: state.gameId, state, updatedAt: '2026-10-18' },
  };
  render(state.gameId === 'clock' ? <ClockGameScreen mode="resume" /> : <PyramidGameScreen mode="resume" />);
  act(() => { vi.runAllTimers(); });
}

function clock(activeRank: number): ClockState {
  return {
    ...createClockGame(() => 0.5),
    hours: Array.from({ length: 12 }, () => []),
    stockPiles: [[], [], [], []],
    activeCard: card(activeRank),
    activeSource: { zone: 'hour', hourIndex: 1 },
    activeStockPileIndex: 2,
  };
}

function pyramid(): PyramidState {
  const state = createPyramidGame(() => 0.5);
  state.tableau = state.tableau.map((row) => row.map(() => null));
  state.tableau[6][0] = card(7);
  state.tableau[6][1] = card(6);
  state.tableau[6][2] = card(9);
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
  stacks.clear();
  saveGame.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const key = this.getAttribute('data-testid');
    const left = key === 'clock-hour-5' || key === 'pyramid-cell-6-1' || key === 'pyramid-waste'
      ? 100 : key === 'clock-stock-2' || key === 'pyramid-cell-6-2' ? 200 : 0;
    return { x: left, y: 0, left, top: 0, right: left + 50, bottom: 70, width: 50, height: 70, toJSON() {} };
  });
  model = {
    hydrated: true, hydrationError: null, persistenceError: null, storageConflict: false, saveRevision: 0,
    retryPersistence: vi.fn().mockResolvedValue(undefined), reloadSavedGames: vi.fn().mockResolvedValue(undefined), retryHydration: vi.fn().mockResolvedValue(undefined),
    settings: { ...defaultSettings }, saves: { ...defaultSavedGames }, snapshots: { ...defaultSavedSnapshots }, saveGame,
    clearGame: vi.fn().mockResolvedValue(undefined), updateSettings: vi.fn().mockResolvedValue(undefined),
    saveSnapshot: vi.fn().mockResolvedValue(undefined), deleteSnapshot: vi.fn().mockResolvedValue(undefined),
  };
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('places a dragged Clock card at its matching hour and stops after one manual move', () => {
  const state = clock(5);
  state.hours[5] = [card(8)];
  resume(state);
  drag(5, 110);
  const next = present();
  if (next.gameId !== 'clock') throw new Error('Unexpected saved game');
  expect(next.hours[5].map((item) => item.rank)).toEqual([5]);
  expect(next.activeCard?.rank).toBe(8);
  expect(next.hours[8]).toEqual([]);
});

it('rejects Clock releases outside the matching hour without saving or adding undo history', () => {
  resume(clock(5));
  const before = saveGame.mock.calls.length;
  drag(5, 900);
  expect(saveGame.mock.calls).toHaveLength(before);
  const next = present();
  if (next.gameId !== 'clock') throw new Error('Unexpected saved game');
  expect(next.activeCard?.rank).toBe(5);
});

it('returns a dragged Clock King only to its original stock pile', () => {
  resume(clock(13));
  drag(13, 210);
  const next = present();
  if (next.gameId !== 'clock') throw new Error('Unexpected saved game');
  expect(next.stockPiles[2].map((item) => item.rank)).toEqual([13]);
  expect(next.completedStockPiles).toEqual([2]);
});

it('removes a legal Pyramid pair and permits undo', () => {
  resume(pyramid());
  drag(7, 110);
  const next = present();
  if (next.gameId !== 'pyramid') throw new Error('Unexpected saved game');
  expect(next.tableau[6].slice(0, 3)).toEqual([null, null, card(9)]);
  expect(next.removedCount).toBe(2);
  expect(saveGame.mock.calls.at(-1)?.[1].history?.past).toHaveLength(1);
});

it('rejects a Pyramid non-pair at final release instead of using the prior highlighted partner', () => {
  resume(pyramid());
  const before = saveGame.mock.calls.length;
  drag(7, 210);
  expect(saveGame.mock.calls).toHaveLength(before);
});

it('pairs a Pyramid tableau card with the waste by dragging', () => {
  const state = pyramid();
  state.tableau[6][1] = null;
  state.waste = [card(6)];
  resume(state);
  drag(7, 110);
  const next = present();
  if (next.gameId !== 'pyramid') throw new Error('Unexpected saved game');
  expect(next.waste).toEqual([]);
  expect(next.tableau[6][0]).toBeNull();
});

it('preserves legal Pyramid half-blocked parent and child pairing', () => {
  const state = pyramid();
  state.tableau[6][0] = null;
  state.tableau[5][0] = card(7);
  resume(state);
  drag(7, 110);
  const next = present();
  if (next.gameId !== 'pyramid') throw new Error('Unexpected saved game');
  expect(next.tableau[5][0]).toBeNull();
  expect(next.tableau[6][1]).toBeNull();
});

it('keeps Pyramid King removal available by tapping', () => {
  const state = pyramid();
  state.tableau[6][0] = card(13);
  resume(state);
  act(() => { source(13).onCardPress?.(); });
  const next = present();
  if (next.gameId !== 'pyramid') throw new Error('Unexpected saved game');
  expect(next.tableau[6][0]).toBeNull();
  expect(next.removedCount).toBe(1);
});

it('rejects a Clock King dropped on another stock pile', () => {
  resume(clock(13));
  const before = saveGame.mock.calls.length;
  drag(13, 10);
  expect(saveGame.mock.calls).toHaveLength(before);
});

it('pairs the Pyramid waste with a legal tableau partner by dragging', () => {
  const state = pyramid();
  state.tableau[6][0] = null;
  state.waste = [card(7)];
  resume(state);
  drag(7, 110);
  const next = present();
  if (next.gameId !== 'pyramid') throw new Error('Unexpected saved game');
  expect(next.waste).toEqual([]);
  expect(next.tableau[6][1]).toBeNull();
});

it.each(['clock', 'pyramid'])('restores %s card visibility when the gesture is cancelled', (game) => {
  const rank = game === 'clock' ? 5 : 7;
  resume(game === 'clock' ? clock(rank) : pyramid());
  const before = saveGame.mock.calls.length;
  act(() => { source(rank).onCardDragStart?.(0, payload(10)); });
  act(() => { vi.runAllTimers(); });
  expect(source(rank).hiddenFromIndex).toBe(0);
  act(() => { source(rank).onCardDragCancel?.(); });
  expect(source(rank).hiddenFromIndex).toBeUndefined();
  expect(saveGame.mock.calls).toHaveLength(before);
});
