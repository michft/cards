import { createDeck } from '@mumscards/engine-core';
import type { PlayingCard } from '@mumscards/engine-core';

import type {
  FreeCellDestination,
  FreeCellSource,
  FreeCellState,
  FreeCellTableauBuildPolicy,
} from './types';

type FreeCellRuleOptions = {
  tableauBuildPolicy?: FreeCellTableauBuildPolicy;
};

export function createFreeCellGame(random = Math.random): FreeCellState {
  const deck = shuffle(createDeck('freecell'), random);
  const tableau: PlayingCard[][] = Array.from({ length: 8 }, () => []);

  for (let index = 0; index < deck.length; index += 1) {
    tableau[index % 8].push(deck[index]);
  }

  return {
    gameId: 'freecell',
    foundations: Array.from({ length: 4 }, () => []),
    freeCells: [null, null, null, null],
    tableau,
    won: false,
  };
}

export function applyFreeCellMove(
  state: FreeCellState,
  source: FreeCellSource,
  destination: FreeCellDestination,
  options?: FreeCellRuleOptions,
): FreeCellState {
  const resolved = resolveOptions(options);
  const payload = getSourceCards(state, source, resolved);

  if (!payload) {
    return state;
  }

  if (!canPlaceOnDestination(state, payload.cards, destination, resolved)) {
    return state;
  }

  const next = cloneFreeCellState(state);
  const removed = removeFromSource(next, source);

  if (!removed) {
    return state;
  }

  placeOnDestination(next, removed, destination);

  return {
    ...next,
    won: isFreeCellWon(next),
  };
}

export function isFreeCellWon(state: FreeCellState): boolean {
  return state.foundations.reduce((count, pile) => count + pile.length, 0) === 52;
}

function canPlaceOnDestination(
  state: FreeCellState,
  cards: PlayingCard[],
  destination: FreeCellDestination,
  options: Required<FreeCellRuleOptions>,
): boolean {
  const lead = cards[0];

  if (!lead) {
    return false;
  }

  if (destination.zone === 'cell') {
    return cards.length === 1 && state.freeCells[destination.cellIndex] === null;
  }

  if (destination.zone === 'foundation') {
    if (cards.length !== 1) {
      return false;
    }

    const pile = state.foundations[destination.pileIndex];

    if (!pile) {
      return false;
    }

    if (pile.length === 0) {
      return lead.rank === 1;
    }

    const top = pile[pile.length - 1];
    return top.suit === lead.suit && top.rank + 1 === lead.rank;
  }

  const pile = state.tableau[destination.pileIndex];

  if (!pile) {
    return false;
  }

  if (pile.length === 0) {
    return true;
  }

  const top = pile[pile.length - 1];
  return isValidBuildPair(top, lead, options.tableauBuildPolicy);
}

function getSourceCards(
  state: FreeCellState,
  source: FreeCellSource,
  options: Required<FreeCellRuleOptions>,
): { cards: PlayingCard[] } | null {
  if (source.zone === 'cell') {
    const card = state.freeCells[source.cellIndex];
    return card ? { cards: [card] } : null;
  }

  const pile = state.tableau[source.pileIndex];

  if (!pile || source.cardIndex < 0 || source.cardIndex >= pile.length) {
    return null;
  }

  const cards = pile.slice(source.cardIndex);

  if (!isValidTableauSequence(cards, options.tableauBuildPolicy)) {
    return null;
  }

  if (cards.length > getMaxMovableTableauDepth(state)) {
    return null;
  }

  return { cards };
}

function removeFromSource(state: FreeCellState, source: FreeCellSource): PlayingCard[] | null {
  if (source.zone === 'cell') {
    const card = state.freeCells[source.cellIndex];

    if (!card) {
      return null;
    }

    state.freeCells[source.cellIndex] = null;
    return [card];
  }

  const pile = state.tableau[source.pileIndex];

  if (!pile || source.cardIndex < 0 || source.cardIndex >= pile.length) {
    return null;
  }

  return pile.splice(source.cardIndex);
}

function placeOnDestination(
  state: FreeCellState,
  cards: PlayingCard[],
  destination: FreeCellDestination,
) {
  if (destination.zone === 'cell') {
    state.freeCells[destination.cellIndex] = cards[0] ?? null;
    return;
  }

  if (destination.zone === 'foundation') {
    if (cards[0]) {
      state.foundations[destination.pileIndex].push(cards[0]);
    }
    return;
  }

  state.tableau[destination.pileIndex].push(...cards);
}

function cloneFreeCellState(state: FreeCellState): FreeCellState {
  return {
    ...state,
    foundations: state.foundations.map((pile) => pile.map((card) => ({ ...card }))),
    freeCells: state.freeCells.map((card) => (card ? { ...card } : null)),
    tableau: state.tableau.map((pile) => pile.map((card) => ({ ...card }))),
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function resolveOptions(options?: FreeCellRuleOptions): Required<FreeCellRuleOptions> {
  return {
    tableauBuildPolicy: options?.tableauBuildPolicy ?? 'alternate-red-black',
  };
}

function isValidTableauSequence(
  cards: PlayingCard[],
  policy: FreeCellTableauBuildPolicy,
): boolean {
  if (cards.length === 0) {
    return false;
  }

  for (let index = 0; index < cards.length - 1; index += 1) {
    if (!isValidBuildPair(cards[index], cards[index + 1], policy)) {
      return false;
    }
  }

  return true;
}

function isValidBuildPair(
  upper: PlayingCard,
  lower: PlayingCard,
  policy: FreeCellTableauBuildPolicy,
): boolean {
  if (upper.rank !== lower.rank + 1) {
    return false;
  }

  if (policy === 'any') {
    return true;
  }

  if (policy === 'suit-matching') {
    return upper.suit === lower.suit;
  }

  return upper.color !== lower.color;
}

function getMaxMovableTableauDepth(state: FreeCellState): number {
  const emptyFreeCells = state.freeCells.filter((card) => card === null).length;
  return emptyFreeCells + 1;
}
