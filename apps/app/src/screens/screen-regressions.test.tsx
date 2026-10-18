import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeck, type PlayingCard } from '@mumscards/engine-core';
import { createKlondikeGame, type KlondikeState } from '@mumscards/game-klondike';
import { createFreeCellGame, type FreeCellState } from '@mumscards/game-freecell';
import { createSpiderGame, type SpiderState } from '@mumscards/game-spider';
import { createClockGame } from '@mumscards/game-clock';
import { createPyramidGame } from '@mumscards/game-pyramid';
import type { useAppModel } from '../state/app-provider';
import { defaultSavedGames, defaultSavedSnapshots, defaultSettings } from '../state/types';
import { KlondikeGameScreen } from './klondike-game-screen';
import { FreeCellGameScreen } from './freecell-game-screen';
import { SpiderGameScreen } from './spider-game-screen';
import { ClockGameScreen } from './clock-game-screen';
import { PyramidGameScreen } from './pyramid-game-screen';

type AppModel = ReturnType<typeof useAppModel>;
let model: AppModel;
const saveGame = vi.fn<AppModel['saveGame']>();
const replace = vi.fn();
const push = vi.fn();
vi.mock('../state/app-provider', () => ({ useAppModel: () => model }));
vi.mock('../state/failed-moves', async (importOriginal) => ({
  ...await importOriginal<typeof import('../state/failed-moves')>(),
  recordFailedMove: vi.fn(),
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace, push }),
  useFocusEffect: (callback: () => void | (() => void)) => useEffect(callback, [callback]),
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('./shared/card-stack', () => ({
  CardStack: ({ cards, placeholderLabel, selected, onCardPress, onFaceUpCardPress }: {
    cards: Array<{ id: string }>;
    placeholderLabel: string;
    selected?: boolean;
    onCardPress?(): void;
    onFaceUpCardPress?(index: number): void;
  }) => <div data-stack="true" data-selected={selected ? 'true' : 'false'}>
    {cards.length === 0 ? <div role="button" tabIndex={0} aria-label={`Empty ${placeholderLabel}`} onClick={() => onCardPress?.()}>{placeholderLabel}</div> :
      cards.map((card, index) => <div role="button" tabIndex={0} aria-label={card.id} key={card.id} onClick={(event) => {
        event.stopPropagation();
        if (onFaceUpCardPress) onFaceUpCardPress(index);
        else onCardPress?.();
      }}>{card.id}</div>)}
  </div>,
}));

function card(suit: PlayingCard['suit'], rank: number): PlayingCard {
  const value = createDeck('test').find((item) => item.suit === suit && item.rank === rank);
  if (!value) throw new Error('Missing card');
  return value;
}
function selected(id: string) {
  return screen.getByLabelText(id).closest('[data-stack]')?.getAttribute('data-selected') === 'true';
}
function emptyKlondike(): KlondikeState {
  return { ...createKlondikeGame(() => 0.5), stock: [], waste: [], foundations: [[], [], [], []], tableau: Array.from({ length: 7 }, () => []) };
}
function freecell(): FreeCellState {
  return { ...createFreeCellGame(() => 0.5), foundations: [[], [], [], []], freeCells: [null, null, null, null],
    tableau: [[card('spades', 7)], [card('clubs', 9)], [card('hearts', 10)], ...Array.from({ length: 5 }, () => [])] };
}
function savedKlondike() {
  const state = saveGame.mock.calls.filter(([id]) => id === 'klondike').at(-1)?.[1].state;
  if (!state || state.gameId !== 'klondike') throw new Error('Missing Klondike save');
  return state;
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  saveGame.mockReset().mockResolvedValue(undefined);
  replace.mockReset(); push.mockReset();
  model = { hydrated: true, hydrationError: null, persistenceError: null, storageConflict: false, saveRevision: 0,
    retryPersistence: vi.fn().mockResolvedValue(undefined), reloadSavedGames: vi.fn().mockResolvedValue(undefined), settings: { ...defaultSettings }, saves: { ...defaultSavedGames }, snapshots: { ...defaultSavedSnapshots },
    retryHydration: vi.fn().mockResolvedValue(undefined), saveGame, clearGame: vi.fn().mockResolvedValue(undefined), updateSettings: vi.fn().mockResolvedValue(undefined),
    saveSnapshot: vi.fn().mockResolvedValue(undefined), deleteSnapshot: vi.fn().mockResolvedValue(undefined) };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('save-preserving navigation and game interactions', () => {
  it.each(['klondike', 'freecell', 'spider', 'clock', 'pyramid'] as const)('resumes menu destinations and replaces home from %s', (id) => {
    model.saves.clock = { gameId: 'clock', updatedAt: '2026-10-17', state: createClockGame(() => 0.5) };
    model.saves.pyramid = { gameId: 'pyramid', updatedAt: '2026-10-17', state: createPyramidGame(() => 0.5) };
    const views = { klondike: <KlondikeGameScreen gameId="klondike" mode="resume" />, freecell: <FreeCellGameScreen mode="resume" />,
      spider: <SpiderGameScreen mode="resume" />, clock: <ClockGameScreen mode="resume" />, pyramid: <PyramidGameScreen mode="resume" /> };
    render(views[id]);
    fireEvent.click(screen.getByRole('button', { name: 'Games ▾' }));
    const destination = id === 'freecell' ? 'Klondike' : 'FreeCell';
    fireEvent.click(screen.getByRole('button', { name: destination }));
    expect(replace).toHaveBeenLastCalledWith(`/game/${destination.toLowerCase()}?mode=resume`);
    fireEvent.click(screen.getByRole('button', { name: 'Games ▾' }));
    fireEvent.click(screen.getByRole('button', { name: '< home' }));
    expect(replace).toHaveBeenLastCalledWith('/');
    expect(push).not.toHaveBeenCalled();
  });

  it('does not redeal Klondike on plain n', () => {
    const state = emptyKlondike();
    model.saves.klondike = { gameId: 'klondike', updatedAt: '2026-10-17', state };
    render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
    const calls = saveGame.mock.calls.length;
    fireEvent.keyDown(window, { key: 'n' });
    expect(saveGame.mock.calls).toHaveLength(calls);
    expect(savedKlondike()).toEqual(state);
  });

  it('switches FreeCell selection after an invalid destination and moves the new source', () => {
    model.saves.freecell = { gameId: 'freecell', updatedAt: '2026-10-17', state: freecell() };
    render(<FreeCellGameScreen mode="resume" />);
    fireEvent.click(screen.getByLabelText('test-spades-7'));
    fireEvent.click(screen.getByLabelText('test-clubs-9'));
    expect(selected('test-spades-7')).toBe(false);
    expect(selected('test-clubs-9')).toBe(true);
    fireEvent.click(screen.getByLabelText('test-hearts-10'));
    const state = saveGame.mock.calls.at(-1)?.[1].state;
    if (!state || state.gameId !== 'freecell') throw new Error('Missing FreeCell save');
    expect(state.tableau[1]).toEqual([]);
    expect(state.tableau[2].map((item) => item.rank)).toEqual([10, 9]);
  });

  it('rejects an immovable FreeCell source', () => {
    const state = freecell();
    state.tableau[0].push(card('spades', 6));
    model.saves.freecell = { gameId: 'freecell', updatedAt: '2026-10-17', state };
    render(<FreeCellGameScreen mode="resume" />);
    fireEvent.click(screen.getByLabelText('test-spades-7'));
    expect(selected('test-spades-7')).toBe(false);
    fireEvent.click(screen.getByLabelText('test-clubs-9'));
    expect(selected('test-clubs-9')).toBe(true);
  });

  it('switches Spider selection after an invalid destination', () => {
    const state: SpiderState = { ...createSpiderGame(() => 0.5), stock: [], foundations: [], completedRuns: 0,
      tableau: [[card('spades', 7)], [card('clubs', 9)], [card('hearts', 10)], ...Array.from({ length: 7 }, () => [])].map((pile) => pile.map((item) => ({ ...item, faceUp: true }))) };
    model.saves.spider = { gameId: 'spider', updatedAt: '2026-10-17', state };
    render(<SpiderGameScreen mode="resume" />);
    fireEvent.click(screen.getByLabelText('test-spades-7'));
    fireEvent.click(screen.getByLabelText('test-clubs-9'));
    expect(selected('test-spades-7')).toBe(false);
    expect(selected('test-clubs-9')).toBe(true);
    fireEvent.click(screen.getByLabelText('test-hearts-10'));
    const saved = saveGame.mock.calls.at(-1)?.[1].state;
    if (!saved || saved.gameId !== 'spider') throw new Error('Missing Spider save');
    expect(saved.tableau[2].map((item) => item.rank)).toEqual([10, 9]);
  });

  it('prioritizes FreeCell foundations and omits whole-column empty-column hints', () => {
    const state = freecell();
    state.tableau[0] = [card('clubs', 1)];
    model.saves.freecell = { gameId: 'freecell', updatedAt: '2026-10-17', state };
    render(<FreeCellGameScreen mode="resume" />);
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.getByText('Tableau 1 → Foundation 1')).toBeTruthy();
    const labels = new Set<string>();
    for (let index = 0; index < 40; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
      screen.queryAllByText(/ → /).forEach((element) => labels.add(element.textContent ?? ''));
    }
    expect([...labels].some((label) => /→ Tableau [4-8]$/.test(label))).toBe(false);
  });

  it.each(['freecell', 'klondike'] as const)('clears %s selection at Offload start and automated moves', (id) => {
    vi.useFakeTimers();
    if (id === 'freecell') {
      const state = freecell(); state.tableau[0] = [card('clubs', 1)]; state.tableau[1] = [card('diamonds', 1)];
      model.saves.freecell = { gameId: 'freecell', updatedAt: '2026-10-17', state };
      render(<FreeCellGameScreen mode="resume" />);
    } else {
      const state = emptyKlondike();
      state.tableau[0] = [{ ...card('clubs', 1), faceUp: true }];
      state.tableau[1] = [{ ...card('diamonds', 1), faceUp: true }];
      model.saves.klondike = { gameId: 'klondike', updatedAt: '2026-10-17', state };
      render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
    }
    fireEvent.click(screen.getByLabelText('test-clubs-1'));
    expect(selected('test-clubs-1')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Offload' }));
    expect(selected('test-clubs-1')).toBe(false);
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByLabelText('test-diamonds-1'));
    expect(selected('test-diamonds-1')).toBe(true);
    act(() => { vi.advanceTimersByTime(100); });
    expect(document.querySelector('[data-selected="true"]')).toBeNull();
  });

  it('preserves redo and undo when Klondike draw has no stock or waste', () => {
    const state = emptyKlondike();
    state.tableau[0] = [{ ...card('spades', 7), faceUp: true }];
    state.tableau[1] = [{ ...card('hearts', 8), faceUp: true }];
    model.saves.klondike = { gameId: 'klondike', updatedAt: '2026-10-17', state };
    render(<KlondikeGameScreen gameId="klondike" mode="resume" />);
    fireEvent.click(screen.getByLabelText('test-spades-7'));
    fireEvent.click(screen.getByLabelText('test-hearts-8'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Redo' }).getAttribute('aria-disabled')).not.toBe('true');
    const calls = saveGame.mock.calls.length;
    fireEvent.keyDown(window, { key: 'd' });
    expect(saveGame.mock.calls).toHaveLength(calls);
    expect(screen.getByRole('button', { name: 'Redo' }).getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(savedKlondike().tableau[1].map((item) => item.rank)).toEqual([8, 7]);
  });
});
