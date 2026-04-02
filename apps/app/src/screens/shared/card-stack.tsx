import { rankLabel } from '@mumscards/engine-core';
import type { PlayingCard } from '@mumscards/engine-core';
import type { KlondikeTableauCard } from '@mumscards/game-klondike';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radius, spacing } from '../../theme';

const suitSymbols: Record<PlayingCard['suit'], string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

type StackCard = PlayingCard | KlondikeTableauCard;

type Props = {
  cardWidth: number;
  cards: StackCard[];
  placeholderLabel: string;
  onCardPress?(): void;
  onFaceUpCardPress?(cardIndex: number): void;
  selected?: boolean;
  variant?: 'face' | 'back';
};

export function CardStack({
  cardWidth,
  cards,
  placeholderLabel,
  onCardPress,
  onFaceUpCardPress,
  selected,
  variant = 'face',
}: Props) {
  const cardHeight = Math.round(cardWidth * 1.42);
  const hiddenOffset = Math.round(cardHeight * 0.14);
  const faceUpOffset = Math.round(cardHeight * 0.24);

  if (cards.length === 0) {
    return (
      <View
        style={[
          styles.placeholder,
          {
            width: cardWidth,
            height: cardHeight,
          },
        ]}
      >
        <Text style={styles.placeholderText}>{placeholderLabel}</Text>
      </View>
    );
  }

  const totalHeight = cards.reduce((height, card, index) => {
    if (index === 0) {
      return cardHeight;
    }

    const faceUp = !('faceUp' in card) || card.faceUp;
    return height + (faceUp ? faceUpOffset : hiddenOffset);
  }, 0);

  return (
    <View
      style={[
        styles.stackContainer,
        {
          width: cardWidth,
          minHeight: totalHeight,
        },
      ]}
    >
      {cards.map((card, index) => {
        const faceUp = !('faceUp' in card) || card.faceUp;
        const offset = cards.slice(0, index).reduce((value, current, currentIndex) => {
          if (currentIndex === 0) {
            return 0;
          }

          const previousFaceUp = !('faceUp' in current) || current.faceUp;
          return value + (previousFaceUp ? faceUpOffset : hiddenOffset);
        }, 0);
        const content = faceUp && variant !== 'back'
          ? renderFace(card, cardWidth, cardHeight, selected)
          : renderBack(cardWidth, cardHeight, selected);

        return (
          <Pressable
            accessibilityRole="button"
            key={card.id}
            onPress={
              onFaceUpCardPress && faceUp
                ? () => onFaceUpCardPress(index)
                : onCardPress
            }
            style={[
              styles.cardLayer,
              {
                top: offset,
              },
            ]}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}

function renderFace(card: StackCard, width: number, height: number, selected?: boolean) {
  return (
    <View
      style={[
        styles.cardFace,
        selected && styles.cardSelected,
        {
          width,
          height,
        },
      ]}
    >
      <Text style={[styles.cornerRank, card.color === 'red' ? styles.red : styles.black]}>
        {rankLabel(card.rank)}
      </Text>
      <Text style={[styles.centerSuit, card.color === 'red' ? styles.red : styles.black]}>
        {suitSymbols[card.suit]}
      </Text>
      <Text style={[styles.cornerSuit, card.color === 'red' ? styles.red : styles.black]}>
        {suitSymbols[card.suit]}
      </Text>
    </View>
  );
}

function renderBack(width: number, height: number, selected?: boolean) {
  return (
    <View
      style={[
        styles.cardBack,
        selected && styles.cardSelected,
        {
          width,
          height,
        },
      ]}
    >
      <View style={styles.cardBackInset} />
    </View>
  );
}

const styles = StyleSheet.create({
  stackContainer: {
    position: 'relative',
  },
  cardLayer: {
    position: 'absolute',
    left: 0,
  },
  placeholder: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(246, 241, 231, 0.4)',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  placeholderText: {
    color: 'rgba(246, 241, 231, 0.7)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  cardFace: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.sm,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.16,
    shadowRadius: 6,
  },
  cardBack: {
    backgroundColor: palette.tableShadow,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.accentMuted,
    padding: spacing.xs,
  },
  cardBackInset: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(246, 241, 231, 0.45)',
    backgroundColor: 'rgba(215, 181, 109, 0.18)',
  },
  cardSelected: {
    borderColor: palette.accent,
    borderWidth: 2,
  },
  cornerRank: {
    fontSize: 18,
    fontWeight: '700',
  },
  cornerSuit: {
    fontSize: 16,
    alignSelf: 'flex-end',
  },
  centerSuit: {
    fontSize: 28,
    textAlign: 'center',
  },
  red: {
    color: palette.red,
  },
  black: {
    color: palette.black,
  },
});
