import type { PersistedGameEnvelope } from '@mumscards/engine-core';
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
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppModel } from '../state/app-provider';
import { palette, radius, spacing, typography } from '../theme';
import { CardStack } from './shared/card-stack';

type HistoryState = {
  past: PyramidState[];
  present: PyramidState;
  future: PyramidState[];
};

type Props = {
  mode: 'new' | 'resume';
};

export function PyramidGameScreen({ mode }: Props) {
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
  const savedGame = saves.pyramid;
  const resumeRestoredRef = useRef(false);
  const [history, setHistory] = useState<HistoryState>(() =>
    createHistoryState(
      mode === 'resume' && savedGame ? savedGame.state : createPyramidGame(Math.random),
    ),
  );
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<PyramidSource | null>(null);
  const [snapshotPickerOpen, setSnapshotPickerOpen] = useState(false);
  const availableWidth = Math.max(320, width - spacing.lg * 2);
  const cardWidth = Math.max(44, Math.min(74, availableWidth / 9.5));
  const pyramidRowGap = Math.max(4, Math.round(cardWidth * 0.08));
  const boardMinWidth = cardWidth * 7 + pyramidRowGap * 6 + spacing.lg;
  const stockCount = history.present.stock.length;
  const canRecycle = stockCount === 0
    && history.present.waste.length > 0
    && history.present.recyclesUsed < history.present.maxRecycles;

  useEffect(() => {
    resumeRestoredRef.current = false;
    setHistory(createHistoryState(createPyramidGame(Math.random)));
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
      void clearGame('pyramid');
      return;
    }

    const envelope: PersistedGameEnvelope<PyramidState> = {
      gameId: 'pyramid',
      updatedAt: new Date().toISOString(),
      state: history.present,
    };

    void saveGame('pyramid', envelope);
  }, [clearGame, history.present, hydrated, saveGame]);

  function clearInteraction() {
    setGameMenuOpen(false);
    setSelectedSource(null);
    setSnapshotPickerOpen(false);
  }

  function commit(next: PyramidState) {
    setHistory((current) => ({
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
    const envelope: PersistedGameEnvelope<PyramidState> = {
      gameId: 'pyramid',
      updatedAt: new Date().toISOString(),
      state: history.present,
    };
    void saveSnapshot('pyramid', envelope);
  }

  function loadSnapshot(snapshot: PersistedGameEnvelope<PyramidState>) {
    setHistory(createHistoryState(snapshot.state));
    clearInteraction();
  }

  function handleDrawOrRecycle() {
    if (history.present.stock.length > 0) {
      const next = drawPyramidStock(history.present);

      if (next !== history.present) {
        commit(next);
      }

      return;
    }

    if (!canRecycle) {
      return;
    }

    const next = recyclePyramidWaste(history.present);

    if (next !== history.present) {
      commit(next);
    }
  }

  function handleSourcePress(source: PyramidSource) {
    if (!isPyramidSourceSelectable(history.present, source)) {
      return;
    }

    if (isSameSource(selectedSource, source)) {
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
      setSelectedSource(source);
      return;
    }

    const next = removePyramidCards(history.present, [selectedSource, source]);

    if (next !== history.present) {
      commit(next);
      return;
    }

    setSelectedSource(source);
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
              <View style={[styles.actionButton, styles.actionButtonActive]}>
                <Text style={styles.actionButtonTextActive}>Pyramid</Text>
              </View>
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
            <ActionButton label="Undo" onPress={undo} disabled={history.past.length === 0} />
            <ActionButton label="Redo" onPress={redo} disabled={history.future.length === 0} />
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

          <ScrollView
            contentContainerStyle={styles.horizontalBoardContent}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
          >
            <View style={[styles.board, { minWidth: boardMinWidth }]}>
              <View style={styles.topRow}>
                <CardStack
                  cardWidth={cardWidth}
                  cards={history.present.stock.slice(-1)}
                  emptyState={stockCount === 0 && canRecycle ? 'recycle' : 'default'}
                  onCardPress={handleDrawOrRecycle}
                  placeholderLabel={stockCount > 0 ? String(stockCount) : '↺'}
                  variant="back"
                />
                <CardStack
                  cardWidth={cardWidth}
                  cards={history.present.waste.slice(-1)}
                  onCardPress={
                    history.present.waste.length > 0
                      ? () => handleSourcePress({ zone: 'waste' })
                      : undefined
                  }
                  placeholderLabel=""
                  selected={selectedSource?.zone === 'waste'}
                />
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
                      const selectable = card !== null
                        && isPyramidSourceSelectable(history.present, source);

                      return (
                        <View key={`pyramid-cell-${rowIndex}-${cardIndex}`} style={styles.pyramidCell}>
                          {card ? (
                            <CardStack
                              cardWidth={cardWidth}
                              cards={[card]}
                              onCardPress={selectable ? () => handleSourcePress(source) : undefined}
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
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function createHistoryState(state: PyramidState): HistoryState {
  return {
    past: [],
    present: state,
    future: [],
  };
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
  horizontalBoardContent: {
    paddingBottom: spacing.sm,
  },
  board: {
    gap: spacing.lg,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
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
