import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  applyKlondikeMove,
  canAutoComplete,
  createKlondikeGame,
  drawFromStock,
  getHints,
  getLegalMoves,
  recycleWaste,
  runAutoComplete,
  type KlondikeDestination,
  type KlondikeMove,
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
type TableauToTableauMove = Extract<KlondikeMove, { kind: 'move' }> & {
  source: {
    zone: 'tableau';
    pileIndex: number;
    cardIndex: number;
  };
  destination: {
    zone: 'tableau';
    pileIndex: number;
  };
};

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
  const router = useRouter();
  const orientation = width > height ? 'landscape' : 'portrait';
  const { hydrated, saves, saveGame, clearGame, settings, snapshots, saveSnapshot, deleteSnapshot } = useAppModel();
  const savedGame = saves.klondike;
  const resumeRestoredRef = useRef(false);
  const createNewGame = useCallback(
    () => createKlondikeGame(Math.random, { drawCount: settings.drawCount }),
    [settings.drawCount],
  );
  const [history, setHistory] = useState<HistoryState>(() =>
    createHistoryState(mode === 'resume' && savedGame ? savedGame.state : createNewGame()),
  );
  const [selectedSource, setSelectedSource] = useState<KlondikeSource | null>(null);
  const [selectedAtMs, setSelectedAtMs] = useState<number | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintCycleIndex, setHintCycleIndex] = useState(0);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [offloadActive, setOffloadActive] = useState(false);
  const [expandedTableauPile, setExpandedTableauPile] = useState<number | null>(null);
  const [snapshotPickerOpen, setSnapshotPickerOpen] = useState(false);
  const [zoneMeasurements, setZoneMeasurements] = useState<Record<string, ZoneMeasurement>>({});
  const [rootOffset, setRootOffset] = useState({ x: 0, y: 0 });
  const zoneRefs = useRef<Record<string, RNView | null>>({});
  const rootRef = useRef<RNView | null>(null);
  const keyActionRef = useRef({
    undo: () => {},
    redo: () => {},
    showHint: () => {},
    draw: () => {},
    startNewGame: () => {},
  });

  useEffect(() => {
    resumeRestoredRef.current = false;
    setHistory(createHistoryState(mode === 'resume' && savedGame ? savedGame.state : createNewGame()));
    clearInteractionState();
  }, [createNewGame, gameId, mode]);

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
        keyActionRef.current.undo();
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        keyActionRef.current.redo();
      }

      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        keyActionRef.current.showHint();
      }

      if (event.key.toLowerCase() === 'd') {
        event.preventDefault();
        keyActionRef.current.draw();
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        keyActionRef.current.startNewGame();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const measureRoot = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      setRootOffset((current) => {
        if (current.x === x && current.y === y) {
          return current;
        }

        return { x, y };
      });
    });
  }, []);

  const measureZone = useCallback((zoneKey: string) => {
    const node = zoneRefs.current[zoneKey];
    const destination = parseDestination(zoneKey);

    if (!node || !destination) {
      return;
    }

    node.measureInWindow((x, y, widthValue, heightValue) => {
      setZoneMeasurements((current) => {
        const existing = current[zoneKey];

        if (
          existing &&
          existing.destination.zone === destination.zone &&
          existing.destination.pileIndex === destination.pileIndex &&
          existing.x === x &&
          existing.y === y &&
          existing.width === widthValue &&
          existing.height === heightValue
        ) {
          return current;
        }

        return {
          ...current,
          [zoneKey]: {
            destination,
            x,
            y,
            width: widthValue,
            height: heightValue,
          },
        };
      });
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

  useEffect(() => {
    if (!offloadActive) {
      return;
    }

    const move = getNextFoundationMove(history.present, settings.emptyTableauPolicy);

    if (!move) {
      setOffloadActive(false);
      return;
    }

    const timer = setTimeout(() => {
      setHistory((current) => {
        const nextMove = getNextFoundationMove(current.present, settings.emptyTableauPolicy);

        if (!nextMove) {
          return current;
        }

        const next = applyKlondikeMove(current.present, nextMove, {
          emptyTableauPolicy: settings.emptyTableauPolicy,
        });

        return {
          past: [...current.past.slice(-49), current.present],
          present: next,
          future: [],
        };
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [history.present, offloadActive, settings.emptyTableauPolicy]);

  function clearInteractionState() {
    setSelectedSource(null);
    setSelectedAtMs(null);
    setHintText(null);
    setHintCycleIndex(0);
    setGameMenuOpen(false);
    setDragState(null);
    setExpandedTableauPile(null);
    setSnapshotPickerOpen(false);
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
    setOffloadActive(false);
    setHistory(createHistoryState(createNewGame()));
    clearInteractionState();
  }

  function saveCurrentState() {
    const envelope: PersistedGameEnvelope<KlondikeState> = {
      gameId: 'klondike',
      updatedAt: new Date().toISOString(),
      state: history.present,
    };
    void saveSnapshot('klondike', envelope);
  }

  function loadSnapshot(snapshot: PersistedGameEnvelope<KlondikeState>) {
    setHistory(createHistoryState(snapshot.state));
    clearInteractionState();
  }

  function undo() {
    setOffloadActive(false);
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
    setOffloadActive(false);
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
    const options = { emptyTableauPolicy: settings.emptyTableauPolicy };
    return canAutoComplete(state, options) ? runAutoComplete(state, options) : state;
  }

  function draw() {
    setOffloadActive(false);
    const next =
      history.present.stock.length > 0
        ? drawFromStock(history.present)
        : recycleWaste(history.present);

    commit(maybeAutoComplete(next));
  }

  function showHint() {
    const hints = getHints(history.present, settings.hintMode, {
      emptyTableauPolicy: settings.emptyTableauPolicy,
    });

    if (hints.length === 0) {
      setHintText('No legal move found.');
      setHintCycleIndex(0);
      return;
    }

    const index = hintCycleIndex % hints.length;
    setHintText(hints[index].label);
    setHintCycleIndex((current) => (current + 1) % hints.length);
  }

  function handleMove(source: KlondikeSource, destination: KlondikeDestination) {
    setOffloadActive(false);
    const resolvedSource = resolvePreferredSourceForDestination(
      history.present,
      source,
      destination,
      settings.emptyTableauPolicy,
    );
    const next = applyKlondikeMove(
      history.present,
      {
        kind: 'move',
        source: resolvedSource,
        destination,
      },
      { emptyTableauPolicy: settings.emptyTableauPolicy },
    );

    if (JSON.stringify(next) === JSON.stringify(history.present)) {
      return;
    }

    commit(maybeAutoComplete(next));
  }

  function handleSourcePress(source: KlondikeSource) {
    const legalDestinations = getLegalDestinations(
      history.present,
      source,
      settings.emptyTableauPolicy,
    );

    if (selectedSource) {
      if (JSON.stringify(selectedSource) === JSON.stringify(source)) {
        setSelectedSource(null);
        setSelectedAtMs(null);
        return;
      }

      setSelectedSource(source);
      setSelectedAtMs(Date.now());
      return;
    }

    if (legalDestinations.length === 0) {
      return;
    }

    setSelectedSource(source);
    setSelectedAtMs(Date.now());
  }

  function handleDestinationPress(destination: KlondikeDestination) {
    if (!selectedSource) {
      return;
    }

    if (
      selectedSource.zone === 'tableau' &&
      destination.zone === 'tableau' &&
      selectedSource.pileIndex === destination.pileIndex
    ) {
      const elapsed = selectedAtMs === null ? 0 : Date.now() - selectedAtMs;

      if (elapsed >= 500) {
        setSelectedSource(null);
        setSelectedAtMs(null);
      }
      return;
    }

    handleMove(selectedSource, destination);
  }

  function handleDragStart(source: KlondikeSource, payload: DragGesturePayload) {
    setOffloadActive(false);
    refreshZoneMeasurements();

    const legalDestinations = getLegalDestinations(
      history.present,
      source,
      settings.emptyTableauPolicy,
    );
    const cards = getDragCards(history.present, source);

    if (cards.length === 0 || legalDestinations.length === 0) {
      return;
    }

    setSelectedSource(source);
    setSelectedAtMs(Date.now());
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

  function toggleOffload() {
    if (offloadActive) {
      setOffloadActive(false);
      return;
    }

    clearInteractionState();
    setOffloadActive(true);
  }

  keyActionRef.current = {
    undo,
    redo,
    showHint,
    draw,
    startNewGame,
  };

  const highlightedDestinations = useMemo(() => {
    if (dragState) {
      return dragState.legalDestinations;
    }

    if (selectedSource) {
      return getLegalDestinations(
        history.present,
        selectedSource,
        settings.emptyTableauPolicy,
      );
    }

    return [];
  }, [dragState, history.present, selectedSource, settings.emptyTableauPolicy]);

  const availableWidth = Math.max(320, width - spacing.lg * 2);
  const cardWidth = orientation === 'landscape'
    ? Math.max(66, Math.min(96, availableWidth / 10.8))
    : Math.max(48, Math.min(74, availableWidth / 8.2));
  const wasteOffset = Math.max(18, Math.round(cardWidth * 0.42));
  const wasteStackWidth = cardWidth + wasteOffset * 2;
  const wasteZoneWidth = wasteStackWidth + spacing.xs * 2;
  const rowGap = spacing.sm;
  const topRowWidth = cardWidth * 5 + wasteZoneWidth + rowGap * 5;
  const tableauRowWidth = cardWidth * 7 + rowGap * 6;
  const boardMinWidth = Math.max(topRowWidth, tableauRowWidth);

  const content = (
    <>
      <View style={[styles.boardHeader, orientation === 'landscape' && styles.boardHeaderLandscape]}>
        <View style={styles.headerActions}>
          <ActionButton label="New" onPress={startNewGame} />
          {settings.klondikeDebugTools ? (
            <ActionButton label="Save" onPress={saveCurrentState} />
          ) : null}
          {settings.klondikeDebugTools ? (
            <ActionButton
              label="Load"
              onPress={() => setSnapshotPickerOpen((current) => !current)}
              disabled={snapshots.klondike.length === 0}
            />
          ) : null}
          <ActionButton label="Draw" onPress={draw} />
          <ActionButton
            disabled={
              !offloadActive &&
              !getNextFoundationMove(history.present, settings.emptyTableauPolicy)
            }
            label={offloadActive ? 'Stop' : 'Offload'}
            onPress={toggleOffload}
          />
          <ActionButton label="Undo" onPress={undo} disabled={history.past.length === 0} />
          <ActionButton label="Redo" onPress={redo} disabled={history.future.length === 0} />
          <ActionButton label="Hint" onPress={showHint} />
          <Pressable
            accessibilityLabel="Open settings"
            accessibilityRole="button"
            onPress={() => router.push('/settings?game=klondike')}
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionIconButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Ionicons color={palette.ink} name="settings-outline" size={18} />
          </Pressable>
        </View>
      </View>

      {settings.klondikeDebugTools && snapshotPickerOpen ? (
        <View style={styles.snapshotPanel}>
          {snapshots.klondike.map((snapshot) => (
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
                onPress={() => {
                  if (snapshot.id) {
                    void deleteSnapshot('klondike', snapshot.id);
                  }
                }}
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

      {hintText ? <Text style={styles.hintText}>{hintText}</Text> : null}
      {history.present.completed ? <Text style={styles.winText}>Game won. Start another round.</Text> : null}

      <ScrollView
        contentContainerStyle={styles.horizontalBoardContent}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
      >
        <View style={[styles.board, { minWidth: boardMinWidth }]}>
        <View style={styles.topRow}>
          <Zone
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

          <Zone width={wasteZoneWidth}>
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
                placeholderLabel={settings.emptyTableauPolicy === 'king-only' ? 'K' : 'Any'}
                selected={
                  selectedSource?.zone === 'tableau' && selectedSource.pileIndex === pileIndex
                }
              />
            </Zone>
          ))}
        </View>
        </View>
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View onLayout={measureRoot} ref={rootRef} style={styles.screen}>
        <View style={styles.floatingNavWrap}>
          <View style={styles.floatingNavRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setGameMenuOpen((current) => !current)}
              style={({ pressed }) => [styles.gameSwitchButton, pressed && styles.actionButtonPressed]}
            >
              <Text style={styles.gameSwitchButtonText}>Games ▾</Text>
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
                style={({ pressed }) => [styles.gameSwitchButton, pressed && styles.actionButtonPressed]}
              >
                <Text style={styles.gameSwitchButtonText}>FreeCell</Text>
              </Pressable>
              <View style={[styles.gameSwitchButton, styles.gameSwitchButtonActive]}>
                <Text style={styles.gameSwitchButtonTextActive}>Klondike</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.replace('/game/pyramid?mode=new');
                }}
                style={({ pressed }) => [styles.gameSwitchButton, pressed && styles.actionButtonPressed]}
              >
                <Text style={styles.gameSwitchButtonText}>Pyramid</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.replace('/game/spider?mode=new');
                }}
                style={({ pressed }) => [styles.gameSwitchButton, pressed && styles.actionButtonPressed]}
              >
                <Text style={styles.gameSwitchButtonText}>Spider</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.push('/');
                }}
                style={({ pressed }) => [styles.gameSwitchButton, pressed && styles.actionButtonPressed]}
              >
                <Text style={styles.gameSwitchButtonText}>{'< home'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} nestedScrollEnabled>
          {content}
        </ScrollView>

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

function getNextFoundationMove(
  state: KlondikeState,
  emptyTableauPolicy: 'any' | 'king-only',
) {
  return getLegalMoves(state, { emptyTableauPolicy }).find(
    (move) => move.kind === 'move' && move.destination.zone === 'foundation',
  );
}

function getLegalDestinations(
  state: KlondikeState,
  source: KlondikeSource,
  emptyTableauPolicy: 'any' | 'king-only',
): KlondikeDestination[] {
  const seen = new Set<string>();

  return getLegalMoves(state, { emptyTableauPolicy }).flatMap((move) => {
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

function resolvePreferredSourceForDestination(
  state: KlondikeState,
  source: KlondikeSource,
  destination: KlondikeDestination,
  emptyTableauPolicy: 'any' | 'king-only',
): KlondikeSource {
  if (source.zone !== 'tableau' || destination.zone !== 'tableau') {
    return source;
  }

  if (state.tableau[destination.pileIndex]?.length !== 0) {
    return source;
  }

  const bestMove = getLegalMoves(state, { emptyTableauPolicy })
    .filter(
      (move): move is TableauToTableauMove =>
        move.kind === 'move' &&
        move.source.zone === 'tableau' &&
        move.destination.zone === 'tableau' &&
        move.source.pileIndex === source.pileIndex &&
        move.destination.pileIndex === destination.pileIndex,
    )
    .sort((left, right) => left.source.cardIndex - right.source.cardIndex)[0];

  return bestMove ? bestMove.source : source;
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
  onPress,
  onMeasureZone,
  registerZone,
  width,
}: {
  activeDrop?: boolean;
  children: ReactNode;
  destination?: KlondikeDestination;
  highlighted?: boolean;
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
  horizontalBoardContent: {
    paddingBottom: spacing.sm,
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
  gameSwitchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gameSwitchButton: {
    backgroundColor: palette.paper,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  gameSwitchButtonActive: {
    backgroundColor: palette.accent,
  },
  gameSwitchButtonText: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '600',
  },
  gameSwitchButtonTextActive: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '700',
  },
  actionButton: {
    backgroundColor: palette.paper,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actionIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 38,
    paddingHorizontal: spacing.sm,
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
  snapshotPanel: {
    backgroundColor: palette.paper,
    borderRadius: radius.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
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
    width: 'auto',
    gap: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacing.sm,
    justifyContent: 'flex-start',
  },
  tableauRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacing.sm,
    justifyContent: 'flex-start',
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
