import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { clearFailedMoves, exportFailedMoves, FAILED_MOVE_LIMIT, retryFailedMoves, useFailedMoveLog } from '../state/failed-moves';
import { palette, radius, spacing } from '../theme';

export function FailedMoveLogPanel() {
  const log = useFailedMoveLog();
  const [exportError, setExportError] = useState<string | null>(null);
  const canExport = !log.loading && log.count + log.pending > 0;
  const canClear = !log.loading && Boolean(log.count || log.pending || log.error);

  async function exportLog() {
    setExportError(null);
    try {
      const data = await exportFailedMoves();
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([data], { type: 'application/x-ndjson' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'mumscards-failed-moves.jsonl';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        await Share.share({ title: 'Failed-move training log', message: data });
      }
    } catch {
      setExportError('The training log could not be exported. Retry after storage is available.');
    }
  }

  return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={styles.heading}>Failed moves and training</Text>
      <Text style={styles.copy}>Keep the latest {FAILED_MOVE_LIMIT} failed attempts on this device. Each entry records the visible board, active rules, attempted action, and explanation. Hidden cards stay hidden. Nothing is uploaded automatically.</Text>
      <Text style={styles.copy}>
        {log.loading ? 'Reading log…' : `${log.count} saved ${log.count === 1 ? 'attempt' : 'attempts'}${log.pending ? ` · ${log.pending} pending` : ''}`}
      </Text>
      {log.error ? (
        <>
          <Text role="alert" style={styles.error}>{log.error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void retryFailedMoves()} style={styles.button}>
            <Text style={styles.buttonText}>Retry failed-move logging</Text>
          </Pressable>
        </>
      ) : null}
      {exportError ? <Text role="alert" style={styles.error}>{exportError}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={!canExport}
          onPress={() => void exportLog()} style={[styles.button, !canExport && styles.disabled]}>
          <Text style={styles.buttonText}>Export training log</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!canClear}
          onPress={() => { setExportError(null); void clearFailedMoves(); }}
          style={[styles.button, !canClear && styles.disabled]}>
          <Text style={styles.buttonText}>Clear failed-move log</Text>
        </Pressable>
      </View>
      <Text style={styles.copy}>Export is JSONL: one failed attempt per line. Clearing this log does not clear saved games.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: spacing.lg, backgroundColor: palette.tableShadow, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { color: palette.paper, fontSize: 20, fontWeight: '700' },
  copy: { color: palette.paper, fontSize: 14, lineHeight: 21 },
  error: { color: '#ffe1a5', fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: { minHeight: 44, justifyContent: 'center', backgroundColor: palette.paper, borderRadius: radius.sm, padding: spacing.sm },
  buttonText: { color: palette.ink, fontSize: 16, fontWeight: '600' },
  disabled: { backgroundColor: palette.surfaceMuted },
});
