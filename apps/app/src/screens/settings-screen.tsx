import type {
  KlondikeDrawCount,
  KlondikeEmptyTableauPolicy,
  KlondikeHintMode,
} from '@mumscards/game-klondike';
import type { FreeCellTableauBuildPolicy } from '@mumscards/game-freecell';
import type { SpiderSuitMode } from '@mumscards/game-spider';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

const drawModes: Array<{ value: KlondikeDrawCount; label: string; description: string }> = [
  {
    value: 1,
    label: 'Draw 1',
    description: 'Draw one card from stock each time.',
  },
  {
    value: 3,
    label: 'Draw 3',
    description: 'Draw three cards from stock each time.',
  },
];

const emptyTableauModes: Array<{
  value: KlondikeEmptyTableauPolicy;
  label: string;
  description: string;
}> = [
  {
    value: 'any',
    label: 'Any',
    description: 'Any face-up run root can move to an empty tableau.',
  },
  {
    value: 'king-only',
    label: 'King only',
    description: 'Only Kings can move to an empty tableau.',
  },
];

const spiderSuitModes: Array<{
  value: SpiderSuitMode;
  label: string;
  description: string;
}> = [
  {
    value: 'spades-only',
    label: 'Black only',
    description: 'Use Spades only.',
  },
  {
    value: 'hearts-only',
    label: 'Red only',
    description: 'Use Hearts only.',
  },
  {
    value: 'red-black',
    label: 'Red/Black',
    description: 'Use Hearts and Spades.',
  },
  {
    value: 'all-suits',
    label: '4 suits',
    description: 'Use Clubs, Diamonds, Hearts, and Spades.',
  },
];

const freeCellTableauBuildModes: Array<{
  value: FreeCellTableauBuildPolicy;
  label: string;
  description: string;
}> = [
  {
    value: 'any',
    label: 'Any',
    description: 'Allow any suit/color if rank descends by one.',
  },
  {
    value: 'alternate-red-black',
    label: 'Alternate Red/Black',
    description: 'Require alternating colors for tableau builds.',
  },
  {
    value: 'suit-matching',
    label: 'Suit matching',
    description: 'Require matching suits for tableau builds.',
  },
];

const debugModes: Array<{ value: boolean; label: string; description: string }> = [
  {
    value: true,
    label: 'On',
    description: 'Show debug-only controls like Save/Load snapshots.',
  },
  {
    value: false,
    label: 'Off',
    description: 'Hide debug-only controls.',
  },
];

export function SettingsScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const { settings, updateSettings } = useAppModel();
  const game = params.game === 'spider'
    ? 'spider'
    : params.game === 'freecell'
      ? 'freecell'
      : params.game === 'pyramid'
        ? 'pyramid'
      : 'klondike';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Text style={styles.heading}>
            {game === 'spider'
              ? 'Spider settings'
              : game === 'freecell'
                ? 'FreeCell settings'
                : game === 'pyramid'
                  ? 'Pyramid settings'
                : 'Klondike settings'}
          </Text>
          <Text style={styles.subheading}>Rule toggles apply to new games.</Text>

          {game === 'spider' ? (
            <>
              <Text style={styles.sectionHeading}>Spider mode</Text>
              {spiderSuitModes.map((mode) => {
                const active = settings.spiderSuitMode === mode.value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={mode.value}
                    onPress={() => void updateSettings({ spiderSuitMode: mode.value })}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                      {mode.label}
                    </Text>
                    <Text
                      style={[styles.optionDescription, active && styles.optionDescriptionActive]}
                    >
                      {mode.description}
                    </Text>
                  </Pressable>
                );
              })}

              <Text style={styles.sectionHeading}>Debug tools</Text>
              {debugModes.map((mode) => {
                const active = settings.spiderDebugTools === mode.value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={`spider-debug-${String(mode.value)}`}
                    onPress={() => void updateSettings({ spiderDebugTools: mode.value })}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                      {mode.label}
                    </Text>
                    <Text
                      style={[styles.optionDescription, active && styles.optionDescriptionActive]}
                    >
                      {mode.description}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          ) : game === 'freecell' ? (
            <>
              <Text style={styles.sectionHeading}>FreeCell</Text>
              {freeCellTableauBuildModes.map((mode) => {
                const active = settings.freeCellTableauBuildPolicy === mode.value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={mode.value}
                    onPress={() => void updateSettings({ freeCellTableauBuildPolicy: mode.value })}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                      {mode.label}
                    </Text>
                    <Text
                      style={[styles.optionDescription, active && styles.optionDescriptionActive]}
                    >
                      {mode.description}
                    </Text>
                  </Pressable>
                );
              })}

              <Text style={styles.sectionHeading}>Debug tools</Text>
              {debugModes.map((mode) => {
                const active = settings.freeCellDebugTools === mode.value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={`freecell-debug-${String(mode.value)}`}
                    onPress={() => void updateSettings({ freeCellDebugTools: mode.value })}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                      {mode.label}
                    </Text>
                    <Text
                      style={[styles.optionDescription, active && styles.optionDescriptionActive]}
                    >
                      {mode.description}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          ) : game === 'pyramid' ? (
            <>
              <Text style={styles.sectionHeading}>Pyramid</Text>
              <Text style={styles.subheading}>
                Draw one from stock, remove exposed cards that total 13, and recycle up to three
                passes.
              </Text>

              <Text style={styles.sectionHeading}>Debug tools</Text>
              {debugModes.map((mode) => {
                const active = settings.pyramidDebugTools === mode.value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={`pyramid-debug-${String(mode.value)}`}
                    onPress={() => void updateSettings({ pyramidDebugTools: mode.value })}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                      {mode.label}
                    </Text>
                    <Text
                      style={[styles.optionDescription, active && styles.optionDescriptionActive]}
                    >
                      {mode.description}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          ) : (
            <>
              <Text style={styles.sectionHeading}>Draw style</Text>
              {drawModes.map((mode) => {
                const active = settings.drawCount === mode.value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={mode.value}
                    onPress={() => void updateSettings({ drawCount: mode.value })}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                      {mode.label}
                    </Text>
                    <Text
                      style={[styles.optionDescription, active && styles.optionDescriptionActive]}
                    >
                      {mode.description}
                    </Text>
                  </Pressable>
                );
              })}

              <Text style={styles.sectionHeading}>Hint mode</Text>
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
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                      {mode.label}
                    </Text>
                    <Text
                      style={[styles.optionDescription, active && styles.optionDescriptionActive]}
                    >
                      {mode.description}
                    </Text>
                  </Pressable>
                );
              })}

              <Text style={styles.sectionHeading}>Empty tableau rule</Text>
              {emptyTableauModes.map((mode) => {
                const active = settings.emptyTableauPolicy === mode.value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={mode.value}
                    onPress={() => void updateSettings({ emptyTableauPolicy: mode.value })}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                      {mode.label}
                    </Text>
                    <Text
                      style={[styles.optionDescription, active && styles.optionDescriptionActive]}
                    >
                      {mode.description}
                    </Text>
                  </Pressable>
                );
              })}

              <Text style={styles.sectionHeading}>Debug tools</Text>
              {debugModes.map((mode) => {
                const active = settings.klondikeDebugTools === mode.value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={`klondike-debug-${String(mode.value)}`}
                    onPress={() => void updateSettings({ klondikeDebugTools: mode.value })}
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                      {mode.label}
                    </Text>
                    <Text
                      style={[styles.optionDescription, active && styles.optionDescriptionActive]}
                    >
                      {mode.description}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.table,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  container: {
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
  sectionHeading: {
    color: palette.paper,
    fontSize: typography.subtitle,
    fontWeight: '700',
    marginTop: spacing.sm,
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
