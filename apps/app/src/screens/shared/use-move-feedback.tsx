import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { recordFailedMove, trainingPosition, visibleJson, useFailedMoveLog, type FailedMoveAttempt } from '../../state/failed-moves';
import type { GameStateMap, GameVariant } from '../../state/types';
import { palette, radius, spacing } from '../../theme';

export type { FailedMoveAttempt } from '../../state/failed-moves';
export type MoveSuggestion = { label: string; targets: string[] };

export function useMoveFeedback<Variant extends GameVariant>(
  game: Variant,
  position: GameStateMap[Variant],
  getSuggestion?: (attempt: FailedMoveAttempt) => MoveSuggestion | null,
) {
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<MoveSuggestion | null>(null);
  const [helpMessage, setHelpMessage] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previous = useRef<{ key: string; at: number; explanation: string; attempt: FailedMoveAttempt } | null>(null);

  const stopHint = useCallback(() => {
    if (expiry.current !== null) clearTimeout(expiry.current);
    expiry.current = null;
    hintOpacity.stopAnimation();
    hintOpacity.setValue(1);
    setHint(null);
    setHelpMessage(null);
  }, [hintOpacity]);
  const clear = useCallback(() => {
    previous.current = null;
    stopHint();
    setMessage(null);
  }, [stopHint]);

  useEffect(clear, [position, clear]);
  useFocusEffect(useCallback(() => clear, [clear]));
  useEffect(() => {
    let mounted = true;
    let changed = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && !changed && !enabled) setReduceMotion(false);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      changed = true;
      setReduceMotion(enabled);
    });
    return () => { mounted = false; subscription?.remove(); };
  }, []);
  useEffect(() => {
    if (reduceMotion) {
      hintOpacity.stopAnimation();
      hintOpacity.setValue(1);
    }
  }, [reduceMotion, hintOpacity]);

  function showSuggestion(attempt: FailedMoveAttempt) {
    const suggestion = getSuggestion?.(attempt) ?? null;
    setHint(suggestion);
    setHelpMessage(suggestion ? `Try this move: ${suggestion.label}`
      : 'No move suggestion is available. Try Undo or a new game.');
    if (suggestion) {
      if (!reduceMotion) {
        Animated.sequence([0.3, 1, 0.3, 1].map((toValue) =>
          Animated.timing(hintOpacity, { toValue, duration: 350, useNativeDriver: Platform.OS !== 'web' }))).start();
      }
      expiry.current = setTimeout(stopHint, 2200);
    }
  }

  // A game may switch selection after rejection; a second tap can still ask for help while deselecting.
  function repeatPress(spot: object): boolean {
    const last = previous.current;
    const now = Date.now();
    if (!last || now - last.at > 1500
      || JSON.stringify(last.attempt.destination ?? last.attempt.source) !== JSON.stringify(spot)) return false;
    previous.current = { ...last, at: now };
    stopHint();
    setMessage(last.explanation);
    showSuggestion(last.attempt);
    return true;
  }

  function reject(code: string, explanation: string, attempt: FailedMoveAttempt, interaction: 'press' | 'drag' = 'press') {
    const now = Date.now();
    const key = JSON.stringify(attempt);
    const repeated = interaction === 'press' && previous.current?.key === key
      && now - previous.current.at <= 1500;
    previous.current = interaction === 'press' ? { key, at: now, explanation, attempt } : null;
    stopHint();
    setMessage(explanation);
    if (repeated) {
      showSuggestion(attempt);
    }
    recordFailedMove({ schemaVersion: 1,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      occurredAt: new Date().toISOString(), game, interaction,
      position: trainingPosition(position), attempt: visibleJson(attempt),
      rejection: { code, message: explanation },
    });
  }

  return { message, hint, helpMessage, hintOpacity, reject, repeatPress, clear };
}

export function MoveHintOverlay({ feedback, target }: { feedback: ReturnType<typeof useMoveFeedback>; target: string }) {
  if (!feedback.hint?.targets.includes(target)) return null;
  return <Animated.View testID={`move-hint-${target}`} pointerEvents="none"
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.hint, { opacity: feedback.hintOpacity }]} />;
}

export function MoveFeedback({ feedback }: { feedback: ReturnType<typeof useMoveFeedback> }) {
  const log = useFailedMoveLog(false);
  if (!feedback.message) return null;
  return (
    <View pointerEvents="box-none" style={styles.feedback}>
      <View pointerEvents="box-none" style={styles.notice}>
        <Text pointerEvents="none" role="status" accessibilityLiveRegion="polite" style={styles.message}>
          {feedback.message}{feedback.helpMessage ? `\n${feedback.helpMessage}` : ''}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss move explanation" onPress={feedback.clear} style={styles.dismiss}>
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>
      {log.error && log.pending > 0 ? <Text pointerEvents="none" style={styles.logError}>This attempt is not saved to the training log. Retry logging in Settings.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  feedback: { position: 'absolute', bottom: spacing.md, left: spacing.md, right: spacing.md, zIndex: 50 },
  hint: { ...StyleSheet.absoluteFillObject, borderWidth: 3, borderColor: palette.onTable, borderRadius: radius.md,
    backgroundColor: 'rgba(215, 181, 109, 0.25)', zIndex: 35 },
  notice: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, borderColor: palette.accent, borderWidth: 2, borderRadius: radius.md, paddingLeft: spacing.md, gap: spacing.xs },
  message: { flex: 1, color: palette.ink, fontSize: 16, lineHeight: 23, paddingVertical: spacing.sm },
  dismiss: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  close: { color: palette.ink, fontSize: 26 },
  logError: { color: palette.paper, fontSize: 14, lineHeight: 21, paddingTop: spacing.xs },
});
