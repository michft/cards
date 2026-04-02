import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppModel } from '../state/app-provider';
import type { GameVariant } from '../state/types';
import { palette, radius, spacing, typography } from '../theme';

export function HomeScreen() {
  const { hydrated, saves } = useAppModel();
  const lastSavedGame = hydrated
    ? (
      Object.entries(saves) as Array<[GameVariant, (typeof saves)[GameVariant]]>
    )
      .filter(
        (entry): entry is [GameVariant, NonNullable<(typeof saves)[GameVariant]>] =>
          Boolean(entry[1]),
      )
      .sort((left, right) => {
        const leftTime = new Date(left[1].updatedAt).getTime();
        const rightTime = new Date(right[1].updatedAt).getTime();
        return rightTime - leftTime;
      })[0] ?? null
    : null;
  const canContinue = Boolean(lastSavedGame);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Offline-first solitaire</Text>
          <Text style={styles.title}>Mum&apos;s Cards</Text>
          <Text style={styles.subtitle}>
            A modular Solitare scaffold with a reusable engine, future variant slots, and
            conservative table styling.
          </Text>
        </View>

        <View style={styles.menu}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/game/klondike?mode=new')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.primaryButtonText}>New Klondike</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/game/clock?mode=new')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.secondaryButtonText}>New Clock</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/game/freecell?mode=new')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.secondaryButtonText}>New FreeCell</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/game/pyramid?mode=new')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.secondaryButtonText}>New Pyramid</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/game/spider?mode=new')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.secondaryButtonText}>New Spider</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={!canContinue}
            onPress={() => {
              if (!lastSavedGame) {
                return;
              }

              router.push(`/game/${lastSavedGame[0]}?mode=resume`);
            }}
            style={({ pressed }) => [
              styles.secondaryButton,
              !canContinue && styles.buttonDisabled,
              pressed && canContinue && styles.buttonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {canContinue ? 'Continue Last Game' : 'Continue unavailable'}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.table,
  },
  container: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  hero: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  eyebrow: {
    color: palette.accent,
    fontSize: typography.eyebrow,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: palette.paper,
    fontSize: 42,
    fontWeight: '700',
  },
  subtitle: {
    color: '#ebdfca',
    fontSize: typography.body,
    lineHeight: 24,
    maxWidth: 480,
  },
  menu: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  secondaryButton: {
    backgroundColor: palette.paper,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: palette.ink,
    fontSize: typography.subtitle,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryButtonText: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
  },
});
