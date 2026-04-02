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
      clock: null,
      klondike: null,
      freecell: null,
      pyramid: null,
      spider: null,
    },
  }),
}));

describe('Home screen', () => {
  it('renders the main menu actions', () => {
    render(<HomeScreen />);

    expect(screen.getByText("Mum's Cards")).toBeTruthy();
    expect(screen.getByText('Continue unavailable')).toBeTruthy();
    expect(screen.getByText('New Klondike')).toBeTruthy();
    expect(screen.getByText('New Clock')).toBeTruthy();
    expect(screen.getByText('New FreeCell')).toBeTruthy();
    expect(screen.getByText('New Pyramid')).toBeTruthy();
    expect(screen.getByText('New Spider')).toBeTruthy();
  });
});
