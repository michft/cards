import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { GameVariant } from '../../state/types';
import { palette, radius, spacing } from '../../theme';
import { GamePreview } from '../game-preview';
import { availableGames } from './available-games';

export function GameScreenLayout({ children, currentGame, onNew }: {
  children: ReactNode;
  currentGame: GameVariant;
  onNew(): void;
}) {
  const router = useRouter();
  return (
    <View style={styles.layout}>
      <View style={styles.game}>{children}</View>
      <ScrollView testID="new-game-rail" style={styles.rail} contentContainerStyle={styles.railContent}>
        <Text accessibilityRole="header" style={styles.heading}>New game</Text>
        {availableGames.map((game) => (
          <Pressable key={game.id} testID={`new-game-${game.id}`} accessibilityRole="button"
            accessibilityLabel={`New ${game.name}`} accessibilityHint={`Start a fresh ${game.name} deal.`}
            onPress={() => {
              if (game.id === currentGame) onNew();
              else router.replace(`/game/${game.id}?mode=new`);
            }}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <View style={styles.picture}>
              <View style={styles.preview}><GamePreview game={game.id} /></View>
            </View>
            <Text style={styles.label}>{game.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, flexDirection: 'row' },
  game: { flex: 1, minWidth: 0 },
  rail: { flexGrow: 0, flexShrink: 0, width: 100, backgroundColor: palette.tableShadow },
  railContent: { padding: spacing.xs, paddingTop: spacing.sm, gap: spacing.sm },
  heading: { color: palette.onTable, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  button: { minHeight: 76, borderRadius: radius.sm, padding: spacing.xs, gap: 4,
    alignItems: 'center', backgroundColor: palette.paper },
  picture: { width: 72, height: 45, backgroundColor: palette.table, borderRadius: 4 },
  preview: { position: 'absolute', left: -84, top: -51.5, transform: [{ scale: 0.3 }] },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
