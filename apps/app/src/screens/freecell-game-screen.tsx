import { isSafeFoundationMove } from '@mumscards/engine-core';
import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import { Ionicons } from '@expo/vector-icons';
import {
  applyFreeCellMove,
  createFreeCellGame,
  type FreeCellDestination,
  type FreeCellSource,
  type FreeCellState,
} from '@mumscards/game-freecell';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppModel } from '../state/app-provider';
import { palette, radius, spacing, typography } from '../theme';
import { createGameHistory as createHistoryState, persistGameHistory, restoreGameHistory, type GameHistory } from './shared/game-history';
import { useGameBoardSpace } from './shared/use-game-board-space';
import { GameScreenLayout } from './shared/game-screen-layout';
import { availableGames } from './shared/available-games';
import { CardStack } from './shared/card-stack';
import { ShortcutPressable } from './shared/shortcut-pressable';
import { useWebGameShortcuts } from './shared/use-web-game-shortcuts';
import { useCardDrag } from './shared/use-card-drag';
import { MoveFeedback, MoveHintOverlay, useMoveFeedback } from './shared/use-move-feedback';
import { getFreeCellRejection } from './shared/move-rejection-reasons';

type HistoryState = GameHistory<FreeCellState>;

type Props = {
  mode: 'new' | 'resume';
};

export function FreeCellGameScreen({ mode }: Props) {
  const router = useRouter();
  const boardSpace = useGameBoardSpace();
  const {
    hydrated,
    saves,
    saveGame,
    clearGame,
    settings,
    snapshots,
    saveSnapshot,
    deleteSnapshot,
  } = useAppModel();
  const savedGame = saves.freecell;
  const [history, setHistory] = useState<HistoryState>(() =>
    mode === 'resume' && savedGame ? restoreGameHistory(savedGame)
      : createHistoryState(createFreeCellGame(Math.random, { tableauBuildPolicy: settings.freeCellTableauBuildPolicy })),
  );
  const tableauBuildPolicy = history.present.tableauBuildPolicy ?? 'alternate-red-black';
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<FreeCellSource | null>(null);
  const feedback = useMoveFeedback('freecell', history.present, (attempt) => {
    const hints = getFreeCellHints(history.present, tableauBuildPolicy);
    const source = attempt.source ?? selectedSource;
    const legalMoves = getFreeCellHints(history.present, tableauBuildPolicy, true);
    const sameSource = (item: (typeof hints)[number]) => JSON.stringify(item.source) === JSON.stringify(source);
    const hint = hints.find(sameSource) ?? legalMoves.find(sameSource) ?? hints[0] ?? legalMoves[0];
    if (!hint) return null;
    return {
      label: hint.label,
      targets: [freeCellHintTarget(hint.source), freeCellHintTarget(hint.destination)],
    };
  });
  const [expandedTableauPile, setExpandedTableauPile] = useState<number | null>(null);
  const [snapshotPickerOpen, setSnapshotPickerOpen] = useState(false);
  const [offloadActive, setOffloadActive] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintCycleIndex, setHintCycleIndex] = useState(0);
  const fanSpace = Math.min(
    Math.max(0, ...history.present.tableau.map((pile) => pile.length - 1)) * 14,
    Math.max(0, (boardSpace.height - spacing.lg) / 2),
  );
  const cardWidth = Math.max(1, Math.floor(Math.min(72,
    (boardSpace.width - spacing.sm * 7) / 8,
    (boardSpace.height - spacing.lg - fanSpace) / (1.42 * 2),
  )));
  const cardHeight = Math.round(cardWidth * 1.42);
  const tableauMaxHeight = Math.max(cardHeight, boardSpace.height - Math.max(44, cardHeight) - spacing.lg);
  const cardDrag = useCardDrag<FreeCellSource, FreeCellDestination>({
    getCards: (source) => {
      if (source.zone === 'tableau') return history.present.tableau[source.pileIndex].slice(source.cardIndex);
      const card = history.present.freeCells[source.cellIndex];
      return card ? [card] : [];
    },
    getDestinations: (source) => getFreeCellDestinations(history.present, source, tableauBuildPolicy),
    onDrop: (source, destination) => {
      const next = applyFreeCellMove(history.present, source, destination, { tableauBuildPolicy });
      if (JSON.stringify(next) !== JSON.stringify(history.present)) commit(next);
    },
    onReject: (source, destination) => {
      if (destination && ((source.zone === 'tableau' && destination.zone === 'tableau' && source.pileIndex === destination.pileIndex)
        || (source.zone === 'cell' && destination.zone === 'cell' && source.cellIndex === destination.cellIndex))) return;
      const reason = getFreeCellRejection(history.present, source, destination);
      if (destination || reason?.code !== 'source-blocked') {
        if (reason) feedback.reject(reason.code, reason.message, { kind: 'move', source, destination }, 'drag');
      } else {
        feedback.reject('drop-target', 'Drop the card on a tableau column, free cell or foundation.', { kind: 'move', source, destination: null }, 'drag');
      }
    },
    onStart: (source) => {
      feedback.clear();
      setOffloadActive(false);
      setSelectedSource(source);
      setExpandedTableauPile(null);
      setHintText(null);
      setHintCycleIndex(0);
    },
    onCancel: () => setSelectedSource(null),
  });

  function dropStyle(destination: FreeCellDestination) {
    const legal = cardDrag.drag?.destinations.some((item) => JSON.stringify(item) === JSON.stringify(destination));
    const active = cardDrag.drag?.activeDestination && JSON.stringify(cardDrag.drag.activeDestination) === JSON.stringify(destination);
    return [styles.dropTarget, legal && styles.dropTargetLegal, active && styles.dropTargetActive];
  }

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (history.present.won) {
      void clearGame('freecell');
      return;
    }

    const envelope = persistGameHistory('freecell', history);

    void saveGame('freecell', envelope);
  }, [clearGame, history, hydrated, saveGame]);

  useEffect(() => {
    if (!offloadActive) {
      return;
    }

    const move = getNextFreeCellFoundationMove(history.present);

    if (!move) {
      setOffloadActive(false);
      return;
    }

    const timer = setTimeout(() => {
      setSelectedSource(null);
      setHistory((current) => {
        const nextMove = getNextFreeCellFoundationMove(current.present);

        if (!nextMove) {
          return current;
        }

        const nextWithRules = applyFreeCellMove(
          current.present,
          nextMove.source,
          nextMove.destination,
          { tableauBuildPolicy },
        );

        if (JSON.stringify(nextWithRules) === JSON.stringify(current.present)) {
          return current;
        }

        return {
          initial: current.initial,
          past: [...current.past.slice(-49), current.present],
          present: nextWithRules,
          future: [],
        };
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [history.present, offloadActive, tableauBuildPolicy]);

  function clearInteraction() {
    feedback.clear();
    cardDrag.cancel();
    setOffloadActive(false);
    setGameMenuOpen(false);
    setSelectedSource(null);
    setExpandedTableauPile(null);
    setSnapshotPickerOpen(false);
    setHintText(null);
    setHintCycleIndex(0);
  }

  function commit(next: FreeCellState) {
    setHistory((current) => ({
      initial: current.initial,
      past: [...current.past.slice(-49), current.present],
      present: next,
      future: [],
    }));
    clearInteraction();
  }

  function startNewGame() {
    setHistory(createHistoryState(createFreeCellGame(Math.random, { tableauBuildPolicy: settings.freeCellTableauBuildPolicy })));
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
    onOffload: toggleOffload,
  });

  function saveCurrentState() {
    const envelope = persistGameHistory('freecell', history);
    void saveSnapshot('freecell', envelope);
  }

  function loadSnapshot(snapshot: PersistedGameEnvelope<FreeCellState>) {
    setHistory(restoreGameHistory(snapshot));
    clearInteraction();
  }

  function handleSourcePress(source: FreeCellSource) {
    if (selectedSource && JSON.stringify(selectedSource) === JSON.stringify(source)) {
      feedback.clear();
      setSelectedSource(null);
      return;
    }

    if (!canMoveFreeCellSource(history.present, source, tableauBuildPolicy)) {
      if (!selectedSource) {
        const reason = getFreeCellRejection(history.present, source, null);
        if (reason) feedback.reject(reason.code, reason.message, { kind: 'select', source });
      }
      return;
    }

    feedback.clear();
    setSelectedSource(source);
  }

  function handleDestinationPress(destination: FreeCellDestination, reportFailure = true): boolean {
    if (!selectedSource) {
      return false;
    }

    if (
      (selectedSource.zone === 'tableau' &&
        destination.zone === 'tableau' &&
        selectedSource.pileIndex === destination.pileIndex) ||
      (selectedSource.zone === 'cell' &&
        destination.zone === 'cell' &&
        selectedSource.cellIndex === destination.cellIndex)
    ) {
      feedback.clear();
      setSelectedSource(null);
      return false;
    }

    const next = applyFreeCellMove(history.present, selectedSource, destination, {
      tableauBuildPolicy,
    });

    if (JSON.stringify(next) === JSON.stringify(history.present)) {
      if (reportFailure) {
        const reason = getFreeCellRejection(history.present, selectedSource, destination);
        if (reason) feedback.reject(reason.code, reason.message, { kind: 'move', source: selectedSource, destination });
      }
      return false;
    }

    commit(next);
    return true;
  }

  function toggleOffload() {
    if (offloadActive) {
      setOffloadActive(false);
      return;
    }

    if (!getNextFreeCellFoundationMove(history.present)) {
      return;
    }

    setSelectedSource(null);
    setOffloadActive(true);
  }

  function showHint() {
    feedback.clear();
    const hints = getFreeCellHints(history.present, tableauBuildPolicy);

    if (hints.length === 0) {
      setHintText('No legal move found.');
      setHintCycleIndex(0);
      return;
    }

    const nextIndex = hintCycleIndex % hints.length;
    setHintText(hints[nextIndex].label);
    setHintCycleIndex((current) => (current + 1) % hints.length);
  }

  const dragFrame = cardDrag.drag ? boardSpace.fitDrag(cardDrag.drag.x, cardDrag.drag.y, cardWidth) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <GameScreenLayout currentGame="freecell" onNew={startNewGame}>
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
              {availableGames.map((game) => game.id === 'freecell' ? (
                <View key={game.id} style={[styles.actionButton, styles.actionButtonActive]}>
                  <Text style={styles.actionButtonTextActive}>{game.name}</Text>
                </View>
              ) : (
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

        <ScrollView scrollEnabled={!cardDrag.drag} onScroll={cardDrag.measureTargets} contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerActions}>
            <ActionButton label="New" onPress={startNewGame} shortcut="Cmd/Ctrl+Alt+N" />
            <ActionButton label="Restart" onPress={restartGame} shortcut="Cmd+R" />
            {settings.freeCellDebugTools ? (
              <ActionButton label="Save" onPress={saveCurrentState} />
            ) : null}
            {settings.freeCellDebugTools ? (
              <ActionButton
                label="Load"
                onPress={() => setSnapshotPickerOpen((current) => !current)}
                disabled={snapshots.freecell.length === 0}
              />
            ) : null}
            <ActionButton
              label={offloadActive ? 'Stop' : 'Offload'}
              onPress={toggleOffload}
              disabled={!offloadActive && !getNextFreeCellFoundationMove(history.present)}
              shortcut="Cmd+A"
            />
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
            <ActionButton label="Hint" onPress={showHint} />
            <ActionButton label="Rules" onPress={() => router.push('/rules?game=freecell')} />
            <Pressable
              accessibilityLabel="Open settings"
              accessibilityRole="button"
              onPress={() => router.push('/settings?game=freecell')}
              style={({ pressed }) => [
                styles.actionButton,
                styles.actionIconButton,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Ionicons color={palette.ink} name="settings-outline" size={18} />
            </Pressable>
          </View>

          {hintText ? <Text style={styles.hintText}>{hintText}</Text> : null}

          {settings.freeCellDebugTools && snapshotPickerOpen ? (
            <View style={styles.snapshotPanel}>
              {snapshots.freecell.map((snapshot) => (
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
                    onPress={() => void deleteSnapshot('freecell', snapshot.id)}
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

          <View ref={boardSpace.ref} onLayout={boardSpace.onLayout}>
            <View testID="game-board" style={[styles.board, { width: boardSpace.width }]}>
              <View style={styles.topRow}>
                {history.present.freeCells.map((card, cellIndex) => (
                  <View
                    key={`cell-${cellIndex}`}
                    ref={cardDrag.registerTarget(`cell-${cellIndex}`, { zone: 'cell', cellIndex })}
                    onLayout={cardDrag.measureTargets}
                    style={dropStyle({ zone: 'cell', cellIndex })}
                  >
                    <MoveHintOverlay feedback={feedback} target={`cell-${cellIndex}`} />
                    <CardStack
                      cardWidth={cardWidth}
                      cards={card ? [{ ...card, faceUp: true }] : []}
                      hiddenFromIndex={cardDrag.drag?.source.zone === 'cell' && cardDrag.drag.source.cellIndex === cellIndex ? 0 : undefined}
                      onCardDragStart={(_, payload) => cardDrag.start({ zone: 'cell', cellIndex }, payload)}
                      onCardDragMove={(_, payload) => cardDrag.move(payload)}
                      onCardDragEnd={(_, payload) => cardDrag.end(payload)}
                      onCardDragCancel={cardDrag.cancel}
                      onCardPress={
                        card || selectedSource
                          ? () => {
                              if (selectedSource && handleDestinationPress({ zone: 'cell', cellIndex }, !card)) return;
                              if (card) handleSourcePress({ zone: 'cell', cellIndex });
                            }
                          : undefined
                      }
                      placeholderLabel="Free"
                      selected={
                        selectedSource?.zone === 'cell' && selectedSource.cellIndex === cellIndex
                      }
                    />
                  </View>
                ))}
                {history.present.foundations.map((pile, pileIndex) => (
                  <View
                    key={`foundation-${pileIndex}`}
                    ref={cardDrag.registerTarget(`foundation-${pileIndex}`, { zone: 'foundation', pileIndex })}
                    onLayout={cardDrag.measureTargets}
                    style={dropStyle({ zone: 'foundation', pileIndex })}
                  >
                    <MoveHintOverlay feedback={feedback} target={`foundation-${pileIndex}`} />
                    <CardStack
                      cardWidth={cardWidth}
                      cards={pile.slice(-1).map((card) => ({ ...card, faceUp: true }))}
                      onCardPress={
                        selectedSource
                          ? () => handleDestinationPress({ zone: 'foundation', pileIndex })
                          : undefined
                      }
                      placeholderLabel="A"
                    />
                  </View>
                ))}
              </View>

              <View style={styles.tableauRow}>
                {history.present.tableau.map((pile, pileIndex) => (
                  <View
                    key={`tableau-${pileIndex}`}
                    testID={`game-tableau-${pileIndex}`}
                    ref={cardDrag.registerTarget(`tableau-${pileIndex}`, { zone: 'tableau', pileIndex })}
                    onLayout={cardDrag.measureTargets}
                    style={dropStyle({ zone: 'tableau', pileIndex })}
                  >
                    <MoveHintOverlay feedback={feedback} target={`tableau-${pileIndex}`} />
                    <CardStack
                      cardWidth={cardWidth}
                      maxHeight={tableauMaxHeight}
                      cards={pile.map((card) => ({ ...card, faceUp: true }))}
                      expanded={expandedTableauPile === pileIndex}
                      hiddenFromIndex={cardDrag.drag?.source.zone === 'tableau' && cardDrag.drag.source.pileIndex === pileIndex ? cardDrag.drag.source.cardIndex : undefined}
                      onCardDragStart={(cardIndex, payload) => cardDrag.start({ zone: 'tableau', pileIndex, cardIndex }, payload)}
                      onCardDragMove={(_, payload) => cardDrag.move(payload)}
                      onCardDragEnd={(_, payload) => cardDrag.end(payload)}
                      onCardDragCancel={cardDrag.cancel}
                      onCardPress={
                        selectedSource
                          ? () => handleDestinationPress({ zone: 'tableau', pileIndex })
                          : undefined
                      }
                      onFaceUpCardPress={(cardIndex) => {
                        if (selectedSource && selectedSource.zone === 'tableau' && selectedSource.pileIndex === pileIndex) {
                          handleSourcePress({ zone: 'tableau', pileIndex, cardIndex });
                          return;
                        }
                        if (selectedSource && handleDestinationPress({ zone: 'tableau', pileIndex }, false)) return;

                        handleSourcePress({ zone: 'tableau', pileIndex, cardIndex });
                      }}
                      onCardHoldEnd={() => {
                        setExpandedTableauPile((current) => (current === pileIndex ? null : current));
                      }}
                      onCardHoldStart={() => {
                        setExpandedTableauPile(pileIndex);
                      }}
                      placeholderLabel=""
                      selected={
                        selectedSource?.zone === 'tableau' && selectedSource.pileIndex === pileIndex
                      }
                    />
                  </View>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
        <MoveFeedback feedback={feedback} />
        {cardDrag.drag && dragFrame ? (
          <View testID="drag-preview" pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={[styles.dragGhost, {
              left: dragFrame.left - cardDrag.rootOffset.x,
              top: dragFrame.top - cardDrag.rootOffset.y,
            }]}>
              <CardStack cardWidth={cardWidth} maxHeight={dragFrame.maxHeight} cards={cardDrag.drag.cards} placeholderLabel="" selected />
            </View>
          </View>
        ) : null}
      </View>
      </GameScreenLayout>
    </SafeAreaView>
  );
}

function getNextFreeCellFoundationMove(
  state: FreeCellState,
): { source: FreeCellSource; destination: FreeCellDestination } | null {
  for (let cellIndex = 0; cellIndex < state.freeCells.length; cellIndex += 1) {
    const card = state.freeCells[cellIndex];

    if (!card || !isSafeFoundationMove(card, state.foundations, state.tableauBuildPolicy ?? 'alternate-red-black')) {
      continue;
    }

    const destination = getFoundationDestinationForCard(state, card);

    if (destination !== null) {
      return {
        source: { zone: 'cell', cellIndex },
        destination: { zone: 'foundation', pileIndex: destination },
      };
    }
  }

  for (let pileIndex = 0; pileIndex < state.tableau.length; pileIndex += 1) {
    const pile = state.tableau[pileIndex];
    const card = pile[pile.length - 1];

    if (!card || !isSafeFoundationMove(card, state.foundations, state.tableauBuildPolicy ?? 'alternate-red-black')) {
      continue;
    }

    const destination = getFoundationDestinationForCard(state, card);

    if (destination !== null) {
      return {
        source: { zone: 'tableau', pileIndex, cardIndex: pile.length - 1 },
        destination: { zone: 'foundation', pileIndex: destination },
      };
    }
  }

  return null;
}

function freeCellHintTarget(location: FreeCellSource | FreeCellDestination): string {
  return location.zone === 'cell' ? `cell-${location.cellIndex}` : `${location.zone}-${location.pileIndex}`;
}

function canMoveFreeCellSource(
  state: FreeCellState,
  source: FreeCellSource,
  policy: 'any' | 'red-black' | 'alternate-red-black' | 'suit-matching',
): boolean {
  return getFreeCellDestinations(state, source, policy).length > 0;
}

function getFreeCellDestinations(
  state: FreeCellState,
  source: FreeCellSource,
  policy: 'any' | 'red-black' | 'alternate-red-black' | 'suit-matching',
): FreeCellDestination[] {
  const destinations: FreeCellDestination[] = [
    ...state.tableau.map((_, pileIndex) => ({ zone: 'tableau' as const, pileIndex })),
    ...state.freeCells.map((_, cellIndex) => ({ zone: 'cell' as const, cellIndex })),
    ...state.foundations.map((_, pileIndex) => ({ zone: 'foundation' as const, pileIndex })),
  ];
  return destinations.filter((destination) => {
    if (source.zone === 'tableau' && destination.zone === 'tableau' && source.pileIndex === destination.pileIndex) return false;
    if (source.zone === 'cell' && destination.zone === 'cell' && source.cellIndex === destination.cellIndex) return false;
    return JSON.stringify(applyFreeCellMove(state, source, destination, { tableauBuildPolicy: policy })) !== JSON.stringify(state);
  });
}

function getFreeCellHints(
  state: FreeCellState,
  policy: 'any' | 'red-black' | 'alternate-red-black' | 'suit-matching',
  includeRelocations = false,
): Array<{ label: string; source: FreeCellSource; destination: FreeCellDestination }> {
  const hints: Array<{ label: string; source: FreeCellSource; destination: FreeCellDestination }> = [];
  const seen = new Set<string>();

  for (let pileIndex = 0; pileIndex < state.tableau.length; pileIndex += 1) {
    const pile = state.tableau[pileIndex];

    for (let cardIndex = 0; cardIndex < pile.length; cardIndex += 1) {
      const source: FreeCellSource = { zone: 'tableau', pileIndex, cardIndex };
      collectHintsForSource(state, source, policy, hints, seen, includeRelocations);
    }
  }

  for (let cellIndex = 0; cellIndex < state.freeCells.length; cellIndex += 1) {
    if (!state.freeCells[cellIndex]) {
      continue;
    }

    const source: FreeCellSource = { zone: 'cell', cellIndex };
    collectHintsForSource(state, source, policy, hints, seen, includeRelocations);
  }

  return hints.sort((left, right) => {
    const priorityDiff = getHintPriority(left) - getHintPriority(right);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return left.label.localeCompare(right.label);
  });
}

function getHintPriority(hint: {
  source: FreeCellSource;
  destination: FreeCellDestination;
}): number {
  if (hint.destination.zone === 'foundation') return 0;
  if (hint.source.zone === 'cell' && hint.destination.zone === 'tableau') return 1;
  if (hint.source.zone === 'tableau' && hint.destination.zone === 'tableau') return 2;
  if (hint.destination.zone === 'cell') return 3;

  return 5;
}

function collectHintsForSource(
  state: FreeCellState,
  source: FreeCellSource,
  policy: 'any' | 'red-black' | 'alternate-red-black' | 'suit-matching',
  hints: Array<{ label: string; source: FreeCellSource; destination: FreeCellDestination }>,
  seen: Set<string>,
  includeRelocations: boolean,
) {
  for (let pileIndex = 0; pileIndex < state.tableau.length; pileIndex += 1) {
    const destination: FreeCellDestination = { zone: 'tableau', pileIndex };
    maybeAddHint(state, source, destination, policy, hints, seen, includeRelocations);
  }

  for (let cellIndex = 0; cellIndex < state.freeCells.length; cellIndex += 1) {
    const destination: FreeCellDestination = { zone: 'cell', cellIndex };
    maybeAddHint(state, source, destination, policy, hints, seen, includeRelocations);
  }

  for (let pileIndex = 0; pileIndex < state.foundations.length; pileIndex += 1) {
    const destination: FreeCellDestination = { zone: 'foundation', pileIndex };
    maybeAddHint(state, source, destination, policy, hints, seen, includeRelocations);
  }
}

function maybeAddHint(
  state: FreeCellState,
  source: FreeCellSource,
  destination: FreeCellDestination,
  policy: 'any' | 'red-black' | 'alternate-red-black' | 'suit-matching',
  hints: Array<{ label: string; source: FreeCellSource; destination: FreeCellDestination }>,
  seen: Set<string>,
  includeRelocations: boolean,
) {
  if (
    (source.zone === 'tableau' &&
      destination.zone === 'tableau' &&
      source.pileIndex === destination.pileIndex) ||
    (source.zone === 'cell' && destination.zone === 'cell' && source.cellIndex === destination.cellIndex)
  ) {
    return;
  }

  if (!includeRelocations && source.zone === 'tableau' && source.cardIndex === 0 &&
      destination.zone === 'tableau' && state.tableau[destination.pileIndex].length === 0) {
    return;
  }

  const next = applyFreeCellMove(state, source, destination, { tableauBuildPolicy: policy });

  if (JSON.stringify(next) === JSON.stringify(state)) {
    return;
  }

  const key = `${serializeFreeCellSource(source)}->${serializeFreeCellDestination(destination)}`;

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  hints.push({
    source,
    destination,
    label: `${formatFreeCellSource(source)} → ${formatFreeCellDestination(destination)}`,
  });
}

function formatFreeCellSource(source: FreeCellSource): string {
  if (source.zone === 'cell') {
    return `Cell ${source.cellIndex + 1}`;
  }

  return `Tableau ${source.pileIndex + 1}`;
}

function formatFreeCellDestination(destination: FreeCellDestination): string {
  if (destination.zone === 'cell') {
    return `Cell ${destination.cellIndex + 1}`;
  }

  if (destination.zone === 'foundation') {
    return `Foundation ${destination.pileIndex + 1}`;
  }

  return `Tableau ${destination.pileIndex + 1}`;
}

function serializeFreeCellSource(source: FreeCellSource): string {
  if (source.zone === 'cell') {
    return `cell:${source.cellIndex}`;
  }

  return `tableau:${source.pileIndex}:${source.cardIndex}`;
}

function serializeFreeCellDestination(destination: FreeCellDestination): string {
  if (destination.zone === 'cell') {
    return `cell:${destination.cellIndex}`;
  }

  if (destination.zone === 'foundation') {
    return `foundation:${destination.pileIndex}`;
  }

  return `tableau:${destination.pileIndex}`;
}

function getFoundationDestinationForCard(state: FreeCellState, card: FreeCellState['tableau'][number][number]): number | null {
  for (let pileIndex = 0; pileIndex < state.foundations.length; pileIndex += 1) {
    const pile = state.foundations[pileIndex];
    const top = pile[pile.length - 1];

    if (top && top.suit === card.suit && top.rank + 1 === card.rank) {
      return pileIndex;
    }
  }

  if (card.rank !== 1) {
    return null;
  }

  for (let pileIndex = 0; pileIndex < state.foundations.length; pileIndex += 1) {
    if (state.foundations[pileIndex].length === 0) {
      return pileIndex;
    }
  }

  return null;
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
  dropTarget: { borderRadius: radius.md, minHeight: 44 },
  dropTargetLegal: { boxShadow: '0px 0px 0px 2px rgba(215, 181, 109, 0.5)' },
  dropTargetActive: { boxShadow: '0px 0px 0px 3px #d7b56d' },
  dragGhost: { position: 'absolute', opacity: 0.92 },
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
  hintText: {
    color: '#f3e1b5',
    fontSize: typography.body,
    fontWeight: '600',
  },
  actionIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: spacing.sm,
  },
  board: {
    gap: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tableauRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  winText: {
    color: '#f3e1b5',
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
});
