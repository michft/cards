import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import { rankLabel } from '@mumscards/engine-core';
import type { PlayingCard } from '@mumscards/engine-core';
import { Ionicons } from '@expo/vector-icons';
import { createClockGame, drawClockStock, normalizeClockState, placeClockActiveCard, type ClockState } from '@mumscards/game-clock';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppModel } from '../state/app-provider';
import { palette, radius, spacing, typography } from '../theme';
import { createGameHistory as createHistoryState, persistGameHistory, restoreGameHistory, type GameHistory } from './shared/game-history';
import { CardStack } from './shared/card-stack';
import { useCardDrag } from './shared/use-card-drag';
import { useGameBoardSpace } from './shared/use-game-board-space';
import { GameScreenLayout } from './shared/game-screen-layout';
import { availableGames } from './shared/available-games';
import { MoveFeedback, MoveHintOverlay, useMoveFeedback, type MoveSuggestion } from './shared/use-move-feedback';
import { ShortcutPressable } from './shared/shortcut-pressable';
import { useWebGameShortcuts } from './shared/use-web-game-shortcuts';

type HistoryState = GameHistory<ClockState>;
type ClockDestination = { zone: 'hour'; hourIndex: number } | { zone: 'stock'; pileIndex: number };

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
  const boardSpace = useGameBoardSpace();
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
  const [history, setHistory] = useState<HistoryState>(() =>
    mode === 'resume' && savedGame ? restoreGameHistory(savedGame) : createHistoryState(createClockGame(Math.random)),
  );
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [snapshotPickerOpen, setSnapshotPickerOpen] = useState(false);
  const feedback = useMoveFeedback('clock', history.present, () => suggestClockMove(history.present));
  const compactLabels = boardSpace.width < 420;
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
  // Include the outermost card in every fan and the hour labels, in either orientation.
  function canvasSize(size: number) {
    const cardHeight = Math.round(size * 1.42);
    const radius = size * 6.6 * 0.42;
    const tail = Math.max(4, Math.round(size * 0.2)) * (maxHourDepth - 1);
    return Math.ceil(2 * Math.max(radius + tail + cardHeight / 2, radius + cardHeight * 0.55 + 12));
  }
  let cardWidth = 64;
  while (cardWidth > 1 && canvasSize(cardWidth) > Math.min(boardSpace.width, boardSpace.height)) {
    cardWidth -= 1;
  }
  const cardHeight = Math.round(cardWidth * 1.42);
  const radialFanStep = Math.max(4, Math.round(cardWidth * 0.2));
  const radiusPx = cardWidth * 6.6 * 0.42;
  const centerStockGap = spacing.xs;
  const centerStockWidth = cardWidth * 2 + centerStockGap;
  const centerStockHeight = cardHeight * 2 + centerStockGap;
  const labelRadius = radiusPx + cardHeight * 0.55;
  const clockCanvasSize = canvasSize(cardWidth);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (history.present.won || history.present.lost) {
      void clearGame('clock');
      return;
    }

    const envelope = persistGameHistory('clock', history);

    void saveGame('clock', envelope);
  }, [clearGame, history, hydrated, saveGame]);

  const cardDrag = useCardDrag<string, ClockDestination>({
    getCards(cardId) {
      const active = history.present.activeCard;
      return active?.id === cardId ? [active] : [];
    },
    getDestinations() {
      const active = history.present.activeCard;
      if (!active || history.present.won || history.present.lost) return [];
      if (active.rank === 13) {
        const pileIndex = history.present.activeStockPileIndex;
        return pileIndex === null || pileIndex === undefined ? [] : [{ zone: 'stock', pileIndex }];
      }
      return [{ zone: 'hour', hourIndex: getHourIndexForRank(active.rank) }];
    },
    onDrop() { place(); },
    onStart: feedback.clear,
    onCancel: feedback.clear,
    onReject(_, destination) {
      if (destination?.zone === 'hour' && activeSource?.zone === 'hour'
        && destination.hourIndex === activeSource.hourIndex) return;
      if (destination?.zone === 'stock' && activeSource?.zone === 'stock'
        && destination.pileIndex === activeSource.pileIndex) return;
      rejectDestination(destination, 'drag');
    },
  });

  function clearInteraction() {
    feedback.clear();
    cardDrag.cancel();
    setGameMenuOpen(false);
    setSnapshotPickerOpen(false);
  }

  function commit(next: ClockState) {
    setHistory((current) => ({
      initial: current.initial,
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

  function restartGame() {
    setHistory((current) => createHistoryState(current.initial));
    clearInteraction();
  }

  function drawFromStockPile(pileIndex: number) {
    const next = drawClockStock(history.present, pileIndex);

    if (next !== history.present) {
      commit(next);
      return;
    }

    rejectDestination({ zone: 'stock', pileIndex });
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
      rejectDestination({ zone: 'hour', hourIndex });
      return;
    }

    place();
  }

  function rejectDestination(destination: ClockDestination | null, interaction: 'press' | 'drag' = 'press') {
    const active = history.present.activeCard;
    const attempt = { kind: active ? 'move' as const : 'draw' as const,
      source: active ? { ...activeSource, cardId: active.id } : undefined, destination };
    if (history.present.won || history.present.lost) {
      feedback.reject('game-finished', 'This game has ended. Undo a move or start a new game.', attempt, interaction);
    } else if (!active) {
      if (destination?.zone === 'stock') {
        feedback.reject('stock-unavailable', 'That stock pile is empty or its King has already returned. Choose another stock pile.', attempt, interaction);
      } else {
        feedback.reject('draw-first', 'Draw from an unfinished stock pile in the centre before placing a card.', attempt, interaction);
      }
    } else if (active.rank === 13) {
      feedback.reject('king-origin', `Return this King to its original stock pile${history.present.activeStockPileIndex == null ? '' : ` (${history.present.activeStockPileIndex + 1})`}.`, attempt, interaction);
    } else if (destination?.zone === 'stock') {
      feedback.reject('active-card-first', `Place the active ${rankLabel(active.rank)} on the ${rankLabel(active.rank)} hour before drawing another stock card.`, attempt, interaction);
    } else {
      feedback.reject('matching-hour', `Place the active ${rankLabel(active.rank)} on the ${rankLabel(active.rank)} hour. Cards must match their hour.`, attempt, interaction);
    }
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
        initial: current.initial,
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
        initial: current.initial,
        past: [...current.past, current.present].slice(-50),
        present: next,
        future: current.future.slice(1),
      };
    });
    clearInteraction();
  }

  useWebGameShortcuts({
    onUndo: undo,
    onRedo: redo,
    onNew: startNewGame,
    onRestart: restartGame,
  });

  function saveCurrentState() {
    const envelope = persistGameHistory('clock', history);
    void saveSnapshot('clock', envelope);
  }

  function loadSnapshot(snapshot: PersistedGameEnvelope<ClockState>) {
    setHistory(restoreGameHistory(snapshot));
    clearInteraction();
  }

  const dragFrame = cardDrag.drag ? boardSpace.fitDrag(cardDrag.drag.x, cardDrag.drag.y, cardWidth) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <GameScreenLayout currentGame="clock" onNew={startNewGame}>
      <View ref={cardDrag.rootRef} onLayout={cardDrag.measureTargets} style={styles.screen}>
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
              {availableGames.map((game) => (
                <Pressable key={game.id} accessibilityRole="button"
                  onPress={() => {
                    setGameMenuOpen(false);
                    router.replace(`/game/${game.id}?mode=resume`);
                  }}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}>
                  <Text style={styles.actionButtonText}>{game.name}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.replace('/');
                }}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              >
                <Text style={styles.actionButtonText}>{'< home'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} scrollEnabled={!cardDrag.drag}>
          <View style={styles.headerActions}>
            <ActionButton label="New" onPress={startNewGame} shortcut="Cmd/Ctrl+Alt+N" />
            <ActionButton label="Restart" onPress={restartGame} shortcut="Cmd+R" />
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
            <ActionButton
              label="Undo"
              onPress={undo}
              disabled={history.past.length === 0}
              shortcut="Cmd+Z"
            />
            <ActionButton
              label="Redo"
              onPress={redo}
              disabled={history.future.length === 0}
              shortcut="Cmd+Shift+Z"
            />
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

          <View ref={boardSpace.ref} onLayout={boardSpace.onLayout} style={styles.boardSpace}>
            <View testID="game-board" style={[styles.clockBoard, { height: clockCanvasSize, width: clockCanvasSize }]}>
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
                  accessibilityLabel={`${hourLabels[hourIndex]} hour`}
                  accessibilityRole="button"
                  key={`clock-hour-${hourIndex}`}
                  testID={`clock-hour-${hourIndex}`}
                  ref={cardDrag.registerTarget(`hour-${hourIndex}`, { zone: 'hour', hourIndex })}
                  onLayout={cardDrag.measureTargets}
                  onPress={() => handleHourPress(hourIndex)}
                  style={[
                    styles.hourSlot,
                    cardDrag.drag?.activeDestination?.zone === 'hour'
                      && cardDrag.drag.activeDestination.hourIndex === hourIndex && styles.dragTarget,
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
                            isActiveCard ? styles.activeCard : showFace ? styles.clockPlacedFaceCard : styles.clockBackCard,
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
                          {isActiveCard ? (
                            <CardStack
                              cardWidth={cardWidth}
                              cards={[card]}
                              hiddenFromIndex={cardDrag.drag?.source === card.id ? 0 : undefined}
                              onCardPress={handleActivePress}
                              onCardDragStart={(_, payload) => cardDrag.start(card.id, payload)}
                              onCardDragMove={(_, payload) => cardDrag.move(payload)}
                              onCardDragEnd={(_, payload) => cardDrag.end(payload)}
                              onCardDragCancel={cardDrag.cancel}
                              placeholderLabel=""
                              selected
                            />
                          ) : showFace ? (
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
                  <MoveHintOverlay feedback={feedback} target={`hour-${hourIndex}`} />
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
                const topIsReturnedKing = Boolean(top && returnedKingIds.includes(top.id));
                const variant = stockActiveCard || topIsReturnedKing ? 'face' : 'back';

                return (
                  <View
                    key={`clock-stock-pile-${pileIndex}`}
                    testID={`clock-stock-${pileIndex}`}
                    style={cardDrag.drag?.activeDestination?.zone === 'stock'
                      && cardDrag.drag.activeDestination.pileIndex === pileIndex ? styles.dragTarget : undefined}
                    ref={cardDrag.registerTarget(`stock-${pileIndex}`, { zone: 'stock', pileIndex })}
                    onLayout={cardDrag.measureTargets}
                  >
                    <CardStack
                      accessibilityLabel={stockActiveCard ? undefined : `Stock pile ${pileIndex + 1}`}
                      cardWidth={cardWidth}
                      cards={stockActiveCard ? [stockActiveCard] : top ? [top] : []}
                      hiddenFromIndex={stockActiveCard && cardDrag.drag?.source === stockActiveCard.id ? 0 : undefined}
                      onCardDragStart={stockActiveCard
                        ? (_, payload) => cardDrag.start(stockActiveCard.id, payload) : undefined}
                      onCardDragMove={(_, payload) => cardDrag.move(payload)}
                      onCardDragEnd={(_, payload) => cardDrag.end(payload)}
                      onCardDragCancel={cardDrag.cancel}
                      onCardPress={
                        stockActiveCard
                          ? handleActivePress
                          : kingReturnTarget
                            ? handleKingPilePress
                          : () => drawFromStockPile(pileIndex)
                      }
                      placeholderLabel=""
                      selected={Boolean(stockActiveCard)}
                      variant={variant}
                    />
                    <MoveHintOverlay feedback={feedback} target={`stock-${pileIndex}`} />
                  </View>
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
                  pointerEvents="none"
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
          </View>
        </ScrollView>
        <MoveFeedback feedback={feedback} />
        {cardDrag.drag && dragFrame ? (
          <View testID="drag-preview" pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={{
              position: 'absolute',
              left: dragFrame.left - cardDrag.rootOffset.x,
              top: dragFrame.top - cardDrag.rootOffset.y,
            }}>
              <CardStack cardWidth={cardWidth} maxHeight={dragFrame.maxHeight} cards={cardDrag.drag.cards} placeholderLabel="" selected />
            </View>
          </View>
        ) : null}
      </View>
      </GameScreenLayout>
    </SafeAreaView>
  );
}

function suggestClockMove(position: ClockState): MoveSuggestion | null {
  const state = normalizeClockState(position);
  if (state.won || state.lost) return null;
  if (state.activeCard) {
    if (placeClockActiveCard(state) === state) return null;
    const source = state.activeSource ?? { zone: 'stock' as const, pileIndex: 0 };
    const sourceTarget = source.zone === 'hour' ? `hour-${source.hourIndex}` : `stock-${source.pileIndex}`;
    const destination = state.activeCard.rank === 13
      ? `stock-${state.activeStockPileIndex}` : `hour-${getHourIndexForRank(state.activeCard.rank)}`;
    return {
      label: state.activeCard.rank === 13
        ? `Return the active King to stock pile ${(state.activeStockPileIndex ?? 0) + 1}.`
        : `Move the active ${rankLabel(state.activeCard.rank)} to the ${rankLabel(state.activeCard.rank)} hour.`,
      targets: [...new Set([sourceTarget, destination])],
    };
  }
  const pileIndex = state.stockPiles.findIndex((_, index) => drawClockStock(state, index) !== state);
  return pileIndex < 0 ? null : { label: `Draw from stock pile ${pileIndex + 1}.`, targets: [`stock-${pileIndex}`] };
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

function ActionButton({
  disabled,
  label,
  onPress,
  shortcut,
}: {
  disabled?: boolean;
  label: string;
  onPress(): void;
  shortcut?: string;
}) {
  return (
    <ShortcutPressable
      disabled={disabled}
      onPress={onPress}
      shortcut={shortcut}
      style={({ pressed }) => [
        styles.actionButton,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <Text style={styles.actionButtonText}>{label}</Text>
    </ShortcutPressable>
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
    paddingTop: 44 + spacing.sm * 2,
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
    minHeight: 44,
    justifyContent: 'center',
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
    backgroundColor: palette.surfaceMuted,
  },
  actionIconButton: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    minWidth: 44,
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
    minHeight: 44,
    justifyContent: 'center',
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
    minHeight: 44,
    minWidth: 44,
  },
  snapshotText: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '600',
  },
  clockBoard: {
    position: 'relative',
  },
  boardSpace: {
    alignItems: 'center',
    width: '100%',
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
  dragTarget: {
    borderRadius: radius.md,
    boxShadow: '0px 0px 0px 3px #d7b56d',
  },
  activeCard: {
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
    color: palette.onTableMuted,
    fontSize: typography.eyebrow,
    fontWeight: '700',
  },
  clockHintLabel: {
    color: palette.onTable,
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
