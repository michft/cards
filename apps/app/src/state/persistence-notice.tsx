import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, spacing } from '../theme';
import { useAppModel } from './app-provider';

export function PersistenceNotice() {
  const { persistenceError, storageConflict, retryPersistence, reloadSavedGames } = useAppModel();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web' || !persistenceError) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [persistenceError]);

  if (!persistenceError) return null;
  return (
    <View style={styles.notice}>
      <Text accessibilityRole="alert">{persistenceError}</Text>
      <Pressable accessibilityRole="button" onPress={() => {
        if (storageConflict) {
          router.replace('/');
          void reloadSavedGames();
        } else {
          void retryPersistence();
        }
      }} style={styles.button}>
        <Text>{storageConflict ? 'Load latest saves' : 'Retry saving'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: palette.paper, padding: spacing.md, gap: spacing.sm },
  button: { alignSelf: 'flex-start', padding: spacing.sm, backgroundColor: palette.accent },
});
