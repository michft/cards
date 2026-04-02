import type { KlondikeHintMode } from '@mumscards/game-klondike';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppModel } from '../state/app-provider';
import { palette, radius, spacing, typography } from '../theme';

const hintModes: Array<{ value: KlondikeHintMode; label: string; description: string }> = [
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Prioritize uncovering cards without overcommitting to foundations.',
  },
  {
    value: 'mobility',
    label: 'Mobility',
    description: 'Prefer moves that open tableau space and preserve maneuverability.',
  },
  {
    value: 'foundation-first',
    label: 'Foundation',
    description: 'Prefer promoting cards upward when the move is legal.',
  },
];

export function SettingsScreen() {
  const { settings, updateSettings } = useAppModel();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.heading}>Klondike settings</Text>
        <Text style={styles.subheading}>Draw-three is fixed for v1. Other rule sets are tracked in the roadmap.</Text>

        {hintModes.map((mode) => {
          const active = settings.hintMode === mode.value;

          return (
            <Pressable
              accessibilityRole="button"
              key={mode.value}
              onPress={() => void updateSettings({ hintMode: mode.value })}
              style={({ pressed }) => [
                styles.option,
                active && styles.optionActive,
                pressed && styles.optionPressed,
              ]}
            >
              <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{mode.label}</Text>
              <Text style={[styles.optionDescription, active && styles.optionDescriptionActive]}>
                {mode.description}
              </Text>
            </Pressable>
          );
        })}
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
    gap: spacing.md,
  },
  heading: {
    color: palette.paper,
    fontSize: typography.title,
    fontWeight: '700',
  },
  subheading: {
    color: '#e6dac3',
    fontSize: typography.body,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
  option: {
    backgroundColor: palette.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  optionActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accentMuted,
  },
  optionPressed: {
    transform: [{ scale: 0.99 }],
  },
  optionTitle: {
    color: palette.ink,
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  optionTitleActive: {
    color: palette.ink,
  },
  optionDescription: {
    color: '#5b665f',
    fontSize: typography.body,
    lineHeight: 22,
  },
  optionDescriptionActive: {
    color: '#2f3e34',
  },
});
