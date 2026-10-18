import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDeck } from '@mumscards/engine-core';
import { createKlondikeGame, type KlondikeState } from '@mumscards/game-klondike';
import type { useAppModel } from '../state/app-provider';
import { defaultSavedGames, defaultSavedSnapshots, defaultSettings } from '../state/types';
import type { CardStack, DragPayload } from './shared/card-stack';
import { KlondikeGameScreen } from './klondike-game-screen';
import * as failedMoves from '../state/failed-moves';

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

function present(): KlondikeState {
  const state = saveGame.mock.calls.at(-1)?.[1].state;
  if (state?.gameId !== 'klondike') throw new Error('Missing saved deal');
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
  // Keep the hook's conservative static highlight; animation preferences have dedicated tests.
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => new Promise(() => {}));
  stacks.clear();
  saveGame.mockReset().mockResolvedValue(undefined);
  vi.spyOn(failedMoves, 'recordFailedMove').mockImplementation(() => {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const left = this.textContent === 'drag-hearts-8' ? 100 : this.textContent === 'drag-diamonds-8' ? 200 : (this.textContent === '' || this.textContent === 'A') ? 300 : 0;
    return { x: left, y: 0, left, top: 0, right: left + 50, bottom: 70, width: 50, height: 70, toJSON() {} };
  });
  const deck = createDeck('drag');
  const card = (suit: string, rank: number) => {
    const found = deck.find((item) => item.suit === suit && item.rank === rank);
    if (!found) throw new Error('Missing fixture card');
    return { ...found, faceUp: true };
  };
  const state: KlondikeState = { ...createKlondikeGame(() => 0.5), stock: [], waste: [],
    foundations: [[], [], [], []], tableau: [
      [card('spades', 7)], [card('hearts', 8)], [card('diamonds', 8)], [], [], [], [],
    ] };
  model = {
    hydrated: true, hydrationError: null, persistenceError: null, storageConflict: false, saveRevision: 0,
    retryPersistence: vi.fn().mockResolvedValue(undefined), reloadSavedGames: vi.fn().mockResolvedValue(undefined), retryHydration: vi.fn().mockResolvedValue(undefined),
    settings: { ...defaultSettings },
    saves: { ...defaultSavedGames, klondike: { gameId: 'klondike', updatedAt: '2026-10-18', state } },
    snapshots: { ...defaultSavedSnapshots }, saveGame,
    clearGame: vi.fn().mockResolvedValue(undefined), updateSettings: vi.fn().mockResolvedValue(undefined),
    saveSnapshot: vi.fn().mockResolvedValue(undefined), deleteSnapshot: vi.fn().mockResolvedValue(undefined),
  };
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([210, 900])('uses final release at %s rather than previously highlighted column', (releaseX) => {
  render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
  act(() => { vi.runAllTimers(); });
  act(() => { source().onCardDragStart?.(0, payload(10)); });
  act(() => { vi.runAllTimers(); });
  act(() => { source().onCardDragMove?.(0, payload(110)); });
  const before = saveGame.mock.calls.length;
  act(() => { source().onCardDragEnd?.(0, payload(releaseX)); });
  if (releaseX === 210) {
    expect(present().tableau[1].map((card) => card.rank)).toEqual([8]);
    expect(present().tableau[2].map((card) => card.rank)).toEqual([8, 7]);
    expect(failedMoves.recordFailedMove).not.toHaveBeenCalled();
  } else {
    expect(saveGame.mock.calls).toHaveLength(before);
    expect(present().tableau[0].map((card) => card.rank)).toEqual([7]);
    expect(failedMoves.recordFailedMove).toHaveBeenCalledWith(expect.objectContaining({ game: 'klondike', interaction: 'drag', rejection: expect.objectContaining({ code: 'drop-target' }) }));
  }
});

it('explains and records an invalid foundation drop once without changing the deal', () => {
  render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
  act(() => { vi.runAllTimers(); });
  act(() => { source().onCardDragStart?.(0, payload(10)); });
  const before = saveGame.mock.calls.length;
  act(() => { source().onCardDragEnd?.(0, payload(310)); });
  expect(screen.getByRole('status').textContent).toBe('An empty foundation must start with an Ace.');
  expect(saveGame.mock.calls).toHaveLength(before);
  expect(failedMoves.recordFailedMove).toHaveBeenCalledTimes(1);
  expect(failedMoves.recordFailedMove).toHaveBeenCalledWith(expect.objectContaining({
    game: 'klondike', interaction: 'drag',
    attempt: { kind: 'move', source: { zone: 'tableau', pileIndex: 0, cardIndex: 0 }, destination: { zone: 'foundation', pileIndex: 0 } },
    rejection: expect.objectContaining({ code: 'foundation-ace' }),
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss move explanation' }));
  expect(screen.queryByRole('status')).toBeNull();
  expect(failedMoves.recordFailedMove).toHaveBeenCalledTimes(1);
});

it('explains a face-down selection without revealing or selecting the card', () => {
  const state = model.saves.klondike?.state;
  if (!state) throw new Error('Missing saved Klondike');
  state.tableau[0][0].faceUp = false;
  render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
  const before = saveGame.mock.calls.length;
  act(() => { source().onFaceDownCardPress?.(0); });
  expect(screen.getByRole('status').textContent).toBe('Uncover face-down cards before moving them.');
  expect(failedMoves.recordFailedMove).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    game: 'klondike', interaction: 'press',
    attempt: { kind: 'select', source: { zone: 'tableau', pileIndex: 0, cardIndex: 0 } },
    rejection: expect.objectContaining({ code: 'source-hidden' }),
  }));
  const entry = vi.mocked(failedMoves.recordFailedMove).mock.calls[0][0];
  expect(JSON.stringify(entry.position)).not.toContain('"rank":7');
  expect(saveGame.mock.calls).toHaveLength(before);
  expect(present().tableau[0][0].faceUp).toBe(false);
  expect(source().selected).toBe(false);
});

it.each(['cancel', 'same-source'] as const)('does not record a %s gesture', (action) => {
  render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
  act(() => { vi.runAllTimers(); });
  act(() => { source().onCardDragStart?.(0, payload(10)); });
  act(() => {
    if (action === 'cancel') source().onCardDragCancel?.();
    else source().onCardDragEnd?.(0, payload(10));
  });
  expect(failedMoves.recordFailedMove).not.toHaveBeenCalled();
  expect(screen.queryByRole('status')).toBeNull();
});

it('explains an exhausted draw without adding history and clears the explanation on Undo', () => {
  render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
  const before = saveGame.mock.calls.length;
  fireEvent.keyDown(window, { key: 'd' });
  expect(screen.getByRole('status').textContent).toContain('no cards in the stock or waste');
  expect(saveGame.mock.calls).toHaveLength(before);
  expect(failedMoves.recordFailedMove).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(window, { key: 'u' });
  expect(screen.queryByRole('status')).toBeNull();
});

it('flashes a legal source and destination after repeated invalid foundation taps without changing history', () => {
  render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
  act(() => { source().onFaceUpCardPress?.(0); });
  const before = saveGame.mock.calls.length;
  fireEvent.click(screen.getAllByText('A')[0]);
  expect(screen.queryByTestId('move-hint-tableau-0')).toBeNull();
  fireEvent.click(screen.getAllByText('A')[0]);
  expect(screen.getByTestId('move-hint-tableau-0')).toBeTruthy();
  expect(screen.getByTestId('move-hint-tableau-1')).toBeTruthy();
  expect(screen.queryByTestId('move-hint-foundation-0')).toBeNull();
  expect(present().tableau[0].map((card) => card.rank)).toEqual([7]);
  expect(saveGame.mock.calls).toHaveLength(before);
  expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
  expect(failedMoves.recordFailedMove).toHaveBeenCalledTimes(2);
});

it('flashes a legal stock draw when a repeatedly tapped hidden card cannot move', () => {
  const state = model.saves.klondike?.state;
  if (!state) throw new Error('Missing saved Klondike');
  state.tableau = state.tableau.map(() => []);
  const cards = createDeck('drag');
  state.tableau[0] = [{ ...cards[6], faceUp: false }];
  state.stock = [cards[8]];
  render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
  const before = saveGame.mock.calls.length;
  const hidden = () => stacks.get(cards[6].id);
  act(() => { hidden()?.onFaceDownCardPress?.(0); });
  act(() => { hidden()?.onFaceDownCardPress?.(0); });
  expect(screen.getByTestId('move-hint-stock')).toBeTruthy();
  expect(screen.queryByTestId('move-hint-tableau-0')).toBeNull();
  expect(saveGame.mock.calls).toHaveLength(before);
  expect(failedMoves.recordFailedMove).toHaveBeenCalledTimes(2);
});
