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
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppModel } from '../state/app-provider';
import { palette, radius, spacing, typography } from '../theme';
import { CardStack } from './shared/card-stack';

type HistoryState = {
  past: FreeCellState[];
  present: FreeCellState;
  future: FreeCellState[];
};

type Props = {
  mode: 'new' | 'resume';
};

export function FreeCellGameScreen({ mode }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
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
  const resumeRestoredRef = useRef(false);
  const [history, setHistory] = useState<HistoryState>(() =>
    createHistoryState(
      mode === 'resume' && savedGame ? savedGame.state : createFreeCellGame(Math.random),
    ),
  );
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<FreeCellSource | null>(null);
  const [expandedTableauPile, setExpandedTableauPile] = useState<number | null>(null);
  const [snapshotPickerOpen, setSnapshotPickerOpen] = useState(false);
  const [offloadActive, setOffloadActive] = useState(false);
  const availableWidth = Math.max(320, width - spacing.lg * 2);
  const cardWidth = Math.max(46, Math.min(72, availableWidth / 11.4));
  const rowGap = spacing.sm;
  const topRowWidth = cardWidth * 8 + rowGap * 7;
  const tableauRowWidth = cardWidth * 8 + rowGap * 7;
  const boardMinWidth = Math.max(topRowWidth, tableauRowWidth);

  useEffect(() => {
    resumeRestoredRef.current = false;
    setHistory(createHistoryState(createFreeCellGame(Math.random)));
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

    if (history.present.won) {
      void clearGame('freecell');
      return;
    }

    const envelope: PersistedGameEnvelope<FreeCellState> = {
      gameId: 'freecell',
      updatedAt: new Date().toISOString(),
      state: history.present,
    };

    void saveGame('freecell', envelope);
  }, [clearGame, history.present, hydrated, saveGame]);

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
      setHistory((current) => {
        const nextMove = getNextFreeCellFoundationMove(current.present);

        if (!nextMove) {
          return current;
        }

        const nextWithRules = applyFreeCellMove(
          current.present,
          nextMove.source,
          nextMove.destination,
          { tableauBuildPolicy: settings.freeCellTableauBuildPolicy },
        );

        if (JSON.stringify(nextWithRules) === JSON.stringify(current.present)) {
          return current;
        }

        return {
          past: [...current.past.slice(-49), current.present],
          present: nextWithRules,
          future: [],
        };
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [history.present, offloadActive, settings.freeCellTableauBuildPolicy]);

  function clearInteraction() {
    setOffloadActive(false);
    setGameMenuOpen(false);
    setSelectedSource(null);
    setExpandedTableauPile(null);
    setSnapshotPickerOpen(false);
  }

  function commit(next: FreeCellState) {
    setHistory((current) => ({
      past: [...current.past.slice(-49), current.present],
      present: next,
      future: [],
    }));
    clearInteraction();
  }

  function startNewGame() {
    setHistory(createHistoryState(createFreeCellGame(Math.random)));
    clearInteraction();
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
    const envelope: PersistedGameEnvelope<FreeCellState> = {
      gameId: 'freecell',
      updatedAt: new Date().toISOString(),
      state: history.present,
    };
    void saveSnapshot('freecell', envelope);
  }

  function loadSnapshot(snapshot: PersistedGameEnvelope<FreeCellState>) {
    setHistory(createHistoryState(snapshot.state));
    clearInteraction();
  }

  function handleSourcePress(source: FreeCellSource) {
    if (selectedSource && JSON.stringify(selectedSource) === JSON.stringify(source)) {
      setSelectedSource(null);
      return;
    }

    setSelectedSource(source);
  }

  function handleDestinationPress(destination: FreeCellDestination) {
    if (!selectedSource) {
      return;
    }

    if (
      (selectedSource.zone === 'tableau' &&
        destination.zone === 'tableau' &&
        selectedSource.pileIndex === destination.pileIndex) ||
      (selectedSource.zone === 'cell' &&
        destination.zone === 'cell' &&
        selectedSource.cellIndex === destination.cellIndex)
    ) {
      setSelectedSource(null);
      return;
    }

    const next = applyFreeCellMove(history.present, selectedSource, destination, {
      tableauBuildPolicy: settings.freeCellTableauBuildPolicy,
    });

    if (JSON.stringify(next) === JSON.stringify(history.present)) {
      return;
    }

    commit(next);
  }

  function toggleOffload() {
    if (offloadActive) {
      setOffloadActive(false);
      return;
    }

    if (!getNextFreeCellFoundationMove(history.present)) {
      return;
    }

    setOffloadActive(true);
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
                <Text style={styles.actionButtonTextActive}>FreeCell</Text>
              </View>
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
            />
            <ActionButton label="Undo" onPress={undo} disabled={history.past.length === 0} />
            <ActionButton label="Redo" onPress={redo} disabled={history.future.length === 0} />
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

          <ScrollView
            contentContainerStyle={styles.horizontalBoardContent}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
          >
            <View style={[styles.board, { minWidth: boardMinWidth }]}>
              <View style={styles.topRow}>
                {history.present.freeCells.map((card, cellIndex) => (
                  <CardStack
                    cardWidth={cardWidth}
                    cards={card ? [{ ...card, faceUp: true }] : []}
                    key={`cell-${cellIndex}`}
                    onCardPress={
                      selectedSource
                        ? () => handleDestinationPress({ zone: 'cell', cellIndex })
                        : card
                          ? () => handleSourcePress({ zone: 'cell', cellIndex })
                          : undefined
                    }
                    placeholderLabel="Free"
                    selected={
                      selectedSource?.zone === 'cell' && selectedSource.cellIndex === cellIndex
                    }
                  />
                ))}
                {history.present.foundations.map((pile, pileIndex) => (
                  <CardStack
                    cardWidth={cardWidth}
                    cards={pile.slice(-1).map((card) => ({ ...card, faceUp: true }))}
                    key={`foundation-${pileIndex}`}
                    onCardPress={
                      selectedSource
                        ? () => handleDestinationPress({ zone: 'foundation', pileIndex })
                        : undefined
                    }
                    placeholderLabel="A"
                  />
                ))}
              </View>

              <View style={styles.tableauRow}>
                {history.present.tableau.map((pile, pileIndex) => (
                  <CardStack
                    cardWidth={cardWidth}
                    cards={pile.map((card) => ({ ...card, faceUp: true }))}
                    expanded={expandedTableauPile === pileIndex}
                    key={`tableau-${pileIndex}`}
                    onCardPress={
                      selectedSource
                        ? () => handleDestinationPress({ zone: 'tableau', pileIndex })
                        : undefined
                    }
                    onFaceUpCardPress={(cardIndex) => {
                      if (selectedSource) {
                        handleDestinationPress({ zone: 'tableau', pileIndex });
                        return;
                      }

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
                ))}
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function createHistoryState(state: FreeCellState): HistoryState {
  return {
    past: [],
    present: state,
    future: [],
  };
}

function getNextFreeCellFoundationMove(
  state: FreeCellState,
): { source: FreeCellSource; destination: FreeCellDestination } | null {
  for (let cellIndex = 0; cellIndex < state.freeCells.length; cellIndex += 1) {
    const card = state.freeCells[cellIndex];

    if (!card) {
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

    if (!card) {
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
    paddingTop: spacing.xl + spacing.lg,
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
    justifyContent: 'center',
    minWidth: 38,
    paddingHorizontal: spacing.sm,
  },
  horizontalBoardContent: {
    paddingBottom: spacing.sm,
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
  winText: {
    color: '#f3e1b5',
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
});
