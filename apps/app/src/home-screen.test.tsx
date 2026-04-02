import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { HomeScreen } from './screens/home-screen';

vi.mock('expo-router', () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  router: {
    push: vi.fn(),
  },
}));

vi.mock('../src/state/app-provider', () => ({
  useAppModel: () => ({
    hydrated: true,
    saves: {
      klondike: null,
    },
  }),
}));

describe('Home screen', () => {
  it('renders the main menu actions', () => {
    render(<HomeScreen />);

    expect(screen.getByText("Mum's Cards")).toBeTruthy();
    expect(screen.getByText('New Game')).toBeTruthy();
    expect(screen.getByText('Rules')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });
});
