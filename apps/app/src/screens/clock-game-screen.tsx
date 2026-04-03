import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import { rankLabel } from '@mumscards/engine-core';
import type { PlayingCard } from '@mumscards/engine-core';
import { Ionicons } from '@expo/vector-icons';
import { createClockGame, drawClockStock, placeClockActiveCard, type ClockState } from '@mumscards/game-clock';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppModel } from '../state/app-provider';
import { palette, radius, spacing, typography } from '../theme';
import { CardStack } from './shared/card-stack';

type HistoryState = {
  past: ClockState[];
  present: ClockState;
  future: ClockState[];
};

type Props = {
  mode: 'new' | 'resume';
};

const baseHourLabels = ['Q', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J'];
const suitSymbols: Record<PlayingCard['suit'], string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

export function ClockGameScreen({ mode }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const {
    clearGame,
    deleteSnapshot,
    hydrated,
    saveGame,
    saveSnapshot,
    saves,
    settings,
    snapshots,
  } = useAppModel();
  const savedGame = saves.clock;
  const resumeRestoredRef = useRef(false);
  const [history, setHistory] = useState<HistoryState>(() =>
    createHistoryState(mode === 'resume' && savedGame ? savedGame.state : createClockGame(Math.random)),
  );
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [snapshotPickerOpen, setSnapshotPickerOpen] = useState(false);
  const availableWidth = Math.max(320, width - spacing.lg * 2);
  const cardWidth = Math.max(42, Math.min(64, availableWidth / 9));
  const cardHeight = Math.round(cardWidth * 1.42);
  const radialFanStep = Math.max(8, Math.round(cardWidth * 0.2));
  const boardSize = cardWidth * 6.6;
  const radiusPx = boardSize * 0.42;
  const centerStockGap = spacing.xs;
  const centerStockWidth = cardWidth * 2 + centerStockGap;
  const centerStockHeight = cardHeight * 2 + centerStockGap;
  const compactLabels = width < 420;
  const hourLabels = compactLabels
    ? baseHourLabels.map((label, index) => (index === 10 ? 'X' : label))
    : baseHourLabels;
  const stockPiles = history.present.stockPiles ?? deriveLegacyStockPiles(history.present.stock ?? []);
  const placedCardIds = history.present.placedCardIds ?? [];
  const activeSource =
    history.present.activeSource
    ?? (history.present.activeCard ? { zone: 'stock' as const, pileIndex: 0 } : null);
  const completedStockPiles = history.present.completedStockPiles ?? [];
  const returnedKingIds = history.present.returnedKingIds ?? [];
  const maxHourDepth = history.present.hours.reduce((maxDepth, pile, hourIndex) => {
    const activeFromThisHour = Boolean(
      history.present.activeCard
        && activeSource?.zone === 'hour'
        && activeSource.hourIndex === hourIndex,
    );
    return Math.max(maxDepth, pile.length + (activeFromThisHour ? 1 : 0));
  }, 1);
  const outwardTail = radialFanStep * Math.max(0, maxHourDepth - 1);
  const labelRadius = radiusPx + cardHeight * 0.55;
  const contentRadius = Math.max(labelRadius + spacing.sm, radiusPx + outwardTail + cardHeight);
  const canvasPadding = Math.max(spacing.md, Math.round(contentRadius - radiusPx));
  const clockCanvasSize = boardSize + canvasPadding * 2;
  const boardMargin = Math.max(spacing.sm, (availableWidth - clockCanvasSize) / 2);

  useEffect(() => {
    resumeRestoredRef.current = false;
    setHistory(createHistoryState(createClockGame(Math.random)));
    clearInteraction();
  }, [mode]);

  useEffect(() => {
    if (!hydrated || mode !== 'resume' || resumeRestoredRef.current || !savedGame) {
      return;
    }

    resumeRestoredRef.current = true;
    setHistory(createHistoryState(savedGame.state));
    clearInteraction();
  }, [hydrated, mode, savedGame]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (history.present.won || history.present.lost) {
      void clearGame('clock');
      return;
    }

    const envelope: PersistedGameEnvelope<ClockState> = {
      gameId: 'clock',
      updatedAt: new Date().toISOString(),
      state: history.present,
    };

    void saveGame('clock', envelope);
  }, [clearGame, history.present, hydrated, saveGame]);

  function clearInteraction() {
    setGameMenuOpen(false);
    setSnapshotPickerOpen(false);
  }

  function commit(next: ClockState) {
    setHistory((current) => ({
      past: [...current.past.slice(-49), current.present],
      present: next,
      future: [],
    }));
    clearInteraction();
  }

  function startNewGame() {
    setHistory(createHistoryState(createClockGame(Math.random)));
    clearInteraction();
  }

  function drawFromStockPile(pileIndex: number) {
    const next = drawClockStock(history.present, pileIndex);

    if (next !== history.present) {
      commit(next);
    }
  }

  function place() {
    const next = placeClockActiveCard(history.present);

    if (next !== history.present) {
      commit(next);
    }
  }

  function handleHourPress(hourIndex: number) {
    const active = history.present.activeCard;

    if (!active || getHourIndexForRank(active.rank) !== hourIndex) {
      return;
    }

    place();
  }

  function handleKingPilePress() {
    const active = history.present.activeCard;

    if (!active || active.rank !== 13) {
      return;
    }

    place();
  }

  function handleActivePress() {
    const active = history.present.activeCard;

    if (!active) {
      return;
    }

    if (active.rank === 13) {
      handleKingPilePress();
      return;
    }

    handleHourPress(getHourIndexForRank(active.rank));
  }

  function undo() {
    setHistory((current) => {
      const previous = current.past[current.past.length - 1];

      if (!previous) {
        return current;
      }

      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, 50),
      };
    });
    clearInteraction();
  }

  function redo() {
    setHistory((current) => {
      const next = current.future[0];

      if (!next) {
        return current;
      }

      return {
        past: [...current.past, current.present].slice(-50),
        present: next,
        future: current.future.slice(1),
      };
    });
    clearInteraction();
  }

  function saveCurrentState() {
    const envelope: PersistedGameEnvelope<ClockState> = {
      gameId: 'clock',
      updatedAt: new Date().toISOString(),
      state: history.present,
    };
    void saveSnapshot('clock', envelope);
  }

  function loadSnapshot(snapshot: PersistedGameEnvelope<ClockState>) {
    setHistory(createHistoryState(snapshot.state));
    clearInteraction();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.floatingNavWrap}>
          <View style={styles.floatingNavRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setGameMenuOpen((current) => !current)}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
            >
              <Text style={styles.actionButtonText}>Games ▾</Text>
            </Pressable>
          </View>
          {gameMenuOpen ? (
            <View style={styles.floatingGameMenu}>
              <View style={[styles.actionButton, styles.actionButtonActive]}>
                <Text style={styles.actionButtonTextActive}>Clock</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.replace('/game/freecell?mode=new');
                }}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              >
                <Text style={styles.actionButtonText}>FreeCell</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.replace('/game/klondike?mode=new');
                }}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              >
                <Text style={styles.actionButtonText}>Klondike</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.replace('/game/pyramid?mode=new');
                }}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              >
                <Text style={styles.actionButtonText}>Pyramid</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.replace('/game/spider?mode=new');
                }}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              >
                <Text style={styles.actionButtonText}>Spider</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.push('/');
                }}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              >
                <Text style={styles.actionButtonText}>{'< home'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerActions}>
            <ActionButton label="New" onPress={startNewGame} />
            {settings.clockDebugTools ? (
              <ActionButton label="Save" onPress={saveCurrentState} />
            ) : null}
            {settings.clockDebugTools ? (
              <ActionButton
                label="Load"
                onPress={() => setSnapshotPickerOpen((current) => !current)}
                disabled={snapshots.clock.length === 0}
              />
            ) : null}
            <ActionButton label="Undo" onPress={undo} disabled={history.past.length === 0} />
            <ActionButton label="Redo" onPress={redo} disabled={history.future.length === 0} />
            <ActionButton label="Rules" onPress={() => router.push('/rules?game=clock')} />
            <Pressable
              accessibilityLabel="Open settings"
              accessibilityRole="button"
              onPress={() => router.push('/settings?game=clock')}
              style={({ pressed }) => [
                styles.actionButton,
                styles.actionIconButton,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Ionicons color={palette.ink} name="settings-outline" size={18} />
            </Pressable>
          </View>

          {settings.clockDebugTools && snapshotPickerOpen ? (
            <View style={styles.snapshotPanel}>
              {snapshots.clock.map((snapshot) => (
                <View key={snapshot.id} style={styles.snapshotRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => loadSnapshot(snapshot)}
                    style={({ pressed }) => [
                      styles.snapshotLoadButton,
                      pressed && styles.actionButtonPressed,
                    ]}
                  >
                    <Text style={styles.snapshotText}>{snapshot.label}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void deleteSnapshot('clock', snapshot.id)}
                    style={({ pressed }) => [
                      styles.snapshotDeleteButton,
                      pressed && styles.actionButtonPressed,
                    ]}
                  >
                    <Ionicons color={palette.ink} name="trash-outline" size={16} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {history.present.won ? <Text style={styles.winText}>Clock solved.</Text> : null}
          {history.present.lost ? <Text style={styles.lossText}>Clock lost.</Text> : null}

          <ScrollView
            horizontal
            nestedScrollEnabled
            contentContainerStyle={[styles.clockBoardScrollContent, { paddingHorizontal: boardMargin }]}
            showsHorizontalScrollIndicator={false}
          >
            <View style={[styles.clockBoard, { height: clockCanvasSize, width: clockCanvasSize }]}>
            {history.present.hours.map((pile, hourIndex) => {
              const angle = (Math.PI * 2 * hourIndex) / 12 - Math.PI / 2;
              const center = clockCanvasSize / 2;
              const dx = Math.cos(angle);
              const dy = Math.sin(angle);
              const activeFromThisHour = Boolean(
                history.present.activeCard
                && activeSource?.zone === 'hour'
                && activeSource.hourIndex === hourIndex,
              );
              const renderedCards = activeFromThisHour && history.present.activeCard
                ? [...pile, history.present.activeCard]
                : pile;
              const topX = center + dx * radiusPx - cardWidth / 2;
              const topY = center + dy * radiusPx - cardHeight / 2;
              const baseX = topX + dx * radialFanStep * Math.max(0, renderedCards.length - 1);
              const baseY = topY + dy * radialFanStep * Math.max(0, renderedCards.length - 1);
              const slotLeft = Math.min(topX, baseX);
              const slotTop = Math.min(topY, baseY);
              const slotWidth = cardWidth + Math.abs(topX - baseX);
              const slotHeight = cardHeight + Math.abs(topY - baseY);

              return (
                <Pressable
                  accessibilityRole="button"
                  key={`clock-hour-${hourIndex}`}
                  onPress={() => handleHourPress(hourIndex)}
                  style={[
                    styles.hourSlot,
                    {
                      height: slotHeight,
                      left: slotLeft,
                      top: slotTop,
                      width: slotWidth,
                    },
                  ]}
                >
                  {renderedCards.length === 0 ? (
                    <View
                      style={[
                        styles.hourPlaceholder,
                        {
                          height: cardHeight,
                          left: 0,
                          top: 0,
                          width: cardWidth,
                        },
                      ]}
                    >
                      <Text style={styles.hourPlaceholderText}>{hourLabels[hourIndex]}</Text>
                    </View>
                  ) : (
                    renderedCards.map((card, cardIndex) => {
                      const isActiveCard = activeFromThisHour && cardIndex === renderedCards.length - 1;
                      const showFace = isActiveCard || placedCardIds.includes(card.id);

                      return (
                        <View
                          key={`${card.id}-${isActiveCard ? 'active' : 'pile'}`}
                          style={[
                            showFace ? styles.clockPlacedFaceCard : styles.clockBackCard,
                            {
                              height: cardHeight,
                              left:
                                baseX
                                - slotLeft
                                - dx * radialFanStep * (renderedCards.length - 1 - cardIndex),
                              top:
                                baseY
                                - slotTop
                                - dy * radialFanStep * (renderedCards.length - 1 - cardIndex),
                              width: cardWidth,
                              zIndex: cardIndex + 1,
                            },
                          ]}
                        >
                          {showFace ? (
                            <>
                              <Text
                                style={[
                                  styles.faceRank,
                                  card.color === 'red' ? styles.faceRed : styles.faceBlack,
                                ]}
                              >
                                {rankLabel(card.rank)}
                              </Text>
                              <Text
                                style={[
                                  styles.faceSuit,
                                  card.color === 'red' ? styles.faceRed : styles.faceBlack,
                                ]}
                              >
                                {suitSymbols[card.suit]}
                              </Text>
                            </>
                          ) : null}
                        </View>
                      );
                    })
                  )}
                </Pressable>
              );
            })}

            <View
              style={[
                styles.centerStockGrid,
                {
                  height: centerStockHeight,
                  transform: [
                    { translateX: -centerStockWidth / 2 },
                    { translateY: -centerStockHeight / 2 },
                  ],
                  width: centerStockWidth,
                },
              ]}
            >
              {Array.from({ length: 4 }, (_, pileIndex) => {
                const pile = stockPiles[pileIndex] ?? [];
                const top = pile[pile.length - 1];
                const stockActiveCard = activeSource?.zone === 'stock' && activeSource.pileIndex === pileIndex
                  ? history.present.activeCard
                  : null;
                const kingReturnTarget = Boolean(
                  history.present.activeCard
                    && history.present.activeCard.rank === 13
                    && history.present.activeStockPileIndex === pileIndex,
                );
                const canStartFromPile = Boolean(
                  history.present.activeCard === null
                    && top
                    && top.rank !== 13
                    && !completedStockPiles.includes(pileIndex),
                );
                const topIsReturnedKing = Boolean(top && returnedKingIds.includes(top.id));
                const variant = stockActiveCard || topIsReturnedKing ? 'face' : 'back';

                return (
                  <CardStack
                    cardWidth={cardWidth}
                    cards={stockActiveCard ? [stockActiveCard] : top ? [top] : []}
                    key={`clock-stock-pile-${pileIndex}`}
                    onCardPress={
                      stockActiveCard
                        ? handleActivePress
                        : kingReturnTarget
                          ? handleKingPilePress
                        : canStartFromPile
                          ? () => drawFromStockPile(pileIndex)
                        : undefined
                    }
                    placeholderLabel=""
                    selected={Boolean(stockActiveCard)}
                    variant={variant}
                  />
                );
              })}
            </View>

            {history.present.hours.map((_, hourIndex) => {
              const angle = (Math.PI * 2 * hourIndex) / 12 - Math.PI / 2;
              const center = clockCanvasSize / 2;
              const x = center + Math.cos(angle) * labelRadius;
              const y = center + Math.sin(angle) * labelRadius;

              return (
                <Text
                  key={`clock-label-${hourIndex}`}
                  style={[
                    styles.clockHintLabel,
                    {
                      left: x - 8,
                      top: y - 10,
                    },
                  ]}
                >
                  {hourLabels[hourIndex]}
                </Text>
              );
            })}
            </View>
          </ScrollView>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function getHourIndexForRank(rank: number): number {
  if (rank === 12) {
    return 0;
  }

  return rank;
}

function deriveLegacyStockPiles(legacyStock: PlayingCard[]): PlayingCard[][] {
  return [0, 1, 2, 3].map((index) => {
    const card = legacyStock[legacyStock.length - 1 - index];
    return card ? [card] : [];
  });
}

function createHistoryState(state: ClockState): HistoryState {
  return {
    past: [],
    present: state,
    future: [],
  };
}

function ActionButton({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.table,
  },
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  floatingNavWrap: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.md,
    zIndex: 40,
    elevation: 8,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  floatingNavRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  floatingGameMenu: {
    flexDirection: 'column',
    gap: spacing.xs,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(8, 25, 19, 0.18)',
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionButton: {
    backgroundColor: palette.paper,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actionButtonActive: {
    backgroundColor: palette.accent,
  },
  actionButtonText: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '600',
  },
  actionButtonTextActive: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '700',
  },
  actionButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionIconButton: {
    alignItems: 'center',
    minHeight: 38,
    justifyContent: 'center',
    minWidth: 38,
    paddingHorizontal: spacing.sm,
  },
  snapshotPanel: {
    backgroundColor: palette.paper,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  snapshotRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  snapshotLoadButton: {
    backgroundColor: '#f2ebdc',
    borderRadius: radius.sm,
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  snapshotDeleteButton: {
    alignItems: 'center',
    backgroundColor: '#f2ebdc',
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 30,
  },
  snapshotText: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '600',
  },
  clockBoard: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    position: 'relative',
  },
  clockBoardScrollContent: {
    paddingBottom: spacing.xs,
  },
  centerStockGrid: {
    left: '50%',
    position: 'absolute',
    top: '50%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    zIndex: 20,
  },
  hourSlot: {
    position: 'absolute',
  },
  clockPlacedFaceCard: {
    alignItems: 'flex-start',
    backgroundColor: palette.paper,
    borderColor: '#ddcfb2',
    borderRadius: radius.md,
    borderWidth: 2,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    position: 'absolute',
  },
  clockBackCard: {
    backgroundColor: '#2f5e50',
    borderColor: '#dac897',
    borderRadius: radius.md,
    borderWidth: 2,
    position: 'absolute',
  },
  faceRank: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  faceSuit: {
    alignSelf: 'flex-end',
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  faceRed: {
    color: palette.red,
  },
  faceBlack: {
    color: palette.black,
  },
  hourPlaceholder: {
    alignItems: 'center',
    borderColor: '#6c8c80',
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    position: 'absolute',
  },
  hourPlaceholderText: {
    color: '#bdd1c5',
    fontSize: typography.eyebrow,
    fontWeight: '700',
  },
  clockHintLabel: {
    color: '#d9caa7',
    fontSize: typography.eyebrow,
    fontWeight: '700',
    position: 'absolute',
    zIndex: 30,
  },
  winText: {
    color: '#f3e1b5',
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  lossText: {
    color: '#f1d0c2',
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
});
