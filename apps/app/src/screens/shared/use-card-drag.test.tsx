import { createDeck } from '@mumscards/engine-core';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { View } from 'react-native';
import { afterEach, expect, it, vi } from 'vitest';

import type { DragPayload } from './card-stack';
import { useCardDrag } from './use-card-drag';

afterEach(cleanup);

const cards = createDeck('drag').slice(0, 1);
function payload(x: number): DragPayload {
  return { pageX: x, pageY: 20, layout: { x: 0, y: 0, width: 50, height: 70 } };
}
function node(x: number): View {
  return { measureInWindow: (measure: (x: number, y: number, width: number, height: number) => void) =>
    measure(x, 0, 50, 70) } as View;
}

it('highlights only legal targets but reports an illegal final destination once', () => {
  const onDrop = vi.fn();
  const onReject = vi.fn();
  const { result } = renderHook(() => useCardDrag({
    getCards: (_source: string) => cards, getDestinations: () => [1], onDrop, onReject,
  }));
  result.current.registerTarget('legal', 1)(node(100));
  result.current.registerTarget('illegal', 2)(node(200));
  act(() => { result.current.start('source', payload(10)); });
  act(() => { result.current.move(payload(210)); });
  expect(result.current.drag?.activeDestination).toBeNull();
  act(() => { result.current.end(payload(210)); });
  act(() => { result.current.end(payload(210)); });
  expect(onDrop).not.toHaveBeenCalled();
  expect(onReject).toHaveBeenCalledExactlyOnceWith('source', 2);
  expect(result.current.drag).toBeNull();
});

it('still uses the final legal target after hovering an illegal target', () => {
  const onDrop = vi.fn();
  const onReject = vi.fn();
  const { result } = renderHook(() => useCardDrag({
    getCards: (_source: string) => cards, getDestinations: () => [1], onDrop, onReject,
  }));
  result.current.registerTarget('legal', 1)(node(100));
  result.current.registerTarget('illegal', 2)(node(200));
  act(() => { result.current.start('source', payload(10)); });
  act(() => { result.current.move(payload(210)); });
  act(() => { result.current.end(payload(110)); });
  expect(onDrop).toHaveBeenCalledExactlyOnceWith('source', 1);
  expect(onReject).not.toHaveBeenCalled();
});

it('captures a blocked drag so dropping outside can be explained, while explicit cancel stays silent', () => {
  const onDrop = vi.fn();
  const onReject = vi.fn();
  const { result } = renderHook(() => useCardDrag({
    getCards: (_source: string) => cards, getDestinations: () => [] as number[], onDrop, onReject,
  }));
  act(() => { result.current.start('source', payload(10)); });
  expect(result.current.drag).not.toBeNull();
  act(() => { result.current.cancel(); });
  expect(onReject).not.toHaveBeenCalled();
  act(() => { result.current.start('source', payload(10)); });
  act(() => { result.current.end(payload(900)); });
  expect(onReject).toHaveBeenCalledExactlyOnceWith('source', null);
  expect(onDrop).not.toHaveBeenCalled();
});

it('keeps legacy blocked-drag behavior when no rejection handler exists', () => {
  const { result } = renderHook(() => useCardDrag({
    getCards: (_source: string) => cards, getDestinations: () => [] as number[], onDrop: vi.fn(),
  }));
  act(() => { result.current.start('source', payload(10)); });
  expect(result.current.drag).toBeNull();
});

it('reports an invalid source once without capturing a gesture or double-reporting on release', () => {
  const onReject = vi.fn();
  const { result } = renderHook(() => useCardDrag({
    getCards: (_source: string) => [], getDestinations: () => [1], onDrop: vi.fn(), onReject,
  }));
  act(() => { result.current.start('invalid', payload(10)); });
  act(() => { result.current.end(payload(110)); });
  expect(result.current.drag).toBeNull();
  expect(onReject).toHaveBeenCalledExactlyOnceWith('invalid', null);
});

it('does not report a cancelled drag when release measurements finish later', () => {
  const measurements: Array<() => void> = [];
  const onDrop = vi.fn();
  const onReject = vi.fn();
  const { result } = renderHook(() => useCardDrag({
    getCards: (_source: string) => cards, getDestinations: () => [1], onDrop, onReject,
  }));
  result.current.registerTarget('destination', 1)({
    measureInWindow: (measure: (x: number, y: number, width: number, height: number) => void) => {
      measurements.push(() => measure(100, 0, 50, 70));
    },
  } as View);
  act(() => { result.current.start('source', payload(10)); });
  act(() => { measurements.splice(0).forEach((measure) => measure()); });
  act(() => { result.current.end(payload(110)); });
  act(() => { result.current.cancel(); });
  act(() => { measurements.splice(0).forEach((measure) => measure()); });
  expect(onDrop).not.toHaveBeenCalled();
  expect(onReject).not.toHaveBeenCalled();
});
