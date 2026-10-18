import { createFreeCellGame } from '@mumscards/game-freecell';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useEffect, type EffectCallback } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { recordFailedMove } from '../../state/failed-moves';
import { useMoveFeedback, type FailedMoveAttempt } from './use-move-feedback';

const navigation = vi.hoisted(() => ({ focused: true }));
vi.mock('expo-router', () => ({ useFocusEffect: (effect: EffectCallback) => {
  useEffect(() => navigation.focused ? effect() : undefined, [effect, navigation.focused]);
} }));
vi.mock('../../state/failed-moves', async (original) => ({
  ...await original<typeof import('../../state/failed-moves')>(), recordFailedMove: vi.fn(),
}));

const position = createFreeCellGame(() => 0.5);
const attempt: FailedMoveAttempt = { kind: 'move', source: { zone: 'tableau', pileIndex: 0, cardIndex: 6 },
  destination: { zone: 'foundation', pileIndex: 0 } };
const suggestion = { label: 'Move this card to an empty free cell.', targets: ['tableau-0', 'cell-0'] };

beforeEach(() => {
  navigation.focused = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T00:00:00Z'));
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  vi.mocked(recordFailedMove).mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('suggests after the second matching press, expires, and logs both rejected attempts', () => {
  const suggest = vi.fn(() => suggestion);
  const initial = structuredClone(position);
  const { result } = renderHook(() => useMoveFeedback('freecell', position, suggest));
  act(() => result.current.reject('foundation-ace', 'Start with an Ace.', attempt));
  expect(result.current.hint).toBeNull();
  act(() => { vi.advanceTimersByTime(1000); result.current.reject('foundation-ace', 'Start with an Ace.', attempt); });
  expect(result.current.hint).toEqual(suggestion);
  expect(result.current.helpMessage).toContain(suggestion.label);
  expect(suggest).toHaveBeenCalledExactlyOnceWith(attempt);
  expect(recordFailedMove).toHaveBeenCalledTimes(2);
  expect(position).toEqual(initial);
  act(() => { vi.advanceTimersByTime(2200); });
  expect(result.current.hint).toBeNull();
  expect(result.current.helpMessage).toBeNull();
  expect(result.current.message).toBe('Start with an Ace.');
});

it('does not combine different destinations, slow presses, or rejected drags', () => {
  const suggest = vi.fn(() => suggestion);
  const { result } = renderHook(() => useMoveFeedback('freecell', position, suggest));
  act(() => {
    result.current.reject('wrong', 'Wrong.', attempt);
    result.current.reject('wrong', 'Wrong.', { ...attempt, destination: { zone: 'foundation', pileIndex: 1 } });
    vi.advanceTimersByTime(1501);
    result.current.reject('wrong', 'Wrong.', attempt);
    result.current.reject('wrong', 'Wrong.', attempt, 'drag');
    result.current.reject('wrong', 'Wrong.', attempt, 'drag');
    result.current.reject('wrong', 'Wrong.', attempt);
  });
  expect(result.current.hint).toBeNull();
  expect(suggest).not.toHaveBeenCalled();
});

it('can assist a repeated wrong spot while normal deselection stays out of the failure log', () => {
  const { result } = renderHook(() => useMoveFeedback('freecell', position, () => suggestion));
  act(() => { result.current.reject('wrong', 'Wrong.', attempt); });
  act(() => { expect(result.current.repeatPress({ zone: 'foundation', pileIndex: 1 })).toBe(false); });
  act(() => { expect(result.current.repeatPress({ zone: 'foundation', pileIndex: 0 })).toBe(true); });
  expect(result.current.hint).toEqual(suggestion);
  expect(recordFailedMove).toHaveBeenCalledOnce();
});

it('resets on dismissal, position change, route blur, and unmount', () => {
  const { result, rerender, unmount } = renderHook(({ current }) => useMoveFeedback('freecell', current, () => suggestion),
    { initialProps: { current: position } });
  const reject = () => result.current.reject('wrong', 'Wrong.', attempt);
  act(() => { reject(); reject(); });
  expect(result.current.hint).toEqual(suggestion);
  act(() => { result.current.clear(); reject(); });
  expect(result.current.hint).toBeNull();
  act(reject);
  rerender({ current: structuredClone(position) });
  expect(result.current.hint).toBeNull();
  expect(result.current.message).toBeNull();
  act(() => { reject(); reject(); });
  navigation.focused = false;
  rerender({ current: position });
  expect(result.current.hint).toBeNull();
  navigation.focused = true;
  rerender({ current: position });
  act(() => { reject(); reject(); });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('explains when no suggestion exists without inventing a highlighted move', () => {
  const { result } = renderHook(() => useMoveFeedback('freecell', position, () => null));
  act(() => { result.current.reject('wrong', 'Wrong.', attempt); result.current.reject('wrong', 'Wrong.', attempt); });
  expect(result.current.hint).toBeNull();
  expect(result.current.helpMessage).toContain('No move suggestion is available');
});

it('uses two slow pulses normally and a steady highlight with Reduce Motion', async () => {
  vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  const timing = vi.spyOn(Animated, 'timing');
  const { result, unmount } = renderHook(() => useMoveFeedback('freecell', position, () => suggestion));
  await act(async () => {});
  act(() => { result.current.reject('wrong', 'Wrong.', attempt); result.current.reject('wrong', 'Wrong.', attempt); });
  expect(timing).toHaveBeenCalledTimes(4);
  expect(timing.mock.calls.map(([, config]) => config.toValue)).toEqual([0.3, 1, 0.3, 1]);
  unmount();
  timing.mockClear();
  vi.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  const reduced = renderHook(() => useMoveFeedback('freecell', position, () => suggestion));
  act(() => { reduced.result.current.reject('wrong', 'Wrong.', attempt); reduced.result.current.reject('wrong', 'Wrong.', attempt); });
  expect(reduced.result.current.hint).toEqual(suggestion);
  expect(timing).not.toHaveBeenCalled();
});
