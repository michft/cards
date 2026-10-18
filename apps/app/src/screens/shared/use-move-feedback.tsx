import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { recordFailedMove, trainingPosition, visibleJson, useFailedMoveLog, type FailedMoveAttempt } from '../../state/failed-moves';
import type { GameStateMap, GameVariant } from '../../state/types';
import { palette, radius, spacing } from '../../theme';

export type { FailedMoveAttempt } from '../../state/failed-moves';

export function useMoveFeedback<Variant extends GameVariant>(game: Variant, position: GameStateMap[Variant]) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { setMessage(null); }, [position]);

  function reject(code: string, explanation: string, attempt: FailedMoveAttempt, interaction: 'press' | 'drag' = 'press') {
    setMessage(explanation);
    recordFailedMove({ schemaVersion: 1,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      occurredAt: new Date().toISOString(), game, interaction,
      position: trainingPosition(position), attempt: visibleJson(attempt),
      rejection: { code, message: explanation },
    });
  }

  return { message, reject, clear: () => setMessage(null) };
}

export function MoveFeedback({ feedback }: { feedback: ReturnType<typeof useMoveFeedback> }) {
  const log = useFailedMoveLog(false);
  if (!feedback.message) return null;
  return (
    <View>
      <View style={styles.notice}>
        <Text role="status" accessibilityLiveRegion="polite" style={styles.message}>{feedback.message}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss move explanation" onPress={feedback.clear} style={styles.dismiss}>
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>
      {log.error && log.pending > 0 ? <Text style={styles.logError}>This attempt is not saved to the training log. Retry logging in Settings.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, borderColor: palette.accent, borderWidth: 2, borderRadius: radius.md, paddingLeft: spacing.md, gap: spacing.xs },
  message: { flex: 1, color: palette.ink, fontSize: 16, lineHeight: 23, paddingVertical: spacing.sm },
  dismiss: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  close: { color: palette.ink, fontSize: 26 },
  logError: { color: palette.paper, fontSize: 14, lineHeight: 21, paddingTop: spacing.xs },
});
