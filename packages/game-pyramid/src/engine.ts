import { createDeck } from '@mumscards/engine-core';
import type { PlayingCard } from '@mumscards/engine-core';

import type { PyramidSource, PyramidState, PyramidTableau } from './types';

type PyramidOptions = {
  maxRecycles?: number;
};

export function createPyramidGame(random = Math.random, options?: PyramidOptions): PyramidState {
  const deck = shuffle(createDeck('pyramid'), random);
  const tableau: PyramidTableau = [];

  for (let rowIndex = 0; rowIndex < 7; rowIndex += 1) {
    const row: Array<PlayingCard | null> = [];

    for (let cardIndex = 0; cardIndex <= rowIndex; cardIndex += 1) {
      const card = deck.pop();

      if (!card) {
        throw new Error('Deck exhausted while dealing Pyramid tableau.');
      }

      row.push(card);
    }

    tableau.push(row);
  }

  return {
    gameId: 'pyramid',
    tableau,
    stock: deck,
    waste: [],
    removedCount: 0,
    recyclesUsed: 0,
    maxRecycles: options?.maxRecycles ?? 2,
    won: false,
  };
}

export function drawPyramidStock(state: PyramidState): PyramidState {
  if (state.stock.length === 0 || state.won) {
    return state;
  }

  const next = cloneState(state);
  const card = next.stock.pop();

  if (!card) {
    return state;
  }

  next.waste.push(card);
  return withWinState(next);
}

export function recyclePyramidWaste(state: PyramidState): PyramidState {
  if (state.stock.length > 0 || state.waste.length === 0 || state.won) {
    return state;
  }

  if (state.recyclesUsed >= state.maxRecycles) {
    return state;
  }

  const next = cloneState(state);
  next.stock = [...next.waste].reverse();
  next.waste = [];
  next.recyclesUsed += 1;
  return next;
}

export function removePyramidCards(
  state: PyramidState,
  sources: PyramidSource[],
): PyramidState {
  if (state.won) {
    return state;
  }

  const uniqueSources = dedupeSources(sources);

  if (uniqueSources.length < 1 || uniqueSources.length > 2) {
    return state;
  }

  const cards = uniqueSources.map((source) => getSourceCard(state, source));

  if (cards.some((card) => card === null)) {
    return state;
  }

  const ranks = cards.map((card) => card?.rank ?? 0);
  const total = ranks[0] + (ranks[1] ?? 0);
  const isSingleKing = uniqueSources.length === 1 && ranks[0] === 13;
  const isPairToThirteen = uniqueSources.length === 2 && total === 13;

  if (!isSingleKing && !isPairToThirteen) {
    return state;
  }

  const next = cloneState(state);
  let removedThisMove = 0;

  for (const source of uniqueSources) {
    const partner =
      uniqueSources.length === 2
        ? uniqueSources[0] === source
          ? uniqueSources[1]
          : uniqueSources[0]
        : null;

    if (source.zone === 'waste') {
      const wasteTop = next.waste[next.waste.length - 1];

      if (!wasteTop) {
        return state;
      }

      next.waste.pop();
      removedThisMove += 1;
      continue;
    }

    if (!canRemoveTableauSource(state, source, partner)) {
      return state;
    }

    if (!next.tableau[source.rowIndex]?.[source.cardIndex]) {
      return state;
    }

    next.tableau[source.rowIndex][source.cardIndex] = null;
    removedThisMove += 1;
  }

  next.removedCount += removedThisMove;
  return withWinState(next);
}

export function isPyramidSourceSelectable(state: PyramidState, source: PyramidSource): boolean {
  if (source.zone === 'waste') {
    return state.waste.length > 0;
  }

  const card = state.tableau[source.rowIndex]?.[source.cardIndex];
  if (!card) {
    return false;
  }

  return (
    isExposed(state, source.rowIndex, source.cardIndex)
    || isHalfBlockedPairCandidate(state, source.rowIndex, source.cardIndex)
  );
}

export function getPyramidSourceCard(
  state: PyramidState,
  source: PyramidSource,
): PlayingCard | null {
  return getSourceCard(state, source);
}

function withWinState(state: PyramidState): PyramidState {
  const tableauCleared = state.tableau.every((row) => row.every((card) => card === null));

  if (!tableauCleared) {
    return state;
  }

  return {
    ...state,
    won: true,
  };
}

function cloneState(state: PyramidState): PyramidState {
  return {
    ...state,
    tableau: state.tableau.map((row) => row.map((card) => (card ? { ...card } : null))),
    stock: state.stock.map((card) => ({ ...card })),
    waste: state.waste.map((card) => ({ ...card })),
  };
}

function getSourceCard(state: PyramidState, source: PyramidSource): PlayingCard | null {
  if (source.zone === 'waste') {
    return state.waste[state.waste.length - 1] ?? null;
  }

  if (!isPyramidSourceSelectable(state, source)) {
    return null;
  }

  return state.tableau[source.rowIndex]?.[source.cardIndex] ?? null;
}

function dedupeSources(sources: PyramidSource[]): PyramidSource[] {
  const seen = new Set<string>();
  const result: PyramidSource[] = [];

  for (const source of sources) {
    const key =
      source.zone === 'waste'
        ? 'waste'
        : `tableau-${source.rowIndex}-${source.cardIndex}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(source);
  }

  return result;
}

function isExposed(state: PyramidState, rowIndex: number, cardIndex: number): boolean {
  const card = state.tableau[rowIndex]?.[cardIndex];

  if (!card) {
    return false;
  }

  if (rowIndex === state.tableau.length - 1) {
    return true;
  }

  const nextRow = rowIndex + 1;
  const leftChild = state.tableau[nextRow]?.[cardIndex] ?? null;
  const rightChild = state.tableau[nextRow]?.[cardIndex + 1] ?? null;
  return leftChild === null && rightChild === null;
}

function canRemoveTableauSource(
  state: PyramidState,
  source: Extract<PyramidSource, { zone: 'tableau' }>,
  partner: PyramidSource | null,
): boolean {
  if (isExposed(state, source.rowIndex, source.cardIndex)) {
    return true;
  }

  if (!partner || partner.zone !== 'tableau') {
    return false;
  }

  return isHalfBlockedParentChildPair(state, source, partner);
}

function isHalfBlockedPairCandidate(
  state: PyramidState,
  rowIndex: number,
  cardIndex: number,
): boolean {
  const card = state.tableau[rowIndex]?.[cardIndex];

  if (!card || isExposed(state, rowIndex, cardIndex) || rowIndex >= state.tableau.length - 1) {
    return false;
  }

  const childRow = rowIndex + 1;
  const leftChild = state.tableau[childRow]?.[cardIndex] ?? null;
  const rightChild = state.tableau[childRow]?.[cardIndex + 1] ?? null;
  const leftOpen = leftChild === null;
  const rightOpen = rightChild === null;

  if ((leftOpen && rightOpen) || (!leftOpen && !rightOpen)) {
    return false;
  }

  const blockerIndex = leftOpen ? cardIndex + 1 : cardIndex;
  const blocker = state.tableau[childRow]?.[blockerIndex] ?? null;

  if (!blocker || !isExposed(state, childRow, blockerIndex)) {
    return false;
  }

  return card.rank + blocker.rank === 13;
}

function isHalfBlockedParentChildPair(
  state: PyramidState,
  left: Extract<PyramidSource, { zone: 'tableau' }>,
  right: Extract<PyramidSource, { zone: 'tableau' }>,
): boolean {
  const parent = left.rowIndex < right.rowIndex ? left : right;
  const child = left.rowIndex < right.rowIndex ? right : left;

  if (parent.rowIndex + 1 !== child.rowIndex) {
    return false;
  }

  const parentCard = state.tableau[parent.rowIndex]?.[parent.cardIndex] ?? null;
  const childCard = state.tableau[child.rowIndex]?.[child.cardIndex] ?? null;

  if (!parentCard || !childCard) {
    return false;
  }

  if (child.cardIndex !== parent.cardIndex && child.cardIndex !== parent.cardIndex + 1) {
    return false;
  }

  const siblingIndex = child.cardIndex === parent.cardIndex
    ? parent.cardIndex + 1
    : parent.cardIndex;
  const sibling = state.tableau[child.rowIndex]?.[siblingIndex] ?? null;

  if (sibling !== null) {
    return false;
  }

  if (!isExposed(state, child.rowIndex, child.cardIndex)) {
    return false;
  }

  return parentCard.rank + childCard.rank === 13;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}
