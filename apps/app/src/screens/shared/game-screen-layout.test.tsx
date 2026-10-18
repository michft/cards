import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { GameScreenLayout } from './game-screen-layout';

const replace = vi.fn();
vi.mock('expo-router', () => ({ useRouter: () => ({ replace }) }));
beforeEach(() => replace.mockReset());
afterEach(cleanup);

it.each(['klondike', 'freecell', 'spider'] as const)('starts a fresh current %s game without reusing the route', (currentGame) => {
  const onNew = vi.fn();
  render(<GameScreenLayout currentGame={currentGame} onNew={onNew}><span>Board</span></GameScreenLayout>);
  const name = { klondike: 'Klondike', freecell: 'FreeCell', spider: 'Spider' }[currentGame];
  fireEvent.click(screen.getByRole('button', { name: `New ${name}` }));
  expect(onNew).toHaveBeenCalledOnce();
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: /Clock|Pyramid/ })).toBeNull();
});

it('replaces the screen with a new deal of a different type', () => {
  const onNew = vi.fn();
  render(<GameScreenLayout currentGame="klondike" onNew={onNew}><span>Board</span></GameScreenLayout>);
  fireEvent.click(screen.getByRole('button', { name: 'New Spider' }));
  expect(replace).toHaveBeenCalledWith('/game/spider?mode=new');
  expect(onNew).not.toHaveBeenCalled();
});
