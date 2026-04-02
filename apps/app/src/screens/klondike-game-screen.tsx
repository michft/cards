import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import {
  applyKlondikeMove,
  canAutoComplete,
  createKlondikeGame,
  drawFromStock,
  getHint,
  getLegalMoves,
  recycleWaste,
  runAutoComplete,
  type KlondikeDestination,
  type KlondikeSource,
  type KlondikeState,
  type KlondikeTableauCard,
} from '@mumscards/game-klondike';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type View as RNView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppModel } from '../state/app-provider';
import { palette, radius, spacing, typography } from '../theme';
import { CardStack, type DragPayload as DragGesturePayload } from './shared/card-stack';

type HistoryState = {
  past: KlondikeState[];
  present: KlondikeState;
  future: KlondikeState[];
};

type DragCard = KlondikeTableauCard;

type DragState = {
  source: KlondikeSource;
  cards: DragCard[];
  x: number;
  y: number;
  touchOffsetX: number;
  touchOffsetY: number;
  legalDestinations: KlondikeDestination[];
  activeDestination: KlondikeDestination | null;
};

type ZoneMeasurement = {
  destination: KlondikeDestination;
  x: number;
  y: number;
  width: number;
  height: number;
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
  const resumeRestoredRef = useRef(false);
  const [history, setHistory] = useState<HistoryState>(() =>
    createHistoryState(mode === 'resume' && savedGame ? savedGame.state : createKlondikeGame()),
  );
  const [selectedSource, setSelectedSource] = useState<KlondikeSource | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [expandedTableauPile, setExpandedTableauPile] = useState<number | null>(null);
  const [zoneMeasurements, setZoneMeasurements] = useState<Record<string, ZoneMeasurement>>({});
  const [rootOffset, setRootOffset] = useState({ x: 0, y: 0 });
  const zoneRefs = useRef<Record<string, RNView | null>>({});
  const rootRef = useRef<RNView | null>(null);

  useEffect(() => {
    resumeRestoredRef.current = false;
    setHistory(createHistoryState(mode === 'resume' && savedGame ? savedGame.state : createKlondikeGame()));
    clearInteractionState();
  }, [gameId, mode]);

  useEffect(() => {
    if (mode !== 'resume' || resumeRestoredRef.current || !savedGame) {
      return;
    }

    resumeRestoredRef.current = true;
    setHistory(createHistoryState(savedGame.state));
    clearInteractionState();
  }, [mode, savedGame]);

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

  const measureRoot = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      setRootOffset({ x, y });
    });
  }, []);

  const measureZone = useCallback((zoneKey: string) => {
    const node = zoneRefs.current[zoneKey];
    const destination = parseDestination(zoneKey);

    if (!node || !destination) {
      return;
    }

    node.measureInWindow((x, y, widthValue, heightValue) => {
      setZoneMeasurements((current) => ({
        ...current,
        [zoneKey]: {
          destination,
          x,
          y,
          width: widthValue,
          height: heightValue,
        },
      }));
    });
  }, []);

  const registerZone = useCallback(
    (zoneKey: string) => (node: RNView | null) => {
      zoneRefs.current[zoneKey] = node;

      if (node) {
        requestAnimationFrame(() => {
          measureZone(zoneKey);
        });
      }
    },
    [measureZone],
  );

  const refreshZoneMeasurements = useCallback(() => {
    requestAnimationFrame(() => {
      measureRoot();
      Object.keys(zoneRefs.current).forEach((zoneKey) => {
        measureZone(zoneKey);
      });
    });
  }, [measureRoot, measureZone]);

  useEffect(() => {
    refreshZoneMeasurements();
  }, [history.present, orientation, refreshZoneMeasurements, width, height]);

  function clearInteractionState() {
    setSelectedSource(null);
    setHintText(null);
    setDragState(null);
    setExpandedTableauPile(null);
  }

  function commit(next: KlondikeState) {
    setHistory((current) => ({
      past: [...current.past.slice(-49), current.present],
      present: next,
      future: [],
    }));
    clearInteractionState();
  }

  function startNewGame() {
    setHistory(createHistoryState(createKlondikeGame()));
    clearInteractionState();
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
    clearInteractionState();
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
    clearInteractionState();
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
    const legalDestinations = getLegalDestinations(history.present, source);

    if (selectedSource) {
      if (JSON.stringify(selectedSource) === JSON.stringify(source)) {
        setSelectedSource(null);
        return;
      }

      setSelectedSource(source);
      return;
    }

    if (legalDestinations.length === 0) {
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

  function handleDragStart(source: KlondikeSource, payload: DragGesturePayload) {
    refreshZoneMeasurements();

    const legalDestinations = getLegalDestinations(history.present, source);
    const cards = getDragCards(history.present, source);

    if (cards.length === 0 || legalDestinations.length === 0) {
      return;
    }

    setSelectedSource(source);
    setHintText(null);
    setExpandedTableauPile(null);
    setDragState({
      source,
      cards,
      x: payload.layout.x,
      y: payload.layout.y,
      touchOffsetX: payload.pageX - payload.layout.x,
      touchOffsetY: payload.pageY - payload.layout.y,
      legalDestinations,
      activeDestination: findDestinationAtPoint(
        zoneMeasurements,
        legalDestinations,
        payload.pageX,
        payload.pageY,
      ),
    });
  }

  function handleDragMove(payload: DragGesturePayload) {
    setDragState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        x: payload.pageX - current.touchOffsetX,
        y: payload.pageY - current.touchOffsetY,
        activeDestination: findDestinationAtPoint(
          zoneMeasurements,
          current.legalDestinations,
          payload.pageX,
          payload.pageY,
        ),
      };
    });
  }

  function handleDragEnd(payload: DragGesturePayload) {
    const currentDrag = dragState;

    if (!currentDrag) {
      return;
    }

    const destination =
      currentDrag.activeDestination ??
      findDestinationAtPoint(
        zoneMeasurements,
        currentDrag.legalDestinations,
        payload.pageX,
        payload.pageY,
      );

    setDragState(null);

    if (destination) {
      handleMove(currentDrag.source, destination);
      return;
    }

    setSelectedSource(null);
  }

  const highlightedDestinations = useMemo(() => {
    if (dragState) {
      return dragState.legalDestinations;
    }

    if (selectedSource) {
      return getLegalDestinations(history.present, selectedSource);
    }

    return [];
  }, [dragState, history.present, selectedSource]);

  const boardWidth = Math.min(width - spacing.lg * 2, 1180);
  const cardWidth = orientation === 'landscape'
    ? Math.max(72, Math.min(96, boardWidth / 10.5))
    : Math.max(58, Math.min(88, boardWidth / 7.6));
  const wasteWidth = Math.round(cardWidth * 1.6);

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
              emptyState={history.present.stock.length === 0 ? 'recycle' : 'default'}
              placeholderLabel={history.present.stock.length === 0 ? 'Restart' : `${history.present.stock.length}`}
              variant="back"
            />
          </Zone>

          <Zone label="Waste" width={wasteWidth}>
            <CardStack
              cardWidth={cardWidth}
              cards={history.present.waste.slice(-3).map((card) => ({ ...card, faceUp: true }))}
              hiddenFromIndex={
                isDraggingSource(dragState?.source, { zone: 'waste' })
                  ? Math.max(0, history.present.waste.slice(-3).length - 1)
                  : undefined
              }
              layoutMode="waste"
              onCardPress={history.present.waste.length > 0 ? () => handleSourcePress({ zone: 'waste' }) : undefined}
              onCardDragEnd={
                history.present.waste.length > 0 ? (_, payload) => handleDragEnd(payload) : undefined
              }
              onCardDragMove={
                history.present.waste.length > 0 ? (_, payload) => handleDragMove(payload) : undefined
              }
              onCardDragStart={
                history.present.waste.length > 0
                  ? (_, payload) => handleDragStart({ zone: 'waste' }, payload)
                  : undefined
              }
              placeholderLabel="Empty"
              selected={selectedSource?.zone === 'waste'}
            />
          </Zone>

          {history.present.foundations.map((pile, pileIndex) => (
            <Zone
              activeDrop={matchesDestination(dragState?.activeDestination, {
                zone: 'foundation',
                pileIndex,
              })}
              destination={{ zone: 'foundation', pileIndex }}
              highlighted={isDestinationHighlighted(highlightedDestinations, {
                zone: 'foundation',
                pileIndex,
              })}
              key={`foundation-${pileIndex}`}
              label={`Foundation ${pileIndex + 1}`}
              onPress={() => handleDestinationPress({ zone: 'foundation', pileIndex })}
              onMeasureZone={measureZone}
              registerZone={registerZone}
              width={cardWidth}
            >
              <CardStack
                cardWidth={cardWidth}
                cards={pile.slice(-1).map((card) => ({ ...card, faceUp: true }))}
                hiddenFromIndex={
                  isDraggingSource(dragState?.source, { zone: 'foundation', pileIndex }) ? 0 : undefined
                }
                onCardPress={
                  selectedSource
                    ? () => handleDestinationPress({ zone: 'foundation', pileIndex })
                    : pile.length > 0
                      ? () => handleSourcePress({ zone: 'foundation', pileIndex })
                      : undefined
                }
                onCardDragEnd={
                  pile.length > 0 ? (_, payload) => handleDragEnd(payload) : undefined
                }
                onCardDragMove={
                  pile.length > 0 ? (_, payload) => handleDragMove(payload) : undefined
                }
                onCardDragStart={
                  pile.length > 0
                    ? (_, payload) => handleDragStart({ zone: 'foundation', pileIndex }, payload)
                    : undefined
                }
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
              activeDrop={matchesDestination(dragState?.activeDestination, {
                zone: 'tableau',
                pileIndex,
              })}
              destination={{ zone: 'tableau', pileIndex }}
              highlighted={isDestinationHighlighted(highlightedDestinations, {
                zone: 'tableau',
                pileIndex,
              })}
              key={`tableau-${pileIndex}`}
              label={`Tableau ${pileIndex + 1}`}
              onPress={() => handleDestinationPress({ zone: 'tableau', pileIndex })}
              onMeasureZone={measureZone}
              registerZone={registerZone}
              width={cardWidth}
            >
              <CardStack
                cardWidth={cardWidth}
                cards={pile}
                expanded={expandedTableauPile === pileIndex}
                hiddenFromIndex={
                  dragState?.source.zone === 'tableau' && dragState.source.pileIndex === pileIndex
                    ? dragState.source.cardIndex
                    : undefined
                }
                onCardDragEnd={(_, payload) => handleDragEnd(payload)}
                onCardDragMove={(_, payload) => handleDragMove(payload)}
                onCardDragStart={(cardIndex, payload) =>
                  handleDragStart({ zone: 'tableau', pileIndex, cardIndex }, payload)
                }
                onFaceUpCardPress={
                  selectedSource
                    ? () => handleDestinationPress({ zone: 'tableau', pileIndex })
                    : (cardIndex) => handleSourcePress({ zone: 'tableau', pileIndex, cardIndex })
                }
                onCardHoldEnd={() => {
                  setExpandedTableauPile((current) => (current === pileIndex ? null : current));
                }}
                onCardHoldStart={() => {
                  setExpandedTableauPile(pileIndex);
                }}
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
      <View onLayout={measureRoot} ref={rootRef} style={styles.screen}>
        {orientation === 'portrait' ? (
          <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
        ) : (
          <View style={styles.landscapeShell}>{content}</View>
        )}

        {dragState ? (
          <View pointerEvents="none" style={styles.dragOverlay}>
            <View
              style={[
                styles.dragGhost,
                {
                  left: dragState.x - rootOffset.x,
                  top: dragState.y - rootOffset.y,
                  width: cardWidth,
                },
              ]}
            >
              <CardStack
                cardWidth={cardWidth}
                cards={dragState.cards}
                placeholderLabel=""
                selected={Boolean(dragState.activeDestination)}
              />
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function createHistoryState(state: KlondikeState): HistoryState {
  return {
    past: [],
    present: state,
    future: [],
  };
}

function getLegalDestinations(
  state: KlondikeState,
  source: KlondikeSource,
): KlondikeDestination[] {
  const seen = new Set<string>();

  return getLegalMoves(state).flatMap((move) => {
    if (move.kind !== 'move' || !matchesSource(move.source, source)) {
      return [];
    }

    const key = serializeDestination(move.destination);

    if (seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [move.destination];
  });
}

function getDragCards(state: KlondikeState, source: KlondikeSource): DragCard[] {
  if (source.zone === 'waste') {
    const card = state.waste[state.waste.length - 1];
    return card ? [{ ...card, faceUp: true }] : [];
  }

  if (source.zone === 'foundation') {
    const pile = state.foundations[source.pileIndex];
    const card = pile?.[pile.length - 1];
    return card ? [{ ...card, faceUp: true }] : [];
  }

  const pile = state.tableau[source.pileIndex];
  return pile ? pile.slice(source.cardIndex).map((card) => ({ ...card, faceUp: true })) : [];
}

function matchesSource(
  left: KlondikeSource | null | undefined,
  right: KlondikeSource,
): boolean {
  if (!left || left.zone !== right.zone) {
    return false;
  }

  if (left.zone === 'waste' && right.zone === 'waste') {
    return true;
  }

  if (left.zone === 'foundation' && right.zone === 'foundation') {
    return left.pileIndex === right.pileIndex;
  }

  if (left.zone === 'tableau' && right.zone === 'tableau') {
    return left.pileIndex === right.pileIndex && left.cardIndex === right.cardIndex;
  }

  return false;
}

function matchesDestination(
  left: KlondikeDestination | null | undefined,
  right: KlondikeDestination,
): boolean {
  return left?.zone === right.zone && left?.pileIndex === right.pileIndex;
}

function isDraggingSource(
  source: KlondikeSource | null | undefined,
  candidate: KlondikeSource,
): boolean {
  return matchesSource(source, candidate);
}

function serializeDestination(destination: KlondikeDestination): string {
  return `${destination.zone}:${destination.pileIndex}`;
}

function parseDestination(key: string): KlondikeDestination | null {
  const [zone, pileIndexValue] = key.split(':');
  const pileIndex = Number.parseInt(pileIndexValue ?? '', 10);

  if ((zone !== 'foundation' && zone !== 'tableau') || Number.isNaN(pileIndex)) {
    return null;
  }

  return {
    zone,
    pileIndex,
  };
}

function isDestinationHighlighted(
  destinations: KlondikeDestination[],
  destination: KlondikeDestination,
): boolean {
  return destinations.some((candidate) => matchesDestination(candidate, destination));
}

function findDestinationAtPoint(
  measurements: Record<string, ZoneMeasurement>,
  legalDestinations: KlondikeDestination[],
  pageX: number,
  pageY: number,
): KlondikeDestination | null {
  return (
    Object.values(measurements).find((measurement) => {
      if (!isDestinationHighlighted(legalDestinations, measurement.destination)) {
        return false;
      }

      return (
        pageX >= measurement.x &&
        pageX <= measurement.x + measurement.width &&
        pageY >= measurement.y &&
        pageY <= measurement.y + measurement.height
      );
    })?.destination ?? null
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
  activeDrop,
  children,
  destination,
  highlighted,
  label,
  onPress,
  onMeasureZone,
  registerZone,
  width,
}: {
  activeDrop?: boolean;
  children: ReactNode;
  destination?: KlondikeDestination;
  highlighted?: boolean;
  label: string;
  onPress?(): void;
  onMeasureZone?: (zoneKey: string) => void;
  registerZone?: (zoneKey: string) => (node: RNView | null) => void;
  width: number;
}) {
  const zoneKey = destination ? serializeDestination(destination) : undefined;

  return (
    <View
      onLayout={zoneKey ? () => onMeasureZone?.(zoneKey) : undefined}
      ref={zoneKey ? registerZone?.(zoneKey) : undefined}
      style={{
        width,
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[
          styles.zone,
          highlighted && styles.zoneHighlighted,
          activeDrop && styles.zoneActiveDrop,
        ]}
      >
        {children}
        <Text style={styles.zoneLabel}>{label}</Text>
      </Pressable>
    </View>
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
    backgroundColor: 'rgba(11, 32, 24, 0.12)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(246, 241, 231, 0.08)',
    gap: spacing.sm,
    alignItems: 'center',
    minHeight: 120,
    padding: spacing.xs,
  },
  zoneHighlighted: {
    backgroundColor: 'rgba(215, 181, 109, 0.08)',
    borderColor: 'rgba(215, 181, 109, 0.6)',
  },
  zoneActiveDrop: {
    backgroundColor: 'rgba(215, 181, 109, 0.18)',
    borderColor: palette.accent,
  },
  zoneLabel: {
    color: palette.paper,
    fontSize: typography.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dragOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  dragGhost: {
    position: 'absolute',
    opacity: 0.96,
    transform: [{ rotate: '-1.5deg' }],
  },
});
