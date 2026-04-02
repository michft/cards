import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius, spacing, typography } from '../theme';

const rules = [
  'Build tableau piles down in alternating colours.',
  'Move complete face-up runs between tableau piles.',
  'Only Kings can move into empty tableau columns.',
  'Build foundations upward by suit from Ace through King.',
  'Draw three cards from stock. When stock is empty, recycle the waste.',
];

export function RulesScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Klondike, draw three</Text>
          {rules.map((rule) => (
            <Text key={rule} style={styles.rule}>
              {`\u2022 ${rule}`}
            </Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Roadmap already queued</Text>
          <Text style={styles.rule}>Scoring, leaderboards, extra variants, accessibility, and cloud sync are tracked in `TODO.md`.</Text>
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
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: palette.paper,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: palette.ink,
    fontSize: typography.title,
    fontWeight: '700',
  },
  rule: {
    color: palette.ink,
    fontSize: typography.body,
    lineHeight: 24,
  },
});
