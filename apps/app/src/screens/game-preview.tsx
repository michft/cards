import { StyleSheet, Text, View } from 'react-native';

import type { GameVariant } from '../state/types';
import { palette } from '../theme';

type MiniCard = {
  x: number;
  y: number;
  rank?: string;
  suit?: '♠' | '♥' | '♣' | '♦';
  back?: boolean;
};

const suits = ['♠', '♥', '♣', '♦'] as const;
const ranks = ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A'];
const foundations: MiniCard[] = suits.map((suit, index) => ({
  x: 108 + index * 30, y: 2, rank: 'A', suit,
}));

function cardsFor(game: GameVariant): MiniCard[] {
  switch (game) {
    case 'clock':
      return [...Array.from({ length: 12 }, (_, index) => {
        const angle = (index + 1) * Math.PI / 6;
        return {
          x: 109 + Math.sin(angle) * 83,
          y: 59 - Math.cos(angle) * 55,
          rank: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'][index],
          suit: suits[index % 4],
        };
      }), { x: 109, y: 59, back: true }];
    case 'pyramid':
      return [...Array.from({ length: 7 }, (_, row) =>
        Array.from({ length: row + 1 }, (_, column) => ({
          x: 109 - row * 15 + column * 30,
          y: row * 13,
          rank: ranks[(row + column) % ranks.length],
          suit: suits[(row + column) % 4],
        })),
      ).flat(), { x: 84, y: 112, back: true }, { x: 120, y: 112, rank: '6', suit: '♥' }];
    case 'freecell':
      return [
        { x: 4, y: 2, rank: '5', suit: '♥' }, { x: 32, y: 2 },
        { x: 60, y: 2 }, { x: 88, y: 2 },
        ...foundations.map((card) => ({ ...card, x: card.x + 10 })),
        ...Array.from({ length: 8 }, (_, column) =>
          Array.from({ length: 4 }, (_, depth) => ({
            x: 4 + column * 29, y: 44 + depth * 20,
            rank: ranks[(column + depth) % ranks.length], suit: suits[(column + depth) % 4],
          })),
        ).flat(),
      ];
    case 'spider':
      return [
        ...Array.from({ length: 5 }, (_, index) => ({ x: 151 + index * 16, y: 2, back: true })),
        ...Array.from({ length: 10 }, (_, column) =>
          Array.from({ length: 4 }, (_, depth) => ({
            x: column * 24, y: 44 + depth * 19,
            back: depth < 2,
            rank: ranks[(column + depth - 2) % ranks.length], suit: '♠' as const,
          })),
        ).flat(),
      ];
    case 'klondike':
      return [
        { x: 18, y: 2, back: true }, { x: 48, y: 2, rank: 'Q', suit: '♠' },
        ...foundations,
        ...Array.from({ length: 7 }, (_, column) =>
          Array.from({ length: column + 1 }, (_, depth) => ({
            x: 18 + column * 30, y: 44 + depth * 11,
            back: depth < column,
            rank: ranks[column], suit: suits[column % 4],
          })),
        ).flat(),
      ];
  }
}

/** Decorative layouts, independent of saved games and game engines. */
export function GamePreview({ game }: { game: GameVariant }) {
  return (
    <View aria-hidden accessible={false} importantForAccessibility="no-hide-descendants" style={styles.board}>
      {cardsFor(game).map((card, index) => (
        <View key={index} style={[
          styles.card,
          card.back && styles.back,
          !card.back && !card.rank && styles.empty,
          { left: card.x, top: card.y },
        ]}>
          {card.back ? <View style={styles.backInset} /> : card.rank ? (
            <Text style={[styles.rank, (card.suit === '♥' || card.suit === '♦') && styles.red]}>
              {card.rank}{'\n'}{card.suit}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { width: 240, height: 148 },
  card: {
    position: 'absolute', width: 22, height: 31, borderRadius: 3,
    backgroundColor: palette.paper, borderWidth: 1, borderColor: '#d9cfb9',
    padding: 2,
  },
  rank: { color: palette.black, fontSize: 9, lineHeight: 11, fontWeight: '700' },
  red: { color: palette.red },
  back: { backgroundColor: palette.accent, borderColor: '#e3cb91' },
  backInset: { flex: 1, borderWidth: 1, borderColor: '#947538', borderRadius: 1 },
  empty: { backgroundColor: 'transparent', borderColor: '#69917b', borderStyle: 'dashed' },
});
