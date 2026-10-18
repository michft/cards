import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useWindowDimensions, type View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../../theme';

// Always reserved so explanations never cover cards or move a repeated tap's target.
export const GAME_FEEDBACK_HEIGHT = 100;
export function gameFeedbackHeight(windowHeight: number) {
  return Math.min(GAME_FEEDBACK_HEIGHT, Math.max(60, Math.floor(windowHeight / 6)));
}

export function useGameBoardSpace() {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const feedbackHeight = gameFeedbackHeight(window.height);
  const ref = useRef<View | null>(null);
  const revision = useRef(0);
  const [measured, setMeasured] = useState<{ windowWidth: number; windowHeight: number; width: number; height: number } | null>(null);
  const measure = useCallback(() => {
    const request = ++revision.current;
    ref.current?.measureInWindow((_x, y, width) => {
      if (request !== revision.current || width <= 0) return;
      const next = { windowWidth: window.width, windowHeight: window.height,
        width: Math.floor(width),
        height: Math.max(1, Math.floor(window.height - insets.bottom - Math.max(y, insets.top)
          - spacing.md - feedbackHeight)),
      };
      setMeasured((current) => current?.windowWidth === next.windowWidth && current.windowHeight === next.windowHeight
        && current.width === next.width && current.height === next.height ? current : next);
    });
  }, [window.width, window.height, insets.top, insets.bottom, feedbackHeight]);
  // Re-measure after hint/toolbars wrap, safe areas change, or the device rotates.
  useLayoutEffect(() => { measure(); return () => { revision.current += 1; }; });
  const current = measured?.windowWidth === window.width && measured.windowHeight === window.height ? measured : null;
  const width = Math.max(1, Math.floor(window.width - insets.left - insets.right - spacing.lg * 2));
  const height = Math.max(1, Math.floor(window.height - insets.top - insets.bottom - 160 - feedbackHeight));
  function fitDrag(x: number, y: number, cardWidth: number) {
    const cardHeight = Math.round(cardWidth * 1.42);
    const bottom = window.height - insets.bottom;
    const left = Math.max(insets.left, Math.min(x, window.width - insets.right - cardWidth));
    const top = Math.max(insets.top, Math.min(y, bottom - cardHeight));
    return { left, top, maxHeight: Math.max(cardHeight, bottom - top) };
  }
  return { ref, onLayout: measure, width: current?.width ?? width, height: current?.height ?? height, fitDrag };
}
