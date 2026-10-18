import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RulesScreen } from './rules-screen';

let game: string | undefined;
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({ game }) }));
afterEach(cleanup);

describe('RulesScreen', () => {
  it.each(['toString', 'constructor', '__proto__', 'missing', undefined])(
    'uses Klondike rules for unsupported game %s', (requestedGame) => {
      game = requestedGame;
      render(<RulesScreen />);
      expect(screen.getByText('Klondike')).toBeTruthy();
    },
  );

  it('explains that Kings return to the stock pile that started the chain', () => {
    game = 'clock';
    render(<RulesScreen />);
    expect(screen.getByText(/Kings return to the stock pile that started their chain/)).toBeTruthy();
  });

  it('includes auxiliary empty columns in FreeCell move capacity', () => {
    game = 'freecell';
    render(<RulesScreen />);
    expect(screen.getByText(/free cells and empty tableau columns, excluding the destination/)).toBeTruthy();
  });
});
