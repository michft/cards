import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Platform } from 'react-native';

type ShortcutHandlers = {
  onUndo?(): void;
  onRedo?(): void;
  onNew?(): void;
  onRestart?(): void;
  onOffload?(): void;
};

export function useWebGameShortcuts({
  onUndo,
  onRedo,
  onNew,
  onRestart,
  onOffload,
}: ShortcutHandlers) {
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const commandPressed = event.metaKey || event.ctrlKey;

      if (!commandPressed || event.altKey) {
        return;
      }

      if (key === 'z' && !event.shiftKey && onUndo) {
        event.preventDefault();
        onUndo();
        return;
      }

      if (key === 'z' && event.shiftKey && onRedo) {
        event.preventDefault();
        onRedo();
        return;
      }

      if (key === 'n' && !event.shiftKey && onNew) {
        event.preventDefault();
        onNew();
        return;
      }

      if (key === 'r' && !event.shiftKey && onRestart) {
        event.preventDefault();
        onRestart();
        return;
      }

      if (key === 'a' && !event.shiftKey && onOffload) {
        event.preventDefault();
        onOffload();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNew, onOffload, onRedo, onRestart, onUndo]));
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'),
  );
}
