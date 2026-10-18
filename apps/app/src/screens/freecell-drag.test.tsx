import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDeck } from '@mumscards/engine-core';
import { createFreeCellGame, type FreeCellState } from '@mumscards/game-freecell';
import type { useAppModel } from '../state/app-provider';
import { defaultSavedGames, defaultSavedSnapshots, defaultSettings } from '../state/types';
import type { CardStack, DragPayload } from './shared/card-stack';
import { FreeCellGameScreen } from './freecell-game-screen';

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
    return <div>{props.cards.length ? props.cards.map((card) => <span key={card.id}>{card.id}</span>) : props.placeholderLabel}</div>;
  },
}));

function payload(pageX: number): DragPayload {
  return { pageX, pageY: 20, layout: { x: 0, y: 0, width: 50, height: 70 } };
}

function source() {
  const stack = stacks.get('drag-spades-7');
  if (!stack) throw new Error('Missing draggable source');
  return stack;
}

function present(): FreeCellState {
  const state = saveGame.mock.calls.at(-1)?.[1].state;
  if (state?.gameId !== 'freecell') throw new Error('Missing saved deal');
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
  stacks.clear();
  saveGame.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const left = this.textContent === 'drag-hearts-8' ? 100 : this.textContent === 'drag-diamonds-8' ? 200 : this.textContent === 'Free' ? -100 : this.textContent === 'A' ? 300 : 400;
    return { x: left, y: 0, left, top: 0, right: left + 50, bottom: 70, width: 50, height: 70, toJSON() {} };
  });
  const deck = createDeck('drag');
  const card = (suit: string, rank: number) => {
    const found = deck.find((item) => item.suit === suit && item.rank === rank);
    if (!found) throw new Error('Missing fixture card');
    return { ...found, faceUp: true };
  };
  const state: FreeCellState = { ...createFreeCellGame(() => 0.5), freeCells: [null, null, null, null],
    foundations: [[], [], [], []], tableau: [
      [card('spades', 7), card('hearts', 6)], [card('hearts', 8)], [card('diamonds', 8)], [], [], [], [], [],
    ] };
  model = {
    hydrated: true, hydrationError: null, persistenceError: null, storageConflict: false, saveRevision: 0,
    retryPersistence: vi.fn().mockResolvedValue(undefined), reloadSavedGames: vi.fn().mockResolvedValue(undefined), retryHydration: vi.fn().mockResolvedValue(undefined),
    settings: { ...defaultSettings },
    saves: { ...defaultSavedGames, freecell: { gameId: 'freecell', updatedAt: '2026-10-18', state } },
    snapshots: { ...defaultSavedSnapshots }, saveGame,
    clearGame: vi.fn().mockResolvedValue(undefined), updateSettings: vi.fn().mockResolvedValue(undefined),
    saveSnapshot: vi.fn().mockResolvedValue(undefined), deleteSnapshot: vi.fn().mockResolvedValue(undefined),
  };
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([210, 900])('moves the exact selected run and uses final release at %s rather than previously highlighted column', (releaseX) => {
  render(<FreeCellGameScreen mode="resume" />);
  act(() => { vi.runAllTimers(); });
  act(() => { source().onCardDragStart?.(0, payload(10)); });
  act(() => { vi.runAllTimers(); });
  act(() => { source().onCardDragMove?.(0, payload(110)); });
  const before = saveGame.mock.calls.length;
  act(() => { source().onCardDragEnd?.(0, payload(releaseX)); vi.runAllTimers(); });
  if (releaseX === 210) {
    expect(present().tableau[1].map((card) => card.rank)).toEqual([8]);
    expect(present().tableau[2].map((card) => card.rank)).toEqual([8, 7, 6]);
  } else {
    expect(saveGame.mock.calls).toHaveLength(before);
    expect(present().tableau[0].map((card) => card.rank)).toEqual([7, 6]);
  }
});

it('rejects dragging a multi-card run to a free cell without adding history', () => {
  render(<FreeCellGameScreen mode="resume" />);
  act(() => { vi.runAllTimers(); });
  act(() => { source().onCardDragStart?.(0, payload(10)); });
  const before = saveGame.mock.calls.length;
  act(() => { source().onCardDragEnd?.(0, payload(-90)); vi.runAllTimers(); });
  expect(saveGame.mock.calls).toHaveLength(before);
  expect(present().freeCells).toEqual([null, null, null, null]);
});

it('clears a cancelled drag without changing the saved deal', () => {
  render(<FreeCellGameScreen mode="resume" />);
  act(() => { vi.runAllTimers(); });
  act(() => { source().onCardDragStart?.(0, payload(10)); });
  expect(source().hiddenFromIndex).toBe(0);
  const before = saveGame.mock.calls.length;
  act(() => { source().onCardDragCancel?.(); });
  expect(source().hiddenFromIndex).toBeUndefined();
  expect(source().selected).toBe(false);
  expect(saveGame.mock.calls).toHaveLength(before);
});

it('moves a single dragged tableau card into an empty free cell', () => {
  render(<FreeCellGameScreen mode="resume" />);
  act(() => { vi.runAllTimers(); });
  act(() => { source().onCardDragStart?.(1, payload(10)); });
  act(() => { source().onCardDragEnd?.(1, payload(-90)); vi.runAllTimers(); });
  expect(present().freeCells[0]?.rank).toBe(6);
  expect(present().tableau[0].map((card) => card.rank)).toEqual([7]);
});

it('drags a free-cell Ace to its foundation', () => {
  const saved = model.saves.freecell;
  if (!saved) throw new Error('Missing saved deal');
  const ace = createDeck('drag').find((card) => card.rank === 1 && card.suit === 'spades');
  if (!ace) throw new Error('Missing Ace');
  saved.state.freeCells[0] = ace;
  render(<FreeCellGameScreen mode="resume" />);
  act(() => { vi.runAllTimers(); });
  const cell = () => {
    const props = stacks.get(ace.id);
    if (!props) throw new Error('Missing draggable free cell');
    return props;
  };
  act(() => { cell().onCardDragStart?.(0, payload(10)); });
  act(() => { cell().onCardDragEnd?.(0, payload(310)); vi.runAllTimers(); });
  expect(present().freeCells[0]).toBeNull();
  expect(present().foundations[0].map((card) => card.id)).toEqual([ace.id]);
});
