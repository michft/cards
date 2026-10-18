import { rankLabel, type PersistedGameEnvelope } from '@mumscards/engine-core';
import { Ionicons } from '@expo/vector-icons';
import {
  createPyramidGame,
  drawPyramidStock,
  getPyramidSourceCard,
  isPyramidSourceSelectable,
  recyclePyramidWaste,
  removePyramidCards,
  type PyramidSource,
  type PyramidState,
} from '@mumscards/game-pyramid';
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
import { MoveFeedback, MoveHintOverlay, useMoveFeedback, type FailedMoveAttempt, type MoveSuggestion } from './shared/use-move-feedback';
import { ShortcutPressable } from './shared/shortcut-pressable';
import { useWebGameShortcuts } from './shared/use-web-game-shortcuts';

type HistoryState = GameHistory<PyramidState>;

type Props = {
  mode: 'new' | 'resume';
};

export function PyramidGameScreen({ mode }: Props) {
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
  const savedGame = saves.pyramid;
  const [history, setHistory] = useState<HistoryState>(() =>
    mode === 'resume' && savedGame ? restoreGameHistory(savedGame) : createHistoryState(createPyramidGame(Math.random)),
  );
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<PyramidSource | null>(null);
  const [snapshotPickerOpen, setSnapshotPickerOpen] = useState(false);
  const feedback = useMoveFeedback('pyramid', history.present,
    (attempt) => suggestPyramidMove(history.present, selectedSource, attempt));
  // Choose the stock placement that permits the largest cards inside the actual board space.
  let cardWidth = 74;
  let sideStock = false;
  for (; cardWidth > 1; cardWidth -= 1) {
    const cardHeight = Math.round(cardWidth * 1.42);
    const tableWidth = cardWidth * 7 + Math.max(4, Math.round(cardWidth * 0.08)) * 6;
    const tableHeight = cardHeight * 7 - Math.round(cardWidth * 0.22) * 6;
    const columnFits = tableWidth <= boardSpace.width
      && tableHeight + spacing.lg + Math.max(cardHeight, 50) <= boardSpace.height;
    const sideFits = tableWidth + 120 + spacing.lg <= boardSpace.width
      && Math.max(tableHeight, cardHeight * 2 + spacing.sm * 2 + 50) <= boardSpace.height;
    if (columnFits || sideFits) {
      sideStock = !columnFits;
      break;
    }
  }
  const pyramidRowGap = Math.max(4, Math.round(cardWidth * 0.08));
  const stockCount = history.present.stock.length;
  const canRecycle = stockCount === 0
    && history.present.waste.length > 0
    && history.present.recyclesUsed < history.present.maxRecycles;

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (history.present.won) {
      void clearGame('pyramid');
      return;
    }

    const envelope = persistGameHistory('pyramid', history);

    void saveGame('pyramid', envelope);
  }, [clearGame, history, hydrated, saveGame]);

  const cardDrag = useCardDrag<PyramidSource, PyramidSource>({
    getCards(source) {
      const card = getPyramidSourceCard(history.present, source);
      return card && card.rank !== 13 && isPyramidSourceSelectable(history.present, source) ? [card] : [];
    },
    getDestinations(source) {
      const candidates: PyramidSource[] = [{ zone: 'waste' }];
      history.present.tableau.forEach((row, rowIndex) => {
        row.forEach((_, cardIndex) => candidates.push({ zone: 'tableau', rowIndex, cardIndex }));
      });
      return candidates.filter((destination) => !isSameSource(source, destination)
        && removePyramidCards(history.present, [source, destination]) !== history.present);
    },
    onStart: () => { feedback.clear(); setSelectedSource(null); },
    onCancel: feedback.clear,
    onDrop(source, destination) {
      const next = removePyramidCards(history.present, [source, destination]);
      if (next !== history.present) commit(next);
    },
    onReject(source, destination) {
      if (destination && isSameSource(source, destination)) return;
      rejectRemoval(source, destination, 'drag');
    },
  });

  function clearInteraction() {
    feedback.clear();
    cardDrag.cancel();
    setGameMenuOpen(false);
    setSelectedSource(null);
    setSnapshotPickerOpen(false);
  }

  function commit(next: PyramidState) {
    setHistory((current) => ({
      initial: current.initial,
      past: [...current.past.slice(-49), current.present],
      present: next,
      future: [],
    }));
    clearInteraction();
  }

  function startNewGame() {
    setHistory(createHistoryState(createPyramidGame(Math.random)));
    clearInteraction();
  }

  function restartGame() {
    setHistory((current) => createHistoryState(current.initial));
    clearInteraction();
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
    const envelope = persistGameHistory('pyramid', history);
    void saveSnapshot('pyramid', envelope);
  }

  function loadSnapshot(snapshot: PersistedGameEnvelope<PyramidState>) {
    setHistory(restoreGameHistory(snapshot));
    clearInteraction();
  }

  function handleDrawOrRecycle() {
    if (history.present.won) {
      feedback.reject('game-finished', 'This pyramid is complete. Undo a move or start a new game.', { kind: 'draw' });
      return;
    }
    if (history.present.stock.length > 0) {
      const next = drawPyramidStock(history.present);

      if (next !== history.present) {
        commit(next);
      }

      return;
    }

    if (!canRecycle) {
      feedback.reject(history.present.waste.length ? 'recycle-limit' : 'stock-empty',
        history.present.waste.length
          ? `No stock passes remain. This game allows ${history.present.maxRecycles} waste recycles.`
          : 'The stock and waste are empty. Pair cards remaining in the pyramid.',
        { kind: 'recycle' });
      return;
    }

    const next = recyclePyramidWaste(history.present);

    if (next !== history.present) {
      commit(next);
    }
  }

  function handleSourcePress(source: PyramidSource) {
    if (source.zone === 'tableau' && !history.present.tableau[source.rowIndex]?.[source.cardIndex]) return;
    if (history.present.won) {
      rejectRemoval(source, null);
      return;
    }
    if (!isPyramidSourceSelectable(history.present, source)) {
      rejectRemoval(source, null);
      return;
    }

    if (isSameSource(selectedSource, source)) {
      if (!feedback.repeatPress(source)) feedback.clear();
      setSelectedSource(null);
      return;
    }

    const sourceCard = getPyramidSourceCard(history.present, source);

    if (!sourceCard) {
      return;
    }

    if (sourceCard.rank === 13) {
      const next = removePyramidCards(history.present, [source]);

      if (next !== history.present) {
        commit(next);
      }

      return;
    }

    if (!selectedSource) {
      feedback.clear();
      setSelectedSource(source);
      return;
    }

    const next = removePyramidCards(history.present, [selectedSource, source]);

    if (next !== history.present) {
      commit(next);
      return;
    }

    rejectRemoval(selectedSource, source);
    setSelectedSource(source);
  }

  function rejectRemoval(source: PyramidSource, destination: PyramidSource | null, interaction: 'press' | 'drag' = 'press') {
    const attempt = { kind: 'remove' as const, source, destination };
    const sourceCard = source.zone === 'waste' ? history.present.waste.at(-1)
      : history.present.tableau[source.rowIndex]?.[source.cardIndex];
    const destinationCard = destination?.zone === 'waste' ? history.present.waste.at(-1)
      : destination?.zone === 'tableau' ? history.present.tableau[destination.rowIndex]?.[destination.cardIndex] : null;
    if (history.present.won) {
      feedback.reject('game-finished', 'This pyramid is complete. Undo a move or start a new game.', attempt, interaction);
    } else if (!isPyramidSourceSelectable(history.present, source)
      || (destinationCard && destination && !isPyramidSourceSelectable(history.present, destination))) {
      feedback.reject('card-covered', 'Remove the cards covering this card first. A parent may pair with its one remaining exposed child only when they total 13.', attempt, interaction);
    } else if (sourceCard?.rank === 13 || destinationCard?.rank === 13) {
      feedback.reject('king-alone', 'Remove a King on its own by tapping it. Kings cannot form a pair.', attempt, interaction);
    } else if (!destinationCard) {
      feedback.reject('pair-required', 'Choose another available card so the pair totals 13. Only a King can be removed alone.', attempt, interaction);
    } else if (sourceCard && sourceCard.rank + destinationCard.rank !== 13) {
      feedback.reject('pair-total', `These cards total ${sourceCard.rank + destinationCard.rank}. A pair must total 13; only a King is removed alone.`, attempt, interaction);
    } else {
      feedback.reject('card-covered', 'Remove the cards covering this pair first. A covered parent can only pair with its one remaining exposed child.', attempt, interaction);
    }
  }

  const dragFrame = cardDrag.drag ? boardSpace.fitDrag(cardDrag.drag.x, cardDrag.drag.y, cardWidth) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <GameScreenLayout currentGame="pyramid" onNew={startNewGame}>
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
            <ActionButton
              label={stockCount > 0 ? 'Draw' : 'Recycle'}
              onPress={handleDrawOrRecycle}
              disabled={stockCount === 0 && !canRecycle}
            />
            {settings.pyramidDebugTools ? (
              <ActionButton label="Save" onPress={saveCurrentState} />
            ) : null}
            {settings.pyramidDebugTools ? (
              <ActionButton
                label="Load"
                onPress={() => setSnapshotPickerOpen((current) => !current)}
                disabled={snapshots.pyramid.length === 0}
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
            <ActionButton label="Rules" onPress={() => router.push('/rules?game=pyramid')} />
            <Pressable
              accessibilityLabel="Open settings"
              accessibilityRole="button"
              onPress={() => router.push('/settings?game=pyramid')}
              style={({ pressed }) => [
                styles.actionButton,
                styles.actionIconButton,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Ionicons color={palette.ink} name="settings-outline" size={18} />
            </Pressable>
          </View>

          {settings.pyramidDebugTools && snapshotPickerOpen ? (
            <View style={styles.snapshotPanel}>
              {snapshots.pyramid.map((snapshot) => (
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
                    onPress={() => void deleteSnapshot('pyramid', snapshot.id)}
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

          {history.present.won ? <Text style={styles.winText}>Game won. Start another round.</Text> : null}

          <View ref={boardSpace.ref} onLayout={boardSpace.onLayout} style={styles.boardSpace}>
            <View testID="game-board" style={[styles.board, sideStock && styles.boardLandscape]}>
              <View style={[styles.topRow, sideStock && styles.topRowLandscape]}>
                <View>
                  <CardStack
                    accessibilityLabel="Stock: draw or recycle"
                    cardWidth={cardWidth}
                    cards={history.present.stock.slice(-1)}
                    emptyState={stockCount === 0 && canRecycle ? 'recycle' : 'default'}
                    onCardPress={handleDrawOrRecycle}
                    placeholderLabel={stockCount > 0 ? String(stockCount) : '↺'}
                    variant="back"
                  />
                  <MoveHintOverlay feedback={feedback} target="stock" />
                </View>
                <View
                  testID="pyramid-waste"
                  style={cardDrag.drag?.activeDestination?.zone === 'waste' ? styles.dragTarget : undefined}
                  ref={cardDrag.registerTarget('waste', { zone: 'waste' })}
                  onLayout={cardDrag.measureTargets}
                >
                  <CardStack
                    cardWidth={cardWidth}
                    cards={history.present.waste.slice(-1)}
                    hiddenFromIndex={cardDrag.drag?.source.zone === 'waste' ? 0 : undefined}
                    onCardDragStart={(_, payload) => cardDrag.start({ zone: 'waste' }, payload)}
                    onCardDragMove={(_, payload) => cardDrag.move(payload)}
                    onCardDragEnd={(_, payload) => cardDrag.end(payload)}
                    onCardDragCancel={cardDrag.cancel}
                    onCardPress={
                      history.present.waste.length > 0
                        ? () => handleSourcePress({ zone: 'waste' })
                        : undefined
                    }
                    placeholderLabel=""
                    selected={selectedSource?.zone === 'waste'}
                  />
                  <MoveHintOverlay feedback={feedback} target="waste" />
                </View>
                <View style={styles.metaPanel}>
                  <Text style={styles.metaText}>Removed: {history.present.removedCount}</Text>
                  <Text style={styles.metaText}>
                    Passes left: {Math.max(0, history.present.maxRecycles - history.present.recyclesUsed)}
                  </Text>
                </View>
              </View>

              <View style={styles.pyramidTable}>
                {history.present.tableau.map((row, rowIndex) => (
                  <View
                    key={`pyramid-row-${rowIndex}`}
                    style={[
                      styles.pyramidRow,
                      { gap: pyramidRowGap },
                      rowIndex > 0 && { marginTop: -Math.round(cardWidth * 0.22) },
                    ]}
                  >
                    {row.map((card, cardIndex) => {
                      const source: PyramidSource = { zone: 'tableau', rowIndex, cardIndex };
                      return (
                        <View
                          key={`pyramid-cell-${rowIndex}-${cardIndex}`}
                          testID={`pyramid-cell-${rowIndex}-${cardIndex}`}
                          ref={cardDrag.registerTarget(`tableau-${rowIndex}-${cardIndex}`, source)}
                          onLayout={cardDrag.measureTargets}
                          style={[
                            styles.pyramidCell,
                            isSameSource(cardDrag.drag?.activeDestination ?? null, source) && styles.dragTarget,
                          ]}
                        >
                          {card ? (
                            <CardStack
                              cardWidth={cardWidth}
                              cards={[card]}
                              hiddenFromIndex={isSameSource(cardDrag.drag?.source ?? null, source) ? 0 : undefined}
                              onCardDragStart={(_, payload) => cardDrag.start(source, payload)}
                              onCardDragMove={(_, payload) => cardDrag.move(payload)}
                              onCardDragEnd={(_, payload) => cardDrag.end(payload)}
                              onCardDragCancel={cardDrag.cancel}
                              onCardPress={() => handleSourcePress(source)}
                              placeholderLabel=""
                              selected={isSameSource(selectedSource, source)}
                            />
                          ) : (
                            <View
                              style={[
                                styles.emptyCell,
                                {
                                  height: Math.round(cardWidth * 1.42),
                                  width: cardWidth,
                                },
                              ]}
                            />
                          )}
                          <MoveHintOverlay feedback={feedback} target={`tableau-${rowIndex}-${cardIndex}`} />
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
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

function suggestPyramidMove(state: PyramidState, selected: PyramidSource | null, attempt: FailedMoveAttempt): MoveSuggestion | null {
  if (state.won) return null;
  const sources: PyramidSource[] = [{ zone: 'waste' }];
  state.tableau.forEach((row, rowIndex) => row.forEach((card, cardIndex) => {
    if (card) sources.push({ zone: 'tableau', rowIndex, cardIndex });
  }));
  const attempted = sources.find((source) => {
    const candidate = attempt.source;
    if (!candidate || !('zone' in candidate) || candidate.zone !== source.zone) return false;
    return source.zone === 'waste' || ('rowIndex' in candidate && 'cardIndex' in candidate
      && candidate.rowIndex === source.rowIndex && candidate.cardIndex === source.cardIndex);
  });
  const preferred = [selected, attempted].filter((source): source is PyramidSource => Boolean(source));
  const candidates = [...preferred, ...sources];
  const target = (source: PyramidSource) => source.zone === 'waste' ? 'waste' : `tableau-${source.rowIndex}-${source.cardIndex}`;
  for (const source of candidates) {
    const card = getPyramidSourceCard(state, source);
    if (!card) continue;
    if (removePyramidCards(state, [source]) !== state) {
      return { label: 'Remove the highlighted King on its own.', targets: [target(source)] };
    }
    for (const partner of sources) {
      if (isSameSource(source, partner) || removePyramidCards(state, [source, partner]) === state) continue;
      const partnerCard = getPyramidSourceCard(state, partner);
      if (!partnerCard) continue;
      return {
        label: `Remove the highlighted ${rankLabel(card.rank)} and ${rankLabel(partnerCard.rank)} together; they total 13.`,
        targets: [target(source), target(partner)],
      };
    }
  }
  if (drawPyramidStock(state) !== state) return { label: 'Draw a card from the stock.', targets: ['stock'] };
  if (recyclePyramidWaste(state) !== state) return { label: 'Recycle the waste to start another stock pass.', targets: ['stock'] };
  return null;
}

function isSameSource(left: PyramidSource | null, right: PyramidSource): boolean {
  if (!left || left.zone !== right.zone) {
    return false;
  }

  if (left.zone === 'waste' || right.zone === 'waste') {
    return true;
  }

  return left.rowIndex === right.rowIndex && left.cardIndex === right.cardIndex;
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
    paddingHorizontal: spacing.md,
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
  boardSpace: {
    alignItems: 'center',
    width: '100%',
  },
  board: {
    gap: spacing.lg,
  },
  boardLandscape: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  topRowLandscape: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    minWidth: 120,
  },
  metaPanel: {
    gap: spacing.xs,
    marginLeft: spacing.xs,
  },
  metaText: {
    color: '#ebdfca',
    fontSize: typography.body,
    fontWeight: '600',
  },
  pyramidTable: {
    alignItems: 'center',
    gap: 0,
  },
  pyramidRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dragTarget: {
    borderRadius: radius.md,
    boxShadow: '0px 0px 0px 3px #d7b56d',
  },
  pyramidCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCell: {
    backgroundColor: 'transparent',
  },
  winText: {
    color: '#f3e1b5',
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
});
