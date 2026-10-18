import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppModel } from '../../src/state/app-provider';
import { palette, radius, spacing } from '../../src/theme';

import { ClockGameScreen } from '../../src/screens/clock-game-screen';
import { FreeCellGameScreen } from '../../src/screens/freecell-game-screen';
import { KlondikeGameScreen } from '../../src/screens/klondike-game-screen';
import { PyramidGameScreen } from '../../src/screens/pyramid-game-screen';
import { SpiderGameScreen } from '../../src/screens/spider-game-screen';

export default function GameRoute() {
  const params = useLocalSearchParams<{ gameId?: string; mode?: string }>();
  const router = useRouter();
  const { hydrated, hydrationError, retryHydration, saves, saveRevision } = useAppModel();
  const gameId = params.gameId === 'spider' || params.gameId === 'clock'
    || params.gameId === 'freecell' || params.gameId === 'pyramid' ? params.gameId : 'klondike';
  const mode = params.mode === 'new' ? 'new' : 'resume';
  const gameKey = `${gameId}:${mode}:${saveRevision}`;
  const savedGame = saves[gameId];
  const request = useRef({ key: gameKey, hydrated, previousSave: savedGame, replaced: false });
  if (request.current.key !== gameKey || request.current.hydrated !== hydrated) {
    request.current = { key: gameKey, hydrated, previousSave: savedGame, replaced: false };
  }

  useEffect(() => {
    if (mode === 'new' && hydrated && savedGame && savedGame !== request.current.previousSave
      && !request.current.replaced) {
      request.current.replaced = true;
      // Resume the newly saved deal when reload or browser history reopens this URL.
      router.replace(`/game/${gameId}?mode=resume`);
    }
  }, [gameId, hydrated, mode, router, savedGame]);

  if (!hydrated) {
    if (hydrationError) {
      return (
        <View style={styles.errorPanel}>
          <Text accessibilityRole="alert" style={styles.errorText}>{hydrationError}</Text>
          <Pressable accessibilityRole="button" style={styles.retry} onPress={() => void retryHydration()}>
            <Text style={styles.retryText}>Retry storage</Text>
          </Pressable>
        </View>
      );
    }
    return <ActivityIndicator color={palette.onTable} accessibilityLabel="Loading game" />;
  }

  if (gameId === 'spider') {
    return <SpiderGameScreen key={gameKey} mode={mode} />;
  }

  if (gameId === 'clock') {
    return <ClockGameScreen key={gameKey} mode={mode} />;
  }

  if (gameId === 'freecell') {
    return <FreeCellGameScreen key={gameKey} mode={mode} />;
  }

  if (gameId === 'pyramid') {
    return <PyramidGameScreen key={gameKey} mode={mode} />;
  }

  return (
    <KlondikeGameScreen
      key={gameKey}
      gameId={gameId}
      mode={mode}
    />
  );
}

const styles = StyleSheet.create({
  errorPanel: { padding: spacing.lg, gap: spacing.md },
  errorText: { color: palette.onTable, fontSize: 16, lineHeight: 24 },
  retry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', padding: spacing.sm, backgroundColor: palette.paper, borderRadius: radius.sm },
  retryText: { color: palette.ink, fontSize: 16, fontWeight: '600' },
});
