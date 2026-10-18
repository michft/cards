import { rankLabel } from '@mumscards/engine-core';
import type { PlayingCard } from '@mumscards/engine-core';
import type { KlondikeTableauCard } from '@mumscards/game-klondike';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import {
  PanResponder,
  Pressable,
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
  accessibilityLabel?: string;
  cardWidth: number;
  cards: StackCard[];
  emptyState?: 'default' | 'recycle';
  expanded?: boolean;
  layoutMode?: 'stack' | 'waste';
  placeholderLabel: string;
  onCardPress?(): void;
  onFaceUpCardPress?(cardIndex: number): void;
  onFaceDownCardPress?(cardIndex: number): void;
  onCardDragStart?(cardIndex: number, payload: DragPayload): void;
  onCardDragMove?(cardIndex: number, payload: DragPayload): void;
  onCardDragEnd?(cardIndex: number, payload: DragPayload): void;
  onCardDragCancel?(): void;
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
  accessibilityLabel,
  cardWidth,
  cards,
  emptyState = 'default',
  expanded = false,
  layoutMode = 'stack',
  placeholderLabel,
  onCardPress,
  onFaceUpCardPress,
  onFaceDownCardPress,
  onCardDragStart,
  onCardDragMove,
  onCardDragEnd,
  onCardDragCancel,
  onCardHoldEnd,
  onCardHoldStart,
  hiddenFromIndex,
  selected,
  variant = 'face',
}: Props) {
  const cardHeight = Math.round(cardWidth * 1.42);
  const hiddenOffset = Math.round(cardHeight * (expanded ? 0.24 : 0.18));
  const faceUpOffset = Math.round(cardHeight * (expanded ? 0.48 : 0.28));
  const wasteOffset = Math.max(18, Math.round(cardWidth * 0.42));
  if (cards.length === 0) {
    const placeholder = (
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

    if (!onCardPress) {
      return placeholder;
    }

    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onCardPress}>
        {placeholder}
      </Pressable>
    );
  }

  const totalHeight = layoutMode === 'waste'
    ? cardHeight
    : cards.reduce((height, card, index) => {
      if (index === 0) {
        return cardHeight;
      }

      const faceUp = !('faceUp' in card) || card.faceUp;
      return height + (faceUp ? faceUpOffset : hiddenOffset);
    }, 0);
  const totalWidth = layoutMode === 'waste'
    ? cardWidth + wasteOffset * Math.max(0, cards.length - 1)
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
      {cards.map((card, index) => {
        const faceUp = !('faceUp' in card) || card.faceUp;
        const isBottomCard = index === cards.length - 1;
        const offset = layoutMode === 'waste'
          ? 0
          : cards.slice(0, index).reduce((value, current) => {
            const previousFaceUp = !('faceUp' in current) || current.faceUp;
            return value + (previousFaceUp ? faceUpOffset : hiddenOffset);
          }, 0);
        const horizontalOffset = layoutMode === 'waste' ? wasteOffset * index : 0;
        const isInteractiveCard = layoutMode === 'waste' ? index === cards.length - 1 : true;
        const content = faceUp && variant !== 'back'
          ? renderFace(card, cardWidth, cardHeight, selected)
          : renderBack(cardWidth, cardHeight, selected, emptyState === 'recycle');

        return (
          <DraggableCardLayer
            accessibilityLabel={accessibilityLabel ?? (!faceUp && onFaceDownCardPress ? 'Face-down card' : undefined)}
            key={card.id}
            cardHeight={cardHeight}
            cardWidth={cardWidth}
            hidden={hiddenFromIndex !== undefined && index >= hiddenFromIndex}
            disabled={
              !isInteractiveCard ||
              (faceUp ? !onCardPress && !onFaceUpCardPress && !onCardDragStart : !onFaceDownCardPress)
            }
            left={horizontalOffset}
            onActivate={
              !faceUp
                ? onFaceDownCardPress ? () => onFaceDownCardPress(index) : undefined
                : onFaceUpCardPress
                ? () => onFaceUpCardPress(index)
                : onCardPress
            }
            onDragCancel={onCardDragCancel}
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
  accessibilityLabel,
  cardHeight,
  cardWidth,
  children,
  disabled,
  hidden,
  left,
  onActivate,
  onDragEnd,
  onDragCancel,
  onDragMove,
  onDragStart,
  onHoldEnd,
  onHoldStart,
  top,
}: {
  accessibilityLabel?: string;
  cardHeight: number;
  cardWidth: number;
  children: ReactNode;
  disabled?: boolean;
  hidden?: boolean;
  left?: number;
  onActivate?(): void;
  onDragEnd?(payload: DragPayload): void;
  onDragCancel?(): void;
  onDragMove?(payload: DragPayload): void;
  onDragStart?(payload: DragPayload): void;
  onHoldEnd?(): void;
  onHoldStart?(): void;
  top: number;
}) {
  const containerRef = useRef<View | null>(null);
  const didDragRef = useRef(false);
  const dragStartedRef = useRef(false);
  const dragStartDeliveredRef = useRef(false);
  const gestureEpochRef = useRef(0);
  const holdTriggeredRef = useRef(false);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    gestureEpochRef.current += 1;
    if (holdTimeoutRef.current !== null) {
      clearTimeout(holdTimeoutRef.current);
    }
  }, []);

  function measurePayload(
    pageX: number,
    pageY: number,
    callback: (payload: DragPayload) => void,
  ) {
    const epoch = gestureEpochRef.current;
    containerRef.current?.measureInWindow((x, y, width, height) => {
      if (gestureEpochRef.current !== epoch) return;
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
    if (holdTimeoutRef.current !== null) {
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
          gestureEpochRef.current += 1;
          didDragRef.current = false;
          dragStartedRef.current = false;
          dragStartDeliveredRef.current = false;
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
            measurePayload(event.nativeEvent.pageX, event.nativeEvent.pageY, (payload) => {
              dragStartDeliveredRef.current = true;
              onDragStart(payload);
            });
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
            // Invalidate queued moves while allowing this release measurement to finish.
            gestureEpochRef.current += 1;
            measurePayload(event.nativeEvent.pageX, event.nativeEvent.pageY, (payload) => {
              if (!dragStartDeliveredRef.current) {
                dragStartDeliveredRef.current = true;
                onDragStart?.(payload);
              }
              onDragEnd(payload);
            });
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
        onPanResponderTerminate: () => {
          gestureEpochRef.current += 1;
          clearHoldTimer();

          if (dragStartedRef.current) {
            finishHold();
            onDragCancel?.();
            return;
          }

          finishHold();
        },
      }),
    [disabled, onActivate, onDragCancel, onDragEnd, onDragMove, onDragStart, onHoldEnd, onHoldStart],
  );

  return (
    <View
      accessibilityRole="button"
      ref={containerRef}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.cardLayer,
        hidden && styles.hiddenCard,
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
  const rankText = card.rank === 10 && width <= 56 ? 'x' : rankLabel(card.rank);
  const compact = width <= 56;
  const compactPadding = compact ? spacing.xs : spacing.sm;
  const cornerRankSize = compact ? 14 : 18;
  const leadingSuitSize = compact ? 11 : 14;
  const centerSuitSize = compact ? 20 : 28;
  const cornerSuitSize = compact ? 12 : 16;

  return (
    <View
      style={[
        styles.cardFace,
        selected && styles.cardFaceSelected,
        {
          width,
          height,
          padding: compactPadding,
        },
      ]}
    >
      <View style={styles.leadingCorner}>
        <Text
          numberOfLines={1}
          style={[
            styles.cornerRank,
            { fontSize: cornerRankSize, lineHeight: cornerRankSize + 1 },
            card.color === 'red' ? styles.red : styles.black,
          ]}
        >
          {rankText}
        </Text>
        <Text
          style={[
            styles.leadingSuit,
            { fontSize: leadingSuitSize, lineHeight: leadingSuitSize + 1 },
            card.color === 'red' ? styles.red : styles.black,
          ]}
        >
          {suitSymbols[card.suit]}
        </Text>
      </View>
      <Text
        style={[
          styles.centerSuit,
          { fontSize: centerSuitSize, lineHeight: centerSuitSize + 2 },
          card.color === 'red' ? styles.red : styles.black,
        ]}
      >
        {suitSymbols[card.suit]}
      </Text>
      <Text
        style={[
          styles.cornerSuit,
          { fontSize: cornerSuitSize, lineHeight: cornerSuitSize + 1 },
          card.color === 'red' ? styles.red : styles.black,
        ]}
      >
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
  hiddenCard: {
    opacity: 0,
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
    color: palette.onTable,
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
    overflow: 'hidden',
    justifyContent: 'space-between',
    boxShadow: '0px 3px 10px rgba(0, 0, 0, 0.14)',
  },
  cardFaceSelected: {
    backgroundColor: '#f4e8c9',
    boxShadow: '0px 8px 18px rgba(18, 33, 25, 0.24)',
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
    backgroundColor: '#6d6d6d',
    boxShadow: '0px 8px 18px rgba(18, 33, 25, 0.28)',
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
