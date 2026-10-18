import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineStatus } from '../offline/offline-status';
import { useAppModel } from '../state/app-provider';
import type { GameVariant } from '../state/types';
import { palette, radius, spacing, typography } from '../theme';
import { GamePreview } from './game-preview';
import { availableGames } from './shared/available-games';

export function HomeScreen() {
  const { hydrated, hydrationError, retryHydration, saves } = useAppModel();
  const lastSavedGame = hydrated
    ? (Object.entries(saves) as Array<[GameVariant, (typeof saves)[GameVariant]]>)
      .filter(([id]) => availableGames.some((game) => game.id === id))
      .filter((entry): entry is [GameVariant, NonNullable<(typeof saves)[GameVariant]>] => Boolean(entry[1]))
      .sort((left, right) => new Date(right[1].updatedAt).getTime() - new Date(left[1].updatedAt).getTime())[0] ?? null
    : null;
  const lastGameName = availableGames.find((game) => game.id === lastSavedGame?.[0])?.name;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>A little time for solitaire</Text>
          <Text accessibilityRole="header" style={styles.title}>Mum&apos;s Cards</Text>
          <Text style={styles.subtitle}>Three familiar games. Pick a table and settle in.</Text>
        </View>

        {hydrationError ? (
          <View style={styles.storageNotice}>
            <Text accessibilityRole="alert" style={styles.subtitle}>{hydrationError}</Text>
            <Pressable accessibilityRole="button" onPress={() => void retryHydration()} style={styles.retryButton}>
              <Text style={styles.actionText}>Retry storage</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.collection}>
          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Choose your game</Text>
            <Text style={styles.sectionNote}>Play at your own pace</Text>
          </View>
          <View style={styles.grid}>
            {availableGames.map((game) => (
              <Pressable
                key={game.id}
                accessibilityRole="button"
                accessibilityLabel={`New ${game.name}`}
                accessibilityHint={game.description}
                onPress={() => router.push(`/game/${game.id}?mode=new`)}
                style={({ pressed }) => [styles.gameTile, pressed && styles.tilePressed]}
              >
                <View style={styles.preview}><GamePreview game={game.id} /></View>
                <View style={styles.tileCaption}>
                  <View style={styles.tileCopy}>
                    <Text style={styles.gameTitle}>New {game.name}</Text>
                    <Text style={styles.description}>{game.description}</Text>
                  </View>
                  <Text aria-hidden style={styles.arrow}>↗</Text>
                </View>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={lastSavedGame ? 'Continue Last Game' : 'Continue unavailable'}
              disabled={!lastSavedGame}
              onPress={() => {
                if (lastSavedGame) router.push(`/game/${lastSavedGame[0]}?mode=resume`);
              }}
              style={({ pressed }) => [styles.gameTile, styles.continueTile, pressed && styles.tilePressed]}
            >
              <View aria-hidden style={styles.continueArt}>
                <Text style={styles.continueSymbol}>↩</Text>
                <Text style={styles.continueKicker}>{lastGameName ?? 'Make yourself at home'}</Text>
              </View>
              <View style={styles.tileCaption}>
                <View style={styles.tileCopy}>
                  <Text style={styles.gameTitle}>{lastSavedGame ? 'Continue Last Game' : 'Continue unavailable'}</Text>
                  <Text style={styles.description}>
                    {lastSavedGame ? 'Your last game, right where you left it.' : 'Your saved game will be waiting here.'}
                  </Text>
                </View>
              </View>
            </Pressable>
          </View>
        </View>
        <OfflineStatus />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.table },
  container: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.lg, gap: spacing.xl, paddingBottom: 36 },
  header: { paddingTop: spacing.lg, gap: spacing.sm },
  eyebrow: { color: palette.accent, fontSize: typography.eyebrow, letterSpacing: 1.8, textTransform: 'uppercase', fontWeight: '600' },
  title: { color: palette.paper, fontSize: 46, lineHeight: 54, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  subtitle: { color: '#ebdfca', fontSize: typography.body, lineHeight: 24 },
  collection: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: spacing.xs },
  sectionTitle: { color: palette.paper, fontSize: typography.subtitle, fontWeight: '600' },
  sectionNote: { color: '#d0ddcf', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gameTile: { flexBasis: 280, flexGrow: 1, minWidth: 0, maxWidth: '100%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: palette.paper, borderWidth: 1, borderColor: '#dcd4bf' },
  preview: { minHeight: 180, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.tableShadow, margin: 7, marginBottom: 0, borderRadius: radius.md },
  tileCaption: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  tileCopy: { flex: 1, gap: 5 },
  gameTitle: { color: palette.ink, fontSize: typography.subtitle, fontWeight: '700' },
  description: { color: '#526052', fontSize: 13, lineHeight: 19 },
  arrow: { color: '#526052', fontSize: 24 },
  tilePressed: { opacity: 0.85 },
  continueTile: { backgroundColor: '#e8d6a9', borderColor: palette.accent },
  continueArt: { minHeight: 180, margin: 7, marginBottom: 0, justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
  continueSymbol: { color: palette.table, fontSize: 78, lineHeight: 90 },
  continueKicker: { color: '#4e542f', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  storageNotice: { gap: spacing.sm },
  retryButton: { alignSelf: 'flex-start', backgroundColor: palette.accent, borderRadius: radius.sm, padding: spacing.md, minHeight: 44, justifyContent: 'center' },
  actionText: { color: palette.ink, fontSize: typography.body, fontWeight: '600' },
});
