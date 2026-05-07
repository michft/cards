import { useEffect } from 'react';
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
  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.tagName === 'INPUT') {
        return;
      }

      const key = event.key.toLowerCase();
      const commandPressed = event.metaKey || event.ctrlKey;

      if (!commandPressed || event.altKey) {
        return;
      }

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        onUndo?.();
        return;
      }

      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        onRedo?.();
        return;
      }

      if (key === 'n' && !event.shiftKey) {
        event.preventDefault();
        onNew?.();
        return;
      }

      if (key === 'r' && !event.shiftKey) {
        event.preventDefault();
        onRestart?.();
        return;
      }

      if (key === 'a' && !event.shiftKey) {
        event.preventDefault();
        onOffload?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNew, onOffload, onRedo, onRestart, onUndo]);
}
