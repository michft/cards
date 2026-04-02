import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius, spacing, typography } from '../theme';

const rulesByGame: Record<string, { title: string; rules: string[] }> = {
  clock: {
    title: 'Clock',
    rules: [
      'Cards are dealt into 12 hour piles arranged in a circle, with 4 cards left in stock.',
      'Draw one card from stock to the active slot.',
      'Place the active card onto its matching hour: Ace=1 through Queen=12.',
      'After placing, reveal the previous top card from that hour as the next active card.',
      'Kings move to the king pile. Win by resolving all cards and finding all 4 kings.',
    ],
  },
  freecell: {
    title: 'FreeCell',
    rules: [
      'Build tableau piles down by one rank.',
      'Tableau color/suit policy is configurable in Settings.',
      'Use free cells as temporary single-card storage.',
      'Foundations build up by suit from Ace to King.',
      'Move depth is limited by available free cells.',
    ],
  },
  klondike: {
    title: 'Klondike',
    rules: [
      'Build tableau piles down in alternating colours.',
      'Move complete face-up runs between tableau piles.',
      'Empty tableau columns can be configured as King-only or Any in Settings.',
      'Build foundations upward by suit from Ace through King.',
      'Draw style is configurable: draw 1 or draw 3 from stock. When stock is empty, recycle the waste.',
    ],
  },
  pyramid: {
    title: 'Pyramid',
    rules: [
      'Remove exposed cards in pairs that sum to 13.',
      'Kings (13) can be removed on their own.',
      'Only unblocked tableau cards can be removed.',
      'Draw one card from stock to waste to form pairs with tableau cards.',
      'When stock is empty, recycle waste until passes are exhausted.',
    ],
  },
  spider: {
    title: 'Spider',
    rules: [
      'Build tableau piles down by rank.',
      'Completed K-to-A suited runs are moved to foundations automatically.',
      'You can move a valid descending suited run as a group.',
      'Deal stock only when every tableau column has at least one card.',
      'Suit mode (single/dual/four-suit variants) is configurable in Settings.',
    ],
  },
};

export function RulesScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const game = params.game ?? 'klondike';
  const content = rulesByGame[game] ?? rulesByGame.klondike;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>{content.title}</Text>
          {content.rules.map((rule) => (
            <Text key={rule} style={styles.rule}>
              {`\u2022 ${rule}`}
            </Text>
          ))}
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
