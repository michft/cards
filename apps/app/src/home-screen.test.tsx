import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createClockGame } from '@mumscards/game-clock';
import { createFreeCellGame } from '@mumscards/game-freecell';
import { createKlondikeGame } from '@mumscards/game-klondike';
import { createPyramidGame } from '@mumscards/game-pyramid';
import { router } from 'expo-router';
import { vi } from 'vitest';

import { HomeScreen } from './screens/home-screen';
import { defaultSavedGames, type SavedGames } from './state/types';

const model: { hydrated: boolean; saves: SavedGames } = { hydrated: true, saves: { ...defaultSavedGames } };

vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('./state/app-provider', () => ({ useAppModel: () => model }));

beforeEach(() => {
  model.hydrated = true;
  model.saves = { ...defaultSavedGames };
  vi.mocked(router.push).mockClear();
});
afterEach(cleanup);

describe('Home screen', () => {
  it('shows only the three available games', () => {
    render(<HomeScreen />);

    expect(screen.getByText("Mum's Cards")).toBeTruthy();
    expect(screen.getByText('Three familiar games. Pick a table and settle in.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New Klondike' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New FreeCell' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New Spider' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New Clock' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New Pyramid' })).toBeNull();
  });

  it.each([
    ['Klondike', 'klondike'], ['FreeCell', 'freecell'], ['Spider', 'spider'],
  ])('starts a new %s game', (name, id) => {
    render(<HomeScreen />);

    fireEvent.click(screen.getByRole('button', { name: `New ${name}` }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(`/game/${id}?mode=new`);
  });

  it('continues the newest visible save when hidden saves are newer', () => {
    model.saves = {
      ...defaultSavedGames,
      klondike: { gameId: 'klondike', updatedAt: '2026-10-16', state: createKlondikeGame(() => 0.5) },
      freecell: { gameId: 'freecell', updatedAt: '2026-10-17', state: createFreeCellGame(() => 0.5) },
      clock: { gameId: 'clock', updatedAt: '2026-10-18', state: createClockGame(() => 0.5) },
      pyramid: { gameId: 'pyramid', updatedAt: '2026-10-19', state: createPyramidGame(() => 0.5) },
    };
    const savedGames = structuredClone(model.saves);
    render(<HomeScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue Last Game' }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/game/freecell?mode=resume');
    expect(model.saves).toEqual(savedGames);
  });

  it.each([false, true])('disables Continue with no visible save (hidden saves: %s)', (hiddenSaves) => {
    if (hiddenSaves) {
      model.saves.clock = { gameId: 'clock', updatedAt: '2026-10-18', state: createClockGame(() => 0.5) };
      model.saves.pyramid = { gameId: 'pyramid', updatedAt: '2026-10-19', state: createPyramidGame(() => 0.5) };
    }
    render(<HomeScreen />);

    const button = screen.getByRole('button', { name: 'Continue unavailable' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Continue Last Game' })).toBeNull();
  });

  it('waits for hydration before offering Continue', () => {
    model.hydrated = false;
    model.saves.freecell = { gameId: 'freecell', updatedAt: '2026-10-17', state: createFreeCellGame(() => 0.5) };
    render(<HomeScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue unavailable' }));

    expect(router.push).not.toHaveBeenCalled();
  });
});
