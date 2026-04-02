import type { PersistedGameEnvelope } from '@mumscards/engine-core';
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

const hourLabels = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'];

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
  const cardWidth = Math.max(42, Math.min(68, availableWidth / 8.6));
  const boardSize = cardWidth * 5.6;
  const radiusPx = boardSize * 0.38;
  const slotSize = cardWidth;

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

    if (history.present.won) {
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

  function draw() {
    const next = drawClockStock(history.present);

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
            <ActionButton
              label="Draw"
              onPress={draw}
              disabled={history.present.stock.length === 0 || history.present.activeCard !== null}
            />
            <ActionButton label="Place" onPress={place} disabled={!history.present.activeCard} />
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

          <View style={styles.topRow}>
            <CardStack
              cardWidth={cardWidth}
              cards={history.present.stock.slice(-1)}
              onCardPress={draw}
              placeholderLabel={String(history.present.stock.length)}
              variant="back"
            />
            <CardStack
              cardWidth={cardWidth}
              cards={history.present.activeCard ? [history.present.activeCard] : []}
              onCardPress={history.present.activeCard ? place : undefined}
              placeholderLabel=""
              selected={Boolean(history.present.activeCard)}
            />
            <CardStack
              cardWidth={cardWidth}
              cards={history.present.kings.slice(-1)}
              placeholderLabel="K"
            />
          </View>

          <View style={[styles.clockBoard, { height: boardSize, width: boardSize }]}>
            {history.present.hours.map((pile, hourIndex) => {
              const angle = (Math.PI * 2 * hourIndex) / 12 - Math.PI / 2;
              const center = boardSize / 2;
              const x = center + Math.cos(angle) * radiusPx - slotSize / 2;
              const y = center + Math.sin(angle) * radiusPx - slotSize / 2;

              return (
                <View
                  key={`clock-hour-${hourIndex}`}
                  style={[
                    styles.hourSlot,
                    {
                      left: x,
                      top: y,
                      width: slotSize,
                    },
                  ]}
                >
                  <CardStack cardWidth={cardWidth} cards={pile.slice(-1)} placeholderLabel={hourLabels[hourIndex]} />
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
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
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  clockBoard: {
    alignSelf: 'center',
    marginTop: spacing.md,
    position: 'relative',
  },
  hourSlot: {
    position: 'absolute',
  },
  winText: {
    color: '#f3e1b5',
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
});
