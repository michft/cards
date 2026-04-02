import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { createSpiderGame } from '@mumscards/game-spider';
import type { SpiderState, SpiderTableauCard } from '@mumscards/game-spider';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppModel } from '../state/app-provider';
import { CardStack } from './shared/card-stack';
import { palette, radius, spacing, typography } from '../theme';

type SpiderHistoryState = {
  past: SpiderState[];
  present: SpiderState;
  future: SpiderState[];
};

const MAX_SPIDER_TABLEAU_MOVE = 12;
const MAX_SPIDER_COLLAPSE_ITERATIONS = 128;

type Props = {
  mode: 'new' | 'resume';
};

export function SpiderGameScreen({ mode }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { hydrated, saves, saveGame, clearGame, settings, snapshots, saveSnapshot, deleteSnapshot } = useAppModel();
  const savedGame = saves.spider;
  const resumeRestoredRef = useRef(false);
  const [history, setHistory] = useState<SpiderHistoryState>(() =>
    createSpiderHistoryState(
      mode === 'resume' && savedGame
        ? savedGame.state
        : createSpiderGame(Math.random, { suitMode: settings.spiderSuitMode }),
    ),
  );
  const [selectedSource, setSelectedSource] = useState<{
    pileIndex: number;
    cardIndex: number;
  } | null>(null);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [expandedTableauPile, setExpandedTableauPile] = useState<number | null>(null);
  const [snapshotPickerOpen, setSnapshotPickerOpen] = useState(false);
  const availableWidth = Math.max(320, width - spacing.lg * 2);
  const cardWidth = Math.max(46, Math.min(72, availableWidth / 11.4));
  const rowGap = spacing.sm;
  const boardMinWidth = cardWidth * 10 + rowGap * 9;
  const suitModeLabel = getSpiderSuitModeLabel(settings.spiderSuitMode);
  const canDealStock = history.present.stock.length >= 10 && history.present.tableau.every((pile) => pile.length > 0);
  const won = history.present.completedRuns >= 8;

  useEffect(() => {
    resumeRestoredRef.current = false;
    setHistory(
      createSpiderHistoryState(
        createSpiderGame(Math.random, { suitMode: settings.spiderSuitMode }),
      ),
    );
    setSelectedSource(null);
    setGameMenuOpen(false);
    setExpandedTableauPile(null);
    setSnapshotPickerOpen(false);
  }, [mode, settings.spiderSuitMode]);

  useEffect(() => {
    if (!hydrated || mode !== 'resume' || resumeRestoredRef.current || !savedGame) {
      return;
    }

    resumeRestoredRef.current = true;
    setHistory(createSpiderHistoryState(savedGame.state));
    setSelectedSource(null);
    setGameMenuOpen(false);
    setExpandedTableauPile(null);
    setSnapshotPickerOpen(false);
  }, [hydrated, mode, savedGame]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (history.present.completedRuns >= 8) {
      void clearGame('spider');
      return;
    }

    const envelope: PersistedGameEnvelope<SpiderState> = {
      gameId: 'spider',
      updatedAt: new Date().toISOString(),
      state: history.present,
    };
    void saveGame('spider', envelope);
  }, [clearGame, history.present, hydrated, saveGame]);

  function commit(next: SpiderState) {
    setHistory((current) => ({
      past: [...current.past.slice(-49), current.present],
      present: next,
      future: [],
    }));
    setSelectedSource(null);
    setGameMenuOpen(false);
    setExpandedTableauPile(null);
    setSnapshotPickerOpen(false);
  }

  function startNewGame() {
    setHistory(
      createSpiderHistoryState(createSpiderGame(Math.random, { suitMode: settings.spiderSuitMode })),
    );
    setSelectedSource(null);
    setGameMenuOpen(false);
    setExpandedTableauPile(null);
    setSnapshotPickerOpen(false);
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
    setGameMenuOpen(false);
    setExpandedTableauPile(null);
    setSnapshotPickerOpen(false);
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
    setGameMenuOpen(false);
    setExpandedTableauPile(null);
    setSnapshotPickerOpen(false);
  }

  function saveCurrentState() {
    const envelope: PersistedGameEnvelope<SpiderState> = {
      gameId: 'spider',
      updatedAt: new Date().toISOString(),
      state: history.present,
    };
    void saveSnapshot('spider', envelope);
  }

  function loadSnapshot(snapshot: PersistedGameEnvelope<SpiderState>) {
    setHistory(createSpiderHistoryState(snapshot.state));
    setSelectedSource(null);
    setExpandedTableauPile(null);
    setSnapshotPickerOpen(false);
  }

  function handleCardSelect(pileIndex: number, cardIndex: number) {
    const pile = history.present.tableau[pileIndex];
    if (!pile) {
      return;
    }

    const resolvedCardIndex = canMoveSpiderStack(pile, cardIndex)
      ? cardIndex
      : resolveSpiderFallbackCardIndex(pile, cardIndex);
    const card = pile[resolvedCardIndex];

    if (!card || !card.faceUp) {
      return;
    }

    if (!canMoveSpiderStack(pile, resolvedCardIndex)) {
      return;
    }

    if (
      selectedSource &&
      selectedSource.pileIndex === pileIndex &&
      selectedSource.cardIndex === resolvedCardIndex
    ) {
      setSelectedSource(null);
      return;
    }

    setSelectedSource({ pileIndex, cardIndex: resolvedCardIndex });
  }

  function handleDestinationPress(destinationPileIndex: number) {
    if (!selectedSource) {
      return;
    }

    if (selectedSource.pileIndex === destinationPileIndex) {
      setSelectedSource(null);
      return;
    }

    const resolvedSourceCardIndex = resolveSpiderSourceForDestination(
      history.present,
      selectedSource.pileIndex,
      selectedSource.cardIndex,
      destinationPileIndex,
    );

    const next = moveSpiderStack(
      history.present,
      selectedSource.pileIndex,
      resolvedSourceCardIndex,
      destinationPileIndex,
    );

    if (!next) {
      return;
    }

    commit(next);
  }

  function dealSpiderStock() {
    const next = dealSpiderStockRow(history.present);

    if (!next) {
      return;
    }

    commit(next);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.floatingNavWrap}>
          <View style={styles.floatingNavRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setGameMenuOpen((current) => !current)}
              style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.switchButtonText}>Games ▾</Text>
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
                style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.switchButtonText}>FreeCell</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.replace('/game/klondike?mode=new');
                }}
                style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.switchButtonText}>Klondike</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.replace('/game/pyramid?mode=new');
                }}
                style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.switchButtonText}>Pyramid</Text>
              </Pressable>
              <View style={[styles.switchButton, styles.switchButtonActive]}>
                <Text style={styles.switchButtonTextActive}>Spider</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGameMenuOpen(false);
                  router.push('/');
                }}
                style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.switchButtonText}>{'< home'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.switchRow}>
            <Pressable
              accessibilityRole="button"
              onPress={startNewGame}
              style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.switchButtonText}>New</Text>
            </Pressable>
            {settings.spiderDebugTools ? (
              <Pressable
                accessibilityRole="button"
                onPress={saveCurrentState}
                style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.switchButtonText}>Save</Text>
              </Pressable>
            ) : null}
            {settings.spiderDebugTools ? (
              <Pressable
                accessibilityRole="button"
                disabled={snapshots.spider.length === 0}
                onPress={() => setSnapshotPickerOpen((current) => !current)}
                style={({ pressed }) => [
                  styles.switchButton,
                  snapshots.spider.length === 0 && styles.switchButtonDisabled,
                  pressed && snapshots.spider.length > 0 && styles.buttonPressed,
                ]}
              >
                <Text style={styles.switchButtonText}>Load</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={history.past.length === 0}
              onPress={undo}
              style={({ pressed }) => [
                styles.switchButton,
                history.past.length === 0 && styles.switchButtonDisabled,
                pressed && history.past.length > 0 && styles.buttonPressed,
              ]}
            >
              <Text style={styles.switchButtonText}>Undo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={history.future.length === 0}
              onPress={redo}
              style={({ pressed }) => [
                styles.switchButton,
                history.future.length === 0 && styles.switchButtonDisabled,
                pressed && history.future.length > 0 && styles.buttonPressed,
              ]}
            >
              <Text style={styles.switchButtonText}>Redo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/settings?game=spider')}
              style={({ pressed }) => [styles.switchButton, pressed && styles.buttonPressed]}
            >
              <Ionicons color={palette.ink} name="settings-outline" size={16} />
            </Pressable>
          </View>

          <Text style={styles.title}>
            Spider ({suitModeLabel})
          </Text>
          {won ? <Text style={styles.winText}>Game won. Start another round.</Text> : null}
          {settings.spiderDebugTools && snapshotPickerOpen ? (
            <View style={styles.snapshotPanel}>
              {snapshots.spider.map((snapshot) => (
                <View key={snapshot.id} style={styles.snapshotRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => loadSnapshot(snapshot)}
                    style={({ pressed }) => [
                      styles.snapshotLoadButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.snapshotText}>{snapshot.label}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (snapshot.id) {
                        void deleteSnapshot('spider', snapshot.id);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.snapshotDeleteButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Ionicons color={palette.ink} name="trash-outline" size={14} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <ScrollView horizontal contentContainerStyle={styles.horizontalBoardContent} showsHorizontalScrollIndicator={false}>
            <View style={[styles.board, { minWidth: boardMinWidth }]}>
              <View style={styles.stockRow}>
                <CardStack
                  cardWidth={cardWidth}
                  cards={history.present.stock.slice(-1)}
                  onCardPress={canDealStock ? dealSpiderStock : undefined}
                  placeholderLabel={`${history.present.stock.length}`}
                  variant="back"
                />
                <View style={styles.stockMeta}>
                  <Text style={styles.copy}>Stock: {history.present.stock.length}</Text>
                  <Text style={styles.copy}>Runs complete: {history.present.completedRuns}</Text>
                </View>
              </View>
              <View style={styles.foundationRow}>
                {Array.from({ length: 8 }, (_, index) => {
                  const run = history.present.foundations[index] ?? [];

                  return (
                    <CardStack
                      cardWidth={cardWidth}
                      cards={run.slice(-1).map((card) => ({ ...card, faceUp: true }))}
                      key={`spider-foundation-${index}`}
                      placeholderLabel="K"
                    />
                  );
                })}
              </View>
              <View style={styles.tableauRow}>
                {history.present.tableau.map((pile, pileIndex) => (
                  <CardStack
                    cardWidth={cardWidth}
                    cards={pile}
                    expanded={expandedTableauPile === pileIndex}
                    key={`spider-tableau-${pileIndex}`}
                    onCardPress={selectedSource ? () => handleDestinationPress(pileIndex) : undefined}
                    onFaceUpCardPress={(cardIndex) => {
                      if (selectedSource && selectedSource.pileIndex !== pileIndex) {
                        handleDestinationPress(pileIndex);
                        return;
                      }

                      handleCardSelect(pileIndex, cardIndex);
                    }}
                    onCardHoldEnd={() => {
                      setExpandedTableauPile((current) => (current === pileIndex ? null : current));
                    }}
                    onCardHoldStart={() => {
                      setExpandedTableauPile(pileIndex);
                    }}
                    placeholderLabel=""
                    selected={selectedSource?.pileIndex === pileIndex}
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

function createSpiderHistoryState(state: SpiderState): SpiderHistoryState {
  return {
    past: [],
    present: state,
    future: [],
  };
}

function getSpiderSuitModeLabel(mode: 'spades-only' | 'hearts-only' | 'red-black' | 'all-suits') {
  if (mode === 'spades-only') {
    return 'black only';
  }

  if (mode === 'hearts-only') {
    return 'red only';
  }

  if (mode === 'red-black') {
    return 'hearts + spades';
  }

  return '4 suits';
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
  floatingNavRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  floatingGameMenu: {
    flexDirection: 'column',
    gap: spacing.xs,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(8, 25, 19, 0.18)',
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  switchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  switchButton: {
    backgroundColor: palette.paper,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchButtonActive: {
    backgroundColor: palette.accent,
  },
  switchButtonText: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '600',
  },
  switchButtonTextActive: {
    color: palette.ink,
    fontSize: typography.body,
    fontWeight: '700',
  },
  switchButtonDisabled: {
    opacity: 0.4,
  },
  horizontalBoardContent: {
    paddingBottom: spacing.sm,
  },
  board: {
    gap: spacing.lg,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stockMeta: {
    gap: spacing.xs,
  },
  foundationRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tableauRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  card: {
    backgroundColor: palette.paper,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: palette.ink,
    fontSize: typography.title,
    fontWeight: '700',
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
  subtitle: {
    color: palette.ink,
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  copy: {
    color: '#2f3e34',
    fontSize: typography.body,
    lineHeight: 22,
  },
  winText: {
    color: '#f3e1b5',
    fontSize: typography.subtitle,
    fontWeight: '700',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
});

function canMoveSpiderStack(pile: SpiderTableauCard[], cardIndex: number): boolean {
  const stack = pile.slice(cardIndex);

  if (stack.length === 0 || stack.some((card) => !card.faceUp)) {
    return false;
  }

  for (let index = 0; index < stack.length - 1; index += 1) {
    if (
      stack[index].suit !== stack[index + 1].suit ||
      stack[index].rank !== stack[index + 1].rank + 1
    ) {
      return false;
    }
  }

  return true;
}

function moveSpiderStack(
  state: SpiderState,
  sourcePileIndex: number,
  sourceCardIndex: number,
  destinationPileIndex: number,
): SpiderState | null {
  const sourcePile = state.tableau[sourcePileIndex];
  const destinationPile = state.tableau[destinationPileIndex];

  if (!sourcePile || !destinationPile) {
    return null;
  }

  if (!canMoveSpiderStack(sourcePile, sourceCardIndex)) {
    return null;
  }

  const moving = sourcePile.slice(sourceCardIndex);
  const maxMovableCards = getSpiderMaxMovableCards(
    state,
    sourcePileIndex,
    destinationPileIndex,
  );

  if (moving.length > maxMovableCards) {
    return null;
  }

  const lead = moving[0];
  const destinationTop = destinationPile[destinationPile.length - 1];

  if (!canPlaceSpiderLeadOnDestination(lead, destinationTop)) {
    return null;
  }

  const nextTableau = state.tableau.map((pile) => pile.map((card) => ({ ...card })));
  const nextSource = nextTableau[sourcePileIndex];
  const nextDestination = nextTableau[destinationPileIndex];
  const movedCards = nextSource.splice(sourceCardIndex);
  nextDestination.push(...movedCards);

  if (nextSource.length > 0 && !nextSource[nextSource.length - 1].faceUp) {
    nextSource[nextSource.length - 1] = {
      ...nextSource[nextSource.length - 1],
      faceUp: true,
    };
  }

  return collapseSpiderCompletedRuns({
    ...state,
    tableau: nextTableau,
  });
}

function dealSpiderStockRow(state: SpiderState): SpiderState | null {
  if (state.stock.length < 10) {
    return null;
  }

  if (state.tableau.some((pile) => pile.length === 0)) {
    return null;
  }

  const nextTableau = state.tableau.map((pile) => pile.map((card) => ({ ...card })));
  const nextStock = [...state.stock];
  const dealt = nextStock.splice(-10);

  for (let pileIndex = 0; pileIndex < nextTableau.length; pileIndex += 1) {
    const card = dealt[pileIndex];

    if (!card) {
      continue;
    }

    nextTableau[pileIndex].push({
      ...card,
      faceUp: true,
    });
  }

  return collapseSpiderCompletedRuns({
    ...state,
    stock: nextStock,
    tableau: nextTableau,
  });
}

function canPlaceSpiderLeadOnDestination(
  lead: SpiderTableauCard | undefined,
  destinationTop: SpiderTableauCard | undefined,
): boolean {
  if (!lead) {
    return false;
  }

  if (!destinationTop) {
    return true;
  }

  return destinationTop.rank === lead.rank + 1;
}

function resolveSpiderSourceForDestination(
  state: SpiderState,
  sourcePileIndex: number,
  selectedCardIndex: number,
  destinationPileIndex: number,
): number {
  const sourcePile = state.tableau[sourcePileIndex];
  const destinationPile = state.tableau[destinationPileIndex];
  const destinationTop = destinationPile?.[destinationPile.length - 1];

  if (!sourcePile || !destinationPile || !destinationTop) {
    return selectedCardIndex;
  }

  const selectedLead = sourcePile[selectedCardIndex];

  if (canPlaceSpiderLeadOnDestination(selectedLead, destinationTop)) {
    return selectedCardIndex;
  }

  // Keep moves manual, but allow destination-aware fallback upward.
  for (let candidateIndex = selectedCardIndex - 1; candidateIndex >= 0; candidateIndex -= 1) {
    if (!canMoveSpiderStack(sourcePile, candidateIndex)) {
      continue;
    }

    const candidateLead = sourcePile[candidateIndex];

    if (canPlaceSpiderLeadOnDestination(candidateLead, destinationTop)) {
      return candidateIndex;
    }
  }

  return selectedCardIndex;
}

function resolveSpiderFallbackCardIndex(
  pile: SpiderTableauCard[],
  selectedCardIndex: number,
): number {
  for (let candidateIndex = selectedCardIndex + 1; candidateIndex < pile.length; candidateIndex += 1) {
    if (canMoveSpiderStack(pile, candidateIndex)) {
      return candidateIndex;
    }
  }

  return selectedCardIndex;
}

function getSpiderMaxMovableCards(
  state: SpiderState,
  sourcePileIndex: number,
  destinationPileIndex: number,
): number {
  const _sourcePile = state.tableau[sourcePileIndex];
  const _destinationPile = state.tableau[destinationPileIndex];
  return MAX_SPIDER_TABLEAU_MOVE;
}

function isCompleteSpiderRun(cards: SpiderTableauCard[]): boolean {
  if (cards.length !== 13) {
    return false;
  }

  const suit = cards[0]?.suit;

  if (!suit) {
    return false;
  }

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const expectedRank = 13 - index;

    if (!card.faceUp || card.suit !== suit || card.rank !== expectedRank) {
      return false;
    }
  }

  return true;
}

function collapseSpiderCompletedRuns(state: SpiderState): SpiderState {
  const nextTableau = state.tableau.map((pile) => pile.map((card) => ({ ...card })));
  const nextFoundations = state.foundations.map((pile) => pile.map((card) => ({ ...card })));
  let completedRuns = nextFoundations.length;
  let collapseIterations = 0;

  for (let pileIndex = 0; pileIndex < nextTableau.length; pileIndex += 1) {
    let pile = nextTableau[pileIndex];

    while (pile.length >= 13) {
      if (collapseIterations >= MAX_SPIDER_COLLAPSE_ITERATIONS) {
        return {
          ...state,
          tableau: nextTableau,
          foundations: nextFoundations,
          completedRuns,
        };
      }

      const tail = pile.slice(-13);

      if (!isCompleteSpiderRun(tail)) {
        break;
      }

      collapseIterations += 1;

      const removed = pile.splice(-13).map((card) => ({
        id: card.id,
        suit: card.suit,
        rank: card.rank,
        color: card.color,
      }));
      nextFoundations.push(removed);
      completedRuns += 1;

      if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
        pile[pile.length - 1] = {
          ...pile[pile.length - 1],
          faceUp: true,
        };
      }
    }
  }

  return {
    ...state,
    tableau: nextTableau,
    foundations: nextFoundations,
    completedRuns,
  };
}
