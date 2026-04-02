import { rankLabel } from '@mumscards/engine-core';
import type { PlayingCard } from '@mumscards/engine-core';
import type { KlondikeTableauCard } from '@mumscards/game-klondike';
import type { ReactNode } from 'react';
import { useMemo, useRef } from 'react';
import {
  PanResponder,
  type PanResponderGestureState,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
  emptyState?: 'default' | 'recycle';
  expanded?: boolean;
  layoutMode?: 'stack' | 'waste';
  placeholderLabel: string;
  onCardPress?(): void;
  onFaceUpCardPress?(cardIndex: number): void;
  onCardDragStart?(cardIndex: number, payload: DragPayload): void;
  onCardDragMove?(cardIndex: number, payload: DragPayload): void;
  onCardDragEnd?(cardIndex: number, payload: DragPayload): void;
  onCardHoldEnd?(): void;
  onCardHoldStart?(): void;
  hiddenFromIndex?: number;
  selected?: boolean;
  variant?: 'face' | 'back';
};

export type DragPayload = {
  layout: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pageX: number;
  pageY: number;
};

export function CardStack({
  cardWidth,
  cards,
  emptyState = 'default',
  expanded = false,
  layoutMode = 'stack',
  placeholderLabel,
  onCardPress,
  onFaceUpCardPress,
  onCardDragStart,
  onCardDragMove,
  onCardDragEnd,
  onCardHoldEnd,
  onCardHoldStart,
  hiddenFromIndex,
  selected,
  variant = 'face',
}: Props) {
  const cardHeight = Math.round(cardWidth * 1.42);
  const hiddenOffset = Math.round(cardHeight * (expanded ? 0.24 : 0.18));
  const faceUpOffset = Math.round(cardHeight * (expanded ? 0.48 : 0.28));
  const wasteOffset = Math.round(cardWidth * 0.28);
  const visibleCards = hiddenFromIndex === undefined ? cards : cards.slice(0, hiddenFromIndex);

  if (visibleCards.length === 0) {
    return (
      <View
        style={[
          emptyState === 'recycle' ? styles.recyclePlaceholder : styles.placeholder,
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

  const totalHeight = layoutMode === 'waste'
    ? cardHeight
    : visibleCards.reduce((height, card, index) => {
      if (index === 0) {
        return cardHeight;
      }

      const faceUp = !('faceUp' in card) || card.faceUp;
      return height + (faceUp ? faceUpOffset : hiddenOffset);
    }, 0);
  const totalWidth = layoutMode === 'waste'
    ? cardWidth + wasteOffset * Math.max(0, visibleCards.length - 1)
    : cardWidth;

  return (
    <View
      style={[
        styles.stackContainer,
        {
          width: totalWidth,
          minHeight: totalHeight,
        },
      ]}
    >
      {visibleCards.map((card, index) => {
        const faceUp = !('faceUp' in card) || card.faceUp;
        const isBottomCard = index === visibleCards.length - 1;
        const offset = layoutMode === 'waste'
          ? 0
          : visibleCards.slice(0, index).reduce((value, current) => {
            const previousFaceUp = !('faceUp' in current) || current.faceUp;
            return value + (previousFaceUp ? faceUpOffset : hiddenOffset);
          }, 0);
        const horizontalOffset = layoutMode === 'waste' ? wasteOffset * index : 0;
        const isInteractiveCard = layoutMode === 'waste' ? index === visibleCards.length - 1 : true;
        const content = faceUp && variant !== 'back'
          ? renderFace(card, cardWidth, cardHeight, selected)
          : renderBack(cardWidth, cardHeight, selected, emptyState === 'recycle');

        return (
          <DraggableCardLayer
            key={card.id}
            cardHeight={cardHeight}
            cardWidth={cardWidth}
            disabled={
              !faceUp ||
              !isInteractiveCard ||
              (!onCardPress && !onFaceUpCardPress && !onCardDragStart)
            }
            left={horizontalOffset}
            onActivate={
              onFaceUpCardPress && faceUp
                ? () => onFaceUpCardPress(index)
                : onCardPress
            }
            onDragEnd={
              faceUp && isInteractiveCard && onCardDragEnd
                ? (payload) => onCardDragEnd(index, payload)
                : undefined
            }
            onDragMove={
              faceUp && isInteractiveCard && onCardDragMove
                ? (payload) => onCardDragMove(index, payload)
                : undefined
            }
            onDragStart={
              faceUp && isInteractiveCard && onCardDragStart
                ? (payload) => onCardDragStart(index, payload)
                : undefined
            }
            onHoldEnd={layoutMode === 'stack' && isBottomCard && faceUp ? onCardHoldEnd : undefined}
            onHoldStart={
              layoutMode === 'stack' && isBottomCard && faceUp ? onCardHoldStart : undefined
            }
            top={offset}
          >
            {content}
          </DraggableCardLayer>
        );
      })}
    </View>
  );
}

function DraggableCardLayer({
  cardHeight,
  cardWidth,
  children,
  disabled,
  left,
  onActivate,
  onDragEnd,
  onDragMove,
  onDragStart,
  onHoldEnd,
  onHoldStart,
  top,
}: {
  cardHeight: number;
  cardWidth: number;
  children: ReactNode;
  disabled?: boolean;
  left?: number;
  onActivate?(): void;
  onDragEnd?(payload: DragPayload): void;
  onDragMove?(payload: DragPayload): void;
  onDragStart?(payload: DragPayload): void;
  onHoldEnd?(): void;
  onHoldStart?(): void;
  top: number;
}) {
  const containerRef = useRef<View | null>(null);
  const didDragRef = useRef(false);
  const dragStartedRef = useRef(false);
  const holdTriggeredRef = useRef(false);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function measurePayload(
    pageX: number,
    pageY: number,
    callback: (payload: DragPayload) => void,
  ) {
    containerRef.current?.measureInWindow((x, y, width, height) => {
      callback({
        layout: {
          x,
          y,
          width,
          height,
        },
        pageX,
        pageY,
      });
    });
  }

  function clearHoldTimer() {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }

  function finishHold() {
    if (holdTriggeredRef.current) {
      holdTriggeredRef.current = false;
      onHoldEnd?.();
    }
  }

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          if (disabled) {
            return false;
          }

          return Boolean(onActivate || onDragStart);
        },
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (disabled || !onDragStart) {
            return false;
          }

          return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
        },
        onPanResponderGrant: () => {
          didDragRef.current = false;
          dragStartedRef.current = false;
          holdTriggeredRef.current = false;

          if (onHoldStart) {
            holdTimeoutRef.current = setTimeout(() => {
              holdTriggeredRef.current = true;
              onHoldStart();
            }, 260);
          }
        },
        onPanResponderMove: (event, gestureState) => {
          if (disabled || !onDragStart) {
            return;
          }

          const distance = Math.abs(gestureState.dx) + Math.abs(gestureState.dy);

          if (distance < 6 && !dragStartedRef.current) {
            return;
          }

          clearHoldTimer();
          finishHold();
          didDragRef.current = true;

          if (!dragStartedRef.current) {
            dragStartedRef.current = true;
            measurePayload(event.nativeEvent.pageX, event.nativeEvent.pageY, onDragStart);
            return;
          }

          if (onDragMove) {
            measurePayload(event.nativeEvent.pageX, event.nativeEvent.pageY, onDragMove);
          }
        },
        onPanResponderRelease: (event) => {
          clearHoldTimer();

          if (dragStartedRef.current && onDragEnd) {
            finishHold();
            measurePayload(event.nativeEvent.pageX, event.nativeEvent.pageY, onDragEnd);
            return;
          }

          const heldOpen = holdTriggeredRef.current;
          finishHold();

          if (heldOpen) {
            return;
          }

          if (!didDragRef.current) {
            onActivate?.();
          }
        },
        onPanResponderTerminate: (event) => {
          clearHoldTimer();

          if (dragStartedRef.current && onDragEnd) {
            finishHold();
            measurePayload(event.nativeEvent.pageX, event.nativeEvent.pageY, onDragEnd);
            return;
          }

          finishHold();
        },
      }),
    [disabled, onActivate, onDragEnd, onDragMove, onDragStart, onHoldEnd, onHoldStart],
  );

  return (
    <View
      accessibilityRole="button"
      ref={containerRef}
      style={[
        styles.cardLayer,
        {
          top,
          left,
          width: cardWidth,
          height: cardHeight,
        },
      ]}
      {...responder.panHandlers}
    >
      {children}
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
      <View style={styles.leadingCorner}>
        <Text style={[styles.cornerRank, card.color === 'red' ? styles.red : styles.black]}>
          {rankLabel(card.rank)}
        </Text>
        <Text style={[styles.leadingSuit, card.color === 'red' ? styles.red : styles.black]}>
          {suitSymbols[card.suit]}
        </Text>
      </View>
      <Text style={[styles.centerSuit, card.color === 'red' ? styles.red : styles.black]}>
        {suitSymbols[card.suit]}
      </Text>
      <Text style={[styles.cornerSuit, card.color === 'red' ? styles.red : styles.black]}>
        {suitSymbols[card.suit]}
      </Text>
    </View>
  );
}

function renderBack(width: number, height: number, selected?: boolean, recycle = false) {
  return (
    <View
      style={[
        recycle ? styles.recycleBack : styles.cardBack,
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
  recyclePlaceholder: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(215, 181, 109, 0.5)',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(215, 181, 109, 0.22)',
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
    boxShadow: '0px 3px 10px rgba(0, 0, 0, 0.14)',
  },
  cardBack: {
    backgroundColor: palette.tableShadow,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.accentMuted,
    padding: spacing.xs,
  },
  recycleBack: {
    backgroundColor: '#7d6435',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.accent,
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
  leadingCorner: {
    gap: 2,
  },
  leadingSuit: {
    fontSize: 14,
    lineHeight: 14,
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
