import { fireEvent, renderHook } from '@testing-library/react';
import { useEffect, type EffectCallback } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWebGameShortcuts } from './use-web-game-shortcuts';

const navigation = vi.hoisted(() => ({ focused: true }));

vi.mock('expo-router', () => ({
  useFocusEffect: (effect: EffectCallback) => {
    useEffect(() => navigation.focused ? effect() : undefined, [effect, navigation.focused]);
  },
}));

describe('useWebGameShortcuts', () => {
  beforeEach(() => {
    navigation.focused = true;
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('handles commands only while its game route is focused', () => {
    const onNew = vi.fn();
    const { rerender } = renderHook(() => useWebGameShortcuts({ onNew }));

    fireEvent.keyDown(window, { key: 'n', code: 'KeyN', ctrlKey: true, altKey: true });
    expect(onNew).toHaveBeenCalledOnce();

    navigation.focused = false;
    rerender();
    expect(fireEvent.keyDown(window, { key: 'n', code: 'KeyN', ctrlKey: true, altKey: true })).toBe(true);
    expect(onNew).toHaveBeenCalledOnce();

    navigation.focused = true;
    rerender();
    fireEvent.keyDown(window, { key: 'Dead', code: 'KeyN', metaKey: true, altKey: true });
    expect(onNew).toHaveBeenCalledTimes(2);
  });

  it('leaves browser New Window commands alone and uses Command/Control+Alt+N for New', () => {
    const onNew = vi.fn();
    renderHook(() => useWebGameShortcuts({ onNew }));

    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }]) {
      expect(fireEvent.keyDown(window, { key: 'n', code: 'KeyN', ...modifiers })).toBe(true);
      expect(fireEvent.keyDown(window, { key: 'N', code: 'KeyN', shiftKey: true, ...modifiers })).toBe(true);
      expect(fireEvent.keyDown(window, { key: 'n', code: 'KeyN', altKey: true, ...modifiers })).toBe(false);
    }
    expect(onNew).toHaveBeenCalledTimes(2);
  });

  it.each(['input', 'textarea', 'select', 'editable', 'editable-child'])('leaves %s input shortcuts alone', (kind) => {
    const onOffload = vi.fn();
    renderHook(() => useWebGameShortcuts({ onOffload }));
    const editable = kind.startsWith('editable');
    const target = document.createElement(editable ? 'div' : kind);

    if (editable) {
      target.setAttribute('contenteditable', 'true');
    }

    const child = document.createElement('span');
    target.append(child);
    document.body.append(target);

    expect(fireEvent.keyDown(kind === 'editable-child' ? child : target, { key: 'a', ctrlKey: true })).toBe(true);
    expect(onOffload).not.toHaveBeenCalled();
  });

  it('preserves browser commands when no game handler exists', () => {
    renderHook(() => useWebGameShortcuts({}));

    for (const key of ['z', 'n', 'r', 'a']) {
      expect(fireEvent.keyDown(window, { key, ctrlKey: true })).toBe(true);
    }

    expect(fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })).toBe(true);
  });

  it('keeps undo and redo distinct and rejects unrelated modifier combinations', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    renderHook(() => useWebGameShortcuts({ onUndo, onRedo }));

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'z' });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, altKey: true });

    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
  });
});
