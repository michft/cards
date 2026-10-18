import { act, cleanup, renderHook } from '@testing-library/react';
import type { View } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useGameBoardSpace } from './use-game-board-space';

const geometry = vi.hoisted(() => ({
  viewport: { width: 834, height: 1194 },
  insets: { top: 24, right: 8, bottom: 20, left: 8 },
}));
vi.mock('react-native', () => ({ useWindowDimensions: () => geometry.viewport }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => geometry.insets }));

type Measure = (x: number, y: number, width: number, height: number) => void;
function measuredNode(pending: Measure[]): View {
  return { measureInWindow: (measure: Measure) => { pending.push(measure); } } as View;
}

beforeEach(() => {
  geometry.viewport = { width: 834, height: 1194 };
  geometry.insets = { top: 24, right: 8, bottom: 20, left: 8 };
});
afterEach(cleanup);

it('keeps drag previews inside safe screen edges with space for every dragged card', () => {
  const { result } = renderHook(useGameBoardSpace);
  expect(result.current.fitDrag(-30, -20, 64)).toEqual({ left: 8, top: 24, maxHeight: 1150 });
  expect(result.current.fitDrag(820, 1180, 64)).toEqual({ left: 762, top: 1083, maxHeight: 91 });
  expect(result.current.fitDrag(200, 600, 64)).toEqual({ left: 200, top: 600, maxHeight: 574 });
});

it('reserves safe areas, page padding, and feedback before the board is measured', () => {
  const { result } = renderHook(useGameBoardSpace);
  expect(result.current.width).toBe(778);
  expect(result.current.height).toBe(890);
});

it('reserves the same smaller feedback area on short landscape screens', () => {
  geometry.viewport = { width: 844, height: 390 };
  const pending: Measure[] = [];
  const { result } = renderHook(useGameBoardSpace);
  result.current.ref.current = measuredNode(pending);
  act(() => { result.current.onLayout(); });
  act(() => { pending.shift()!(14, 180, 816, 100); });
  expect(result.current.height).toBe(111); // 390 - 20 safe bottom - 180 top - 14 gap - 65 feedback.
});

it('uses the measured board width and remaining height below its actual top', () => {
  const pending: Measure[] = [];
  const { result } = renderHook(useGameBoardSpace);
  result.current.ref.current = measuredNode(pending);
  act(() => { result.current.onLayout(); });
  act(() => { pending.shift()!(16, 180.5, 802.8, 700); });
  expect(result.current.width).toBe(802);
  expect(result.current.height).toBe(879);

  // A board temporarily measured above the safe area cannot use that space.
  act(() => { pending.pop()!(16, 0, 802.8, 700); });
  expect(result.current.height).toBe(1036);
});

it('remeasures after a toolbar wraps even without another board layout event', () => {
  const pending: Measure[] = [];
  const { result, rerender } = renderHook(useGameBoardSpace);
  result.current.ref.current = measuredNode(pending);
  rerender();
  act(() => { pending.shift()!(16, 180, 802, 700); });
  expect(result.current.height).toBe(880);

  pending.length = 0;
  rerender();
  expect(pending).toHaveLength(1);
  act(() => { pending.shift()!(16, 240, 802, 640); });
  expect(result.current.height).toBe(820);
});

it('discards portrait measurements and late callbacks when rotating to landscape', () => {
  const pending: Measure[] = [];
  const { result, rerender } = renderHook(useGameBoardSpace);
  result.current.ref.current = measuredNode(pending);
  act(() => { result.current.onLayout(); });
  act(() => { pending.shift()!(16, 180, 802, 700); });
  const stale = pending.pop()!;

  geometry.viewport = { width: 1194, height: 834 };
  rerender();
  expect(result.current.width).toBe(1138);
  expect(result.current.height).toBe(530);
  act(() => { stale(16, 180, 802, 700); });
  expect(result.current.width).toBe(1138);

  act(() => { pending.shift()!(16, 120, 1162, 600); });
  expect(result.current.width).toBe(1162);
  expect(result.current.height).toBe(580);
});

it('keeps usable geometry when an intermediate layout reports zero width', () => {
  const pending: Measure[] = [];
  const { result } = renderHook(useGameBoardSpace);
  result.current.ref.current = measuredNode(pending);
  act(() => { result.current.onLayout(); });
  act(() => { pending.shift()!(16, 180, 802, 700); });
  act(() => { pending.pop()!(0, 0, 0, 0); });
  expect(result.current.width).toBe(802);
  expect(result.current.height).toBe(880);
});
