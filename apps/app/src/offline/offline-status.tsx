import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radius, spacing } from '../theme';
import { prepareOfflineApp, useOfflineApp } from './offline-app';

export function OfflineStatus() {
  const state = useOfflineApp();
  if (Platform.OS !== 'web') return null;
  return (
    <View style={styles.panel}>
      <Text role="status" style={styles.heading}>
        {state.status === 'ready' ? (state.offline ? 'Ready offline · No network' : 'Ready offline')
          : state.status === 'error' ? 'Offline setup incomplete' : 'Preparing offline copy…'}
      </Text>
      {state.status === 'error' ? (
        <>
          <Text style={styles.copy}>{state.error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void prepareOfflineApp()} style={styles.retry}>
            <Text>Retry offline setup</Text>
          </Pressable>
        </>
      ) : null}
      {!state.installed ? <Text style={styles.copy}>
        On iPad: Safari → Share → Add to Home Screen → Open as Web App. Open that app once online and wait for Ready offline before disconnecting.
      </Text> : <Text style={styles.copy}>Games and saves stay on this iPad. Keep website data to retain them.</Text>}
      {state.updateAvailable ? <Text style={styles.copy}>Update downloaded. Close all Mum&apos;s Cards windows, then reopen to use it.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: palette.tableShadow, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  heading: { color: palette.paper, fontSize: 16, fontWeight: '700' },
  copy: { color: palette.paper, fontSize: 14, lineHeight: 20 },
  retry: { alignSelf: 'flex-start', backgroundColor: palette.accent, padding: spacing.sm, minHeight: 44, justifyContent: 'center', borderRadius: radius.sm },
});
