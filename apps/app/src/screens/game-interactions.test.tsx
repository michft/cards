import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeck, type PlayingCard } from '@mumscards/engine-core';
import { createKlondikeGame, type KlondikeState } from '@mumscards/game-klondike';
import { createSpiderGame } from '@mumscards/game-spider';
import { createFreeCellGame, type FreeCellState } from '@mumscards/game-freecell';
import type { useAppModel } from '../state/app-provider';
import { defaultSavedGames, defaultSavedSnapshots, defaultSettings } from '../state/types';
import { KlondikeGameScreen } from './klondike-game-screen';
import { SpiderGameScreen } from './spider-game-screen';
import { FreeCellGameScreen } from './freecell-game-screen';
import GameRoute from '../../app/game/[gameId]';

type AppModel = ReturnType<typeof useAppModel>;
let model: AppModel;
let routeParams = { gameId: 'klondike', mode: 'resume' };
const saveGame = vi.fn<AppModel['saveGame']>();
const clearGame = vi.fn<AppModel['clearGame']>();

vi.mock('../state/app-provider', () => ({ useAppModel: () => model }));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useLocalSearchParams: () => routeParams,
  useFocusEffect: (callback: () => void | (() => void)) => useEffect(callback, [callback]),
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('./shared/card-stack', () => ({
  CardStack: ({ cards, placeholderLabel, onCardPress, onFaceUpCardPress }: {
    cards: Array<{ id: string }>;
    placeholderLabel: string;
    onCardPress?(): void;
    onFaceUpCardPress?(index: number): void;
  }) => (
    <div>
      {cards.length === 0 ? <span>{placeholderLabel}</span> : cards.map((card, index) => (
        <div role="button" tabIndex={0} key={card.id} aria-label={card.id} onClick={(event) => {
          event.stopPropagation();
          if (onFaceUpCardPress) onFaceUpCardPress(index);
          else onCardPress?.();
        }}>{card.id}</div>
      ))}
    </div>
  ),
}));

function card(suit: PlayingCard['suit'], rank: number): PlayingCard {
  const result = createDeck('test').find((item) => item.suit === suit && item.rank === rank);
  if (!result) throw new Error('Missing test card');
  return result;
}

function saveKlondike(state: KlondikeState) {
  model.saves.klondike = { gameId: 'klondike', updatedAt: '2026-10-11', state };
}

function presentKlondike(): KlondikeState {
  const call = saveGame.mock.calls.filter(([variant]) => variant === 'klondike').at(-1);
  if (!call || call[1].state.gameId !== 'klondike') throw new Error('No saved Klondike state');
  return call[1].state;
}

function emptyKlondike(): KlondikeState {
  return { ...createKlondikeGame(() => 0.5), stock: [], waste: [],
    foundations: [[], [], [], []], tableau: Array.from({ length: 7 }, () => []) };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  routeParams = { gameId: 'klondike', mode: 'resume' };
  saveGame.mockReset().mockResolvedValue(undefined);
  clearGame.mockReset().mockResolvedValue(undefined);
  model = {
    hydrated: true,
    settings: { ...defaultSettings },
    saves: { ...defaultSavedGames },
    snapshots: { ...defaultSavedSnapshots },
    saveGame, clearGame,
    updateSettings: vi.fn().mockResolvedValue(undefined),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
    deleteSnapshot: vi.fn().mockResolvedValue(undefined),
  };
});

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('game interactions', () => {
  it('waits for storage before mounting a resumable game', () => {
    model.hydrated = false;
    const view = render(<GameRoute />);
    expect(screen.getByLabelText('Loading game')).toBeTruthy();
    expect(saveGame).not.toHaveBeenCalled();
    const state = emptyKlondike();
    state.tableau[0] = [{ ...card('spades', 7), faceUp: true }];
    saveKlondike(state);
    model.hydrated = true;
    view.rerender(<GameRoute />);
    expect(presentKlondike()).toEqual(state);
  });

  it('starts a fresh deal when route switches from Resume to New', () => {
    saveKlondike(emptyKlondike());
    const view = render(<GameRoute />);
    expect(presentKlondike().stock).toHaveLength(0);
    routeParams = { gameId: 'klondike', mode: 'new' };
    view.rerender(<GameRoute />);
    expect(presentKlondike().stock).toHaveLength(24);
  });

  it('keeps an active Klondike deal when pending draw settings change', () => {
    const view = render(<KlondikeGameScreen gameId="klondike" mode="new" />);
    const before = presentKlondike();
    model.settings = { ...model.settings, drawCount: 1 };
    view.rerender(<KlondikeGameScreen gameId="klondike" mode="new" />);
    expect(presentKlondike()).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(presentKlondike().drawCount).toBe(1);
  });

  it.each(['new', 'resume'] as const)('keeps Spider %s deal when pending suit settings change', (mode) => {
    model.saves.spider = { gameId: 'spider', updatedAt: '2026-10-11', state: createSpiderGame(() => 0.5) };
    const view = render(<SpiderGameScreen mode={mode} />);
    const before = saveGame.mock.calls.filter(([variant]) => variant === 'spider').at(-1)?.[1].state;
    model.settings = { ...model.settings, spiderSuitMode: 'all-suits' };
    view.rerender(<SpiderGameScreen mode={mode} />);
    expect(saveGame.mock.calls.filter(([variant]) => variant === 'spider').at(-1)?.[1].state).toEqual(before);
  });

  it('moves only selected cards into an empty tableau column', () => {
    const state = emptyKlondike();
    state.tableau[0] = [card('clubs', 9), card('hearts', 8), card('spades', 7)].map((item) => ({ ...item, faceUp: true }));
    saveKlondike(state);
    render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
    fireEvent.click(screen.getByLabelText('test-spades-7'));
    const destination = screen.getAllByText('Any')[0].closest('[role="button"]');
    if (!destination) throw new Error('Missing empty destination');
    fireEvent.click(destination);
    expect(presentKlondike().tableau[0].map((item) => item.rank)).toEqual([9, 8]);
    expect(presentKlondike().tableau[1].map((item) => item.rank)).toEqual([7]);
  });

  it('leaves remaining cards alone after a manual foundation move', () => {
    const state = emptyKlondike();
    state.foundations = (['clubs', 'diamonds', 'hearts', 'spades'] as const).map((suit) =>
      createDeck('test').filter((item) => item.suit === suit && item.rank <= (suit === 'clubs' ? 11 : 13)));
    state.waste = [card('clubs', 12)];
    state.tableau[0] = [{ ...card('clubs', 13), faceUp: true }];
    saveKlondike(state);
    render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
    fireEvent.click(screen.getByLabelText('test-clubs-12'));
    fireEvent.click(screen.getByLabelText('test-clubs-11'));
    expect(presentKlondike().tableau[0].map((item) => item.rank)).toEqual([13]);
    expect(presentKlondike().completed).toBe(false);
    expect(clearGame).not.toHaveBeenCalled();
  });

  it('stops Offload when loading a snapshot', () => {
    vi.useFakeTimers();
    const state = emptyKlondike();
    state.tableau[0] = [{ ...card('clubs', 1), faceUp: true }];
    saveKlondike(state);
    model.settings.klondikeDebugTools = true;
    model.snapshots.klondike = [{ gameId: 'klondike', updatedAt: '2026-10-11', id: 'saved', label: 'Saved deal', state }];
    render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
    fireEvent.click(screen.getByRole('button', { name: 'Offload' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saved deal' }));
    act(() => { vi.advanceTimersByTime(300); });
    expect(presentKlondike().foundations.flat()).toHaveLength(0);
    expect(presentKlondike().tableau[0]).toHaveLength(1);
  });

  it('disables FreeCell Offload for unsafe but legal promotions', () => {
    const state: FreeCellState = { ...createFreeCellGame(() => 0.5),
      foundations: [[card('clubs', 1), card('clubs', 2)], [], [], []],
      freeCells: [card('clubs', 3), null, null, null],
      tableau: [[card('hearts', 2)], ...Array.from({ length: 7 }, () => [])] };
    model.saves.freecell = { gameId: 'freecell', updatedAt: '2026-10-11', state };
    render(<FreeCellGameScreen mode="resume" />);
    expect(screen.getByRole('button', { name: 'Offload' }).getAttribute('aria-disabled')).toBe('true');
  });
  it('keeps empty-column rules with the saved Klondike deal', () => {
    const state = emptyKlondike();
    state.emptyTableauPolicy = 'king-only';
    state.tableau[0] = [{ ...card('spades', 7), faceUp: true }];
    saveKlondike(state);
    const view = render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
    model.settings = { ...model.settings, emptyTableauPolicy: 'any' };
    view.rerender(<KlondikeGameScreen gameId="klondike" mode="resume" />);
    expect(screen.getAllByText('K')).toHaveLength(6);
    expect(presentKlondike().emptyTableauPolicy).toBe('king-only');
  });

  it('disables Klondike Offload for unsafe but legal promotions', () => {
    const state = emptyKlondike();
    state.foundations[0] = [card('clubs', 1), card('clubs', 2)];
    state.waste = [card('clubs', 3)];
    state.tableau[0] = [{ ...card('hearts', 2), faceUp: true }];
    saveKlondike(state);
    render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
    expect(screen.getByRole('button', { name: 'Offload' }).getAttribute('aria-disabled')).toBe('true');
  });

});
