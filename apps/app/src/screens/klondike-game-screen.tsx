import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import {
  applyKlondikeMove,
  canAutoComplete,
  createKlondikeGame,
  drawFromStock,
  getHint,
  getPreferredDestination,
  recycleWaste,
  runAutoComplete,
  type KlondikeDestination,
  type KlondikeSource,
  type KlondikeState,
} from '@mumscards/game-klondike';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppModel } from '../state/app-provider';
import { palette, radius, spacing, typography } from '../theme';
import { CardStack } from './shared/card-stack';

type HistoryState = {
  past: KlondikeState[];
  present: KlondikeState;
  future: KlondikeState[];
};

type Props = {
  gameId: string;
  mode: 'new' | 'resume';
};

export function KlondikeGameScreen({ gameId, mode }: Props) {
  const { height, width } = useWindowDimensions();
  const orientation = width > height ? 'landscape' : 'portrait';
  const { hydrated, saves, saveGame, clearGame, settings } = useAppModel();
  const savedGame = saves.klondike;
  const initialState = useMemo(
    () => (mode === 'resume' && savedGame ? savedGame.state : createKlondikeGame()),
    [mode, savedGame],
  );
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: initialState,
    future: [],
  });
  const [selectedSource, setSelectedSource] = useState<KlondikeSource | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);

  useEffect(() => {
    setHistory({
      past: [],
      present: initialState,
      future: [],
    });
    setSelectedSource(null);
    setHintText(null);
  }, [initialState]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (history.present.completed) {
      void clearGame('klondike');
      return;
    }

    const envelope: PersistedGameEnvelope<KlondikeState> = {
      gameId: 'klondike',
      updatedAt: new Date().toISOString(),
      state: history.present,
    };

    void saveGame('klondike', envelope);
  }, [clearGame, history.present, hydrated, saveGame]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.tagName === 'INPUT') {
        return;
      }

      if (event.key.toLowerCase() === 'u') {
        event.preventDefault();
        undo();
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        redo();
      }

      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        showHint();
      }

      if (event.key.toLowerCase() === 'd') {
        event.preventDefault();
        draw();
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        startNewGame();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  function commit(next: KlondikeState) {
    setHistory((current) => ({
      past: [...current.past.slice(-49), current.present],
      present: next,
      future: [],
    }));
    setSelectedSource(null);
    setHintText(null);
  }

  function startNewGame() {
    setHistory({
      past: [],
      present: createKlondikeGame(),
      future: [],
    });
    setSelectedSource(null);
    setHintText(null);
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
    setSelectedSource(null);
    setHintText(null);
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
    setSelectedSource(null);
    setHintText(null);
  }

  function maybeAutoComplete(state: KlondikeState) {
    return canAutoComplete(state) ? runAutoComplete(state) : state;
  }

  function draw() {
    const next =
      history.present.stock.length > 0
        ? drawFromStock(history.present)
        : recycleWaste(history.present);

    commit(maybeAutoComplete(next));
  }

  function showHint() {
    const hint = getHint(history.present, settings.hintMode);
    setHintText(hint ? hint.label : 'No legal move found.');
  }

  function handleMove(source: KlondikeSource, destination: KlondikeDestination) {
    const next = applyKlondikeMove(history.present, {
      kind: 'move',
      source,
      destination,
    });

    if (JSON.stringify(next) === JSON.stringify(history.present)) {
      return;
    }

    commit(maybeAutoComplete(next));
  }

  function handleSourcePress(source: KlondikeSource) {
    if (selectedSource) {
      if (JSON.stringify(selectedSource) === JSON.stringify(source)) {
        setSelectedSource(null);
        return;
      }

      setSelectedSource(source);
      return;
    }

    const preferred = getPreferredDestination(history.present, source);

    if (preferred) {
      handleMove(source, preferred);
      return;
    }

    setSelectedSource(source);
  }

  function handleDestinationPress(destination: KlondikeDestination) {
    if (!selectedSource) {
      return;
    }

    handleMove(selectedSource, destination);
  }

  const boardWidth = Math.min(width - spacing.lg * 2, 1180);
  const cardWidth = orientation === 'landscape'
    ? Math.max(72, Math.min(96, boardWidth / 10.5))
    : Math.max(58, Math.min(88, boardWidth / 7.6));

  const content = (
    <>
      <View style={[styles.boardHeader, orientation === 'landscape' && styles.boardHeaderLandscape]}>
        <View style={styles.statusChip}>
          <Text style={styles.statusLabel}>{gameId}</Text>
        </View>
        <View style={styles.headerActions}>
          <ActionButton label="New" onPress={startNewGame} />
          <ActionButton label="Draw" onPress={draw} />
          <ActionButton label="Undo" onPress={undo} disabled={history.past.length === 0} />
          <ActionButton label="Redo" onPress={redo} disabled={history.future.length === 0} />
          <ActionButton label="Hint" onPress={showHint} />
        </View>
      </View>

      {hintText ? <Text style={styles.hintText}>{hintText}</Text> : null}
      {history.present.completed ? <Text style={styles.winText}>Game won. Start another round.</Text> : null}

      <View style={[styles.board, { maxWidth: boardWidth }]}>
        <View style={styles.topRow}>
          <Zone
            label="Stock"
            onPress={draw}
            width={cardWidth}
          >
            <CardStack
              cardWidth={cardWidth}
              cards={history.present.stock.slice(-1)}
              placeholderLabel={history.present.stock.length === 0 ? 'Recycle' : `${history.present.stock.length}`}
              variant="back"
            />
          </Zone>

          <Zone label="Waste" width={cardWidth}>
            <CardStack
              cardWidth={cardWidth}
              cards={history.present.waste.slice(-1).map((card) => ({ ...card, faceUp: true }))}
              onCardPress={history.present.waste.length > 0 ? () => handleSourcePress({ zone: 'waste' }) : undefined}
              placeholderLabel="Empty"
              selected={selectedSource?.zone === 'waste'}
            />
          </Zone>

          {history.present.foundations.map((pile, pileIndex) => (
            <Zone
              key={`foundation-${pileIndex}`}
              label={`Foundation ${pileIndex + 1}`}
              onPress={() => handleDestinationPress({ zone: 'foundation', pileIndex })}
              width={cardWidth}
            >
              <CardStack
                cardWidth={cardWidth}
                cards={pile.slice(-1).map((card) => ({ ...card, faceUp: true }))}
                onCardPress={pile.length > 0 ? () => handleSourcePress({ zone: 'foundation', pileIndex }) : undefined}
                placeholderLabel="A"
                selected={
                  selectedSource?.zone === 'foundation' && selectedSource.pileIndex === pileIndex
                }
              />
            </Zone>
          ))}
        </View>

        <View style={[styles.tableauRow, orientation === 'landscape' && styles.tableauRowLandscape]}>
          {history.present.tableau.map((pile, pileIndex) => (
            <Zone
              key={`tableau-${pileIndex}`}
              label={`Tableau ${pileIndex + 1}`}
              onPress={() => handleDestinationPress({ zone: 'tableau', pileIndex })}
              width={cardWidth}
            >
              <CardStack
                cardWidth={cardWidth}
                cards={pile}
                onFaceUpCardPress={(cardIndex) =>
                  handleSourcePress({ zone: 'tableau', pileIndex, cardIndex })
                }
                placeholderLabel="K"
                selected={
                  selectedSource?.zone === 'tableau' && selectedSource.pileIndex === pileIndex
                }
              />
            </Zone>
          ))}
        </View>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {orientation === 'portrait' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      ) : (
        <View style={styles.landscapeShell}>{content}</View>
      )}
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
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

function Zone({
  children,
  label,
  onPress,
  width,
}: {
  children: ReactNode;
  label: string;
  onPress?(): void;
  width: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.zone,
        {
          width,
        },
      ]}
    >
      {children}
      <Text style={styles.zoneLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.table,
  },
  scrollContent: {
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  landscapeShell: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
  },
  boardHeader: {
    width: '100%',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  boardHeaderLandscape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusChip: {
    alignSelf: 'flex-start',
    backgroundColor: palette.tableShadow,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  statusLabel: {
    color: palette.accent,
    fontSize: typography.eyebrow,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
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
  actionButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionButtonText: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '600',
  },
  hintText: {
    color: palette.paper,
    fontSize: typography.body,
    marginBottom: spacing.md,
  },
  winText: {
    color: '#f3e1b5',
    fontSize: typography.subtitle,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  board: {
    width: '100%',
    gap: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  tableauRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  tableauRowLandscape: {
    alignItems: 'flex-start',
  },
  zone: {
    gap: spacing.sm,
    alignItems: 'center',
  },
  zoneLabel: {
    color: palette.paper,
    fontSize: typography.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
