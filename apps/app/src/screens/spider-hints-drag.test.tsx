import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDeck, type PlayingCard } from '@mumscards/engine-core';
import { createSpiderGame, type SpiderState } from '@mumscards/game-spider';
import type { useAppModel } from '../state/app-provider';
import { defaultSavedGames, defaultSavedSnapshots, defaultSettings } from '../state/types';
import type { CardStack, DragPayload } from './shared/card-stack';
import { SpiderGameScreen } from './spider-game-screen';

type AppModel = ReturnType<typeof useAppModel>;
let model: AppModel;
const saveGame = vi.fn<AppModel['saveGame']>();
const stacks = new Map<string, ComponentProps<typeof CardStack>>();
vi.mock('../state/app-provider', () => ({ useAppModel: () => model }));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => useEffect(callback, [callback]),
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('./shared/card-stack', () => ({
  CardStack: (props: ComponentProps<typeof CardStack>) => {
    if (props.onCardDragStart && props.cards[0]) stacks.set(props.cards[0].id, props);
    return <div>{props.cards.map((card, index) => (
      <button type="button" aria-label={card.id} key={card.id} onClick={() => {
        if (props.onFaceUpCardPress) props.onFaceUpCardPress(index);
        else props.onCardPress?.();
      }}>{card.id}</button>
    ))}</div>;
  },
}));

function card(suit: PlayingCard['suit'], rank: number, suffix = '') {
  const found = createDeck('spider').find((item) => item.suit === suit && item.rank === rank);
  if (!found) throw new Error('Missing fixture card');
  return { ...found, id: found.id + suffix, faceUp: true };
}

function fixture(): SpiderState {
  return {
    ...createSpiderGame(() => 0.5), stock: [], foundations: [], completedRuns: 0,
    tableau: [
      [card('spades', 7), card('spades', 6)],
      [card('hearts', 8)], [card('diamonds', 8)],
      ...Array.from({ length: 7 }, (_, index) => [card('clubs', 13, `-${index}`)]),
    ],
  };
}

function setSaved(state: SpiderState) {
  model.saves.spider = { gameId: 'spider', updatedAt: '2026-10-18', state };
}

function present(): SpiderState {
  const state = saveGame.mock.calls.at(-1)?.[1].state;
  if (state?.gameId !== 'spider') throw new Error('Missing saved Spider deal');
  return state;
}

function hint() { fireEvent.click(screen.getByRole('button', { name: 'Hint' })); }
function payload(pageX: number): DragPayload {
  return { pageX, pageY: 20, layout: { x: 0, y: 0, width: 50, height: 70 } };
}
function source() {
  const stack = stacks.get('spider-spades-7');
  if (!stack) throw new Error('Missing draggable source');
  return stack;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  stacks.clear();
  saveGame.mockReset().mockResolvedValue(undefined);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const left = this.textContent === 'spider-hearts-8' ? 100
      : this.textContent === 'spider-diamonds-7' ? 200 : 0;
    return { x: left, y: 0, left, top: 0, right: left + 50, bottom: 70, width: 50, height: 70, toJSON() {} };
  });
  model = {
    hydrated: true, hydrationError: null, persistenceError: null, storageConflict: false, saveRevision: 0,
    retryPersistence: vi.fn().mockResolvedValue(undefined), reloadSavedGames: vi.fn().mockResolvedValue(undefined), retryHydration: vi.fn().mockResolvedValue(undefined),
    settings: { ...defaultSettings }, saves: { ...defaultSavedGames }, snapshots: { ...defaultSavedSnapshots }, saveGame,
    clearGame: vi.fn().mockResolvedValue(undefined), updateSettings: vi.fn().mockResolvedValue(undefined),
    saveSnapshot: vi.fn().mockResolvedValue(undefined), deleteSnapshot: vi.fn().mockResolvedValue(undefined),
  };
  setSaved(fixture());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('cycles all legal hints, wraps, and leaves cards and history unchanged', () => {
  render(<SpiderGameScreen mode="resume" />);
  const before = saveGame.mock.calls.length;
  const initial = structuredClone(present());
  hint();
  expect(screen.getByRole('status').textContent).toBe('Hint 1 of 2: Move the run starting with 7 of spades from column 1 to column 2.');
  hint();
  expect(screen.getByRole('status').textContent).toContain('Hint 2 of 2: Move the run starting with 7 of spades from column 1 to column 3.');
  hint();
  expect(screen.getByRole('status').textContent).toContain('Hint 1 of 2:');
  expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  expect(saveGame.mock.calls).toHaveLength(before);
  expect(present()).toEqual(initial);
  expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
});

it('resets the hint after moves, stock, Undo, Redo, Restart, New, and snapshot loading', () => {
  const state = fixture();
  state.stock = createDeck('stock').slice(0, 10);
  setSaved(state);
  model.settings.spiderDebugTools = true;
  model.snapshots.spider = [{ gameId: 'spider', updatedAt: '2026-10-18', id: 'saved', label: 'Earlier Spider', state }];
  render(<SpiderGameScreen mode="resume" />);
  hint(); hint();
  fireEvent.click(screen.getByLabelText('spider-spades-7'));
  fireEvent.click(screen.getByLabelText('spider-hearts-8'));
  expect(screen.queryByRole('status')).toBeNull();
  hint();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.queryByRole('status')).toBeNull();
  hint();
  expect(screen.getByRole('status').textContent).toContain('Hint 1 of 3:');
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(screen.queryByRole('status')).toBeNull();
  hint();
  fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
  expect(screen.queryByRole('status')).toBeNull();
  hint();
  fireEvent.click(screen.getByLabelText(state.stock.at(-1)!.id));
  expect(screen.queryByRole('status')).toBeNull();
  hint();
  fireEvent.click(screen.getByRole('button', { name: 'Load' }));
  fireEvent.click(screen.getByRole('button', { name: 'Earlier Spider' }));
  expect(screen.queryByRole('status')).toBeNull();
  hint();
  fireEvent.click(screen.getByRole('button', { name: 'New' }));
  expect(screen.queryByRole('status')).toBeNull();
});

it.each([9, 10])('does not suggest a blocked stock deal with %s stock cards or pointless empty-column moves', (stockCount) => {
  const state = fixture();
  state.stock = createDeck('stock').slice(0, stockCount);
  state.tableau = Array.from({ length: 10 }, (_, index) => index === 9 ? [] : [card('clubs', 13, `-${index}`)]);
  setSaved(state);
  render(<SpiderGameScreen mode="resume" />);
  hint();
  expect(screen.getByRole('status').textContent).toBe('No hints available. Undo or start another game.');
});

it('suggests a stock deal only when all ten columns are occupied', () => {
  const state = fixture();
  state.stock = createDeck('stock').slice(0, 10);
  state.tableau = Array.from({ length: 10 }, (_, index) => [card('clubs', 13, `-${index}`)]);
  setSaved(state);
  render(<SpiderGameScreen mode="resume" />);
  hint();
  expect(screen.getByRole('status').textContent).toBe('Hint 1 of 1: Deal a row from the stock.');
});

it('does not offer an incomplete stock row even with every column occupied', () => {
  const state = fixture();
  state.stock = createDeck('stock').slice(0, 9);
  state.tableau = Array.from({ length: 10 }, (_, index) => [card('clubs', 13, `-${index}`)]);
  setSaved(state);
  render(<SpiderGameScreen mode="resume" />);
  hint();
  expect(screen.getByRole('status').textContent).toContain('No hints available.');
});

it('does not suggest moving a descending run with mixed suits', () => {
  const state = fixture();
  state.tableau[0][1] = card('hearts', 6);
  setSaved(state);
  render(<SpiderGameScreen mode="resume" />);
  hint();
  expect(screen.getByRole('status').textContent).toContain('No hints available.');
});

it('offers no hint for a won board', () => {
  setSaved({ ...fixture(), completedRuns: 8 });
  render(<SpiderGameScreen mode="resume" />);
  expect(screen.getByRole('button', { name: 'Hint' }).getAttribute('aria-disabled')).toBe('true');
  expect(screen.queryByRole('status')).toBeNull();
});

it.each([110, 210, 900])('drops exactly the dragged run at final release %s without destination-aware fallback', (releaseX) => {
  const state = fixture();
  state.tableau[2] = [card('diamonds', 7)];
  setSaved(state);
  render(<SpiderGameScreen mode="resume" />);
  act(() => { vi.runAllTimers(); });
  act(() => { source().onCardDragStart?.(1, payload(10)); });
  act(() => { vi.runAllTimers(); });
  expect(source().hiddenFromIndex).toBe(1);
  expect(source().cards).toHaveLength(2);
  act(() => { source().onCardDragMove?.(1, payload(210)); });
  const before = saveGame.mock.calls.length;
  act(() => { source().onCardDragEnd?.(1, payload(releaseX)); vi.runAllTimers(); });
  if (releaseX === 210) {
    expect(present().tableau[0].map((item) => item.rank)).toEqual([7]);
    expect(present().tableau[2].map((item) => item.rank)).toEqual([7, 6]);
  } else {
    expect(saveGame.mock.calls).toHaveLength(before);
    expect(present()).toEqual(state);
  }
});

it('cancels a gesture without moving cards or adding history', () => {
  render(<SpiderGameScreen mode="resume" />);
  act(() => { vi.runAllTimers(); });
  act(() => { source().onCardDragStart?.(0, payload(10)); vi.runAllTimers(); });
  const before = saveGame.mock.calls.length;
  act(() => { source().onCardDragCancel?.(); });
  expect(source().hiddenFromIndex).toBeUndefined();
  expect(saveGame.mock.calls).toHaveLength(before);
  expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
});
