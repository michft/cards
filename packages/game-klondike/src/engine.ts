import { createDeck, rankLabel } from '@mumscards/engine-core';

import type {
  KlondikeDestination,
  KlondikeDrawCount,
  KlondikeEmptyTableauPolicy,
  KlondikeHint,
  KlondikeHintMode,
  KlondikeMove,
  KlondikeSource,
  KlondikeState,
  KlondikeTableauCard,
} from './types';

type MoveCandidate = {
  move: KlondikeMove;
  score: number;
  label: string;
};

type KlondikeRuleOptions = {
  drawCount?: KlondikeDrawCount;
  emptyTableauPolicy?: KlondikeEmptyTableauPolicy;
};

function resolveOptions(options?: KlondikeRuleOptions): Required<KlondikeRuleOptions> {
  return {
    drawCount: options?.drawCount ?? 3,
    emptyTableauPolicy: options?.emptyTableauPolicy ?? 'any',
  };
}

type MutableKlondikeState = {
  gameId: 'klondike';
  drawCount: KlondikeDrawCount;
  completed: boolean;
  stock: KlondikeState['stock'];
  waste: KlondikeState['waste'];
  foundations: KlondikeState['foundations'];
  tableau: KlondikeState['tableau'];
};

export function createKlondikeGame(random = Math.random, options?: KlondikeRuleOptions): KlondikeState {
  const resolved = resolveOptions(options);
  const deck = shuffle(createDeck('klondike'), random);
  const tableau = Array.from({ length: 7 }, (_, pileIndex) => {
    const pile: KlondikeTableauCard[] = [];

    for (let cardIndex = 0; cardIndex <= pileIndex; cardIndex += 1) {
      const card = deck.pop();

      if (!card) {
        throw new Error('Deck exhausted while dealing Klondike tableau.');
      }

      pile.push({
        ...card,
        faceUp: cardIndex === pileIndex,
      });
    }

    return pile;
  });

  return {
    gameId: 'klondike',
    drawCount: resolved.drawCount,
    completed: false,
    stock: deck,
    waste: [],
    foundations: Array.from({ length: 4 }, () => []),
    tableau,
  };
}

export function cloneKlondikeState(state: KlondikeState): KlondikeState {
  return {
    ...state,
    stock: [...state.stock],
    waste: [...state.waste],
    foundations: state.foundations.map((pile) => [...pile]),
    tableau: state.tableau.map((pile) => pile.map((card) => ({ ...card }))),
  };
}

export function drawFromStock(state: KlondikeState): KlondikeState {
  if (state.stock.length === 0) {
    return recycleWaste(state);
  }

  const next = cloneKlondikeState(state);
  const drawn = next.stock.splice(-Math.min(next.drawCount, next.stock.length));

  next.waste.push(...drawn);
  next.completed = isWon(next);

  return next;
}

export function recycleWaste(state: KlondikeState): KlondikeState {
  if (state.stock.length > 0 || state.waste.length === 0) {
    return cloneKlondikeState(state);
  }

  const next = cloneKlondikeState(state);
  next.stock = recycleWasteIntoStock(next.waste, next.drawCount);
  next.waste = [];

  return next;
}

export function applyKlondikeMove(
  state: KlondikeState,
  move: KlondikeMove,
  options?: KlondikeRuleOptions,
): KlondikeState {
  if (move.kind === 'draw') {
    return drawFromStock(state);
  }

  if (move.kind === 'recycle') {
    return recycleWaste(state);
  }

  return moveCards(state, move.source, move.destination, options) ?? cloneKlondikeState(state);
}

export function moveCards(
  state: KlondikeState,
  source: KlondikeSource,
  destination: KlondikeDestination,
  options?: KlondikeRuleOptions,
): KlondikeState | null {
  const resolved = resolveOptions(options);
  const payload = getMovePayload(state, source);

  if (!payload) {
    return null;
  }

  if (destination.zone === 'foundation') {
    if (payload.cards.length !== 1) {
      return null;
    }

    const targetPile = state.foundations[destination.pileIndex];

    if (!targetPile || !canPlaceOnFoundation(payload.cards[0], targetPile)) {
      return null;
    }
  }

  if (destination.zone === 'tableau') {
    const targetPile = state.tableau[destination.pileIndex];

    if (
      !targetPile ||
      !canPlaceOnTableau(payload.cards, targetPile, resolved.emptyTableauPolicy)
    ) {
      return null;
    }
  }

  const next = cloneKlondikeState(state);
  const mutablePayload = removeFromSource(next, source);

  if (!mutablePayload) {
    return null;
  }

  if (destination.zone === 'foundation') {
    next.foundations[destination.pileIndex].push(mutablePayload.cards[0]);
  } else {
    next.tableau[destination.pileIndex].push(
      ...mutablePayload.cards.map((card) => ({ ...card, faceUp: true })),
    );
  }

  next.completed = isWon(next);

  return next;
}

export function getLegalMoves(
  state: KlondikeState,
  options?: KlondikeRuleOptions,
): KlondikeMove[] {
  const resolved = resolveOptions(options);
  const moves: KlondikeMove[] = [];

  if (state.stock.length > 0) {
    moves.push({ kind: 'draw' });
  } else if (state.waste.length > 0) {
    moves.push({ kind: 'recycle' });
  }

  if (state.waste.length > 0) {
    const wasteSource: KlondikeSource = { zone: 'waste' };
    moves.push(...toMoves(wasteSource, getFoundationTargets(state, wasteSource)));
    moves.push(...toMoves(wasteSource, getTableauTargets(state, wasteSource, resolved.emptyTableauPolicy)));
  }

  for (let foundationIndex = 0; foundationIndex < state.foundations.length; foundationIndex += 1) {
    if (state.foundations[foundationIndex].length === 0) {
      continue;
    }

    const source: KlondikeSource = { zone: 'foundation', pileIndex: foundationIndex };
    moves.push(...toMoves(source, getTableauTargets(state, source, resolved.emptyTableauPolicy)));
  }

  for (let pileIndex = 0; pileIndex < state.tableau.length; pileIndex += 1) {
    const pile = state.tableau[pileIndex];

    for (let cardIndex = 0; cardIndex < pile.length; cardIndex += 1) {
      const card = pile[cardIndex];

      if (!card.faceUp || !isValidTableauRun(pile.slice(cardIndex))) {
        continue;
      }

      const source: KlondikeSource = { zone: 'tableau', pileIndex, cardIndex };

      if (cardIndex === pile.length - 1) {
        moves.push(...toMoves(source, getFoundationTargets(state, source)));
      }

      moves.push(...toMoves(source, getTableauTargets(state, source, resolved.emptyTableauPolicy)));
    }
  }

  return dedupeMoves(moves);
}

export function getHint(
  state: KlondikeState,
  mode: KlondikeHintMode = 'balanced',
  options?: KlondikeRuleOptions,
): KlondikeHint | null {
  const hints = getHints(state, mode, options);
  const best = hints[0];

  if (!best) {
    return null;
  }

  return best;
}

export function getHints(
  state: KlondikeState,
  mode: KlondikeHintMode = 'balanced',
  options?: KlondikeRuleOptions,
): KlondikeHint[] {
  return getLegalMoves(state, options)
    .map((move) => scoreMove(state, move, mode))
    .sort((left, right) => right.score - left.score)
    .map((candidate) => ({
      move: candidate.move,
      label: candidate.label,
    }));
}

export function canAutoComplete(state: KlondikeState, options?: KlondikeRuleOptions): boolean {
  const resolved = resolveOptions(options);
  if (state.stock.length > 0 || !allTableauCardsFaceUp(state)) {
    return false;
  }

  const moves = getLegalMoves(state, resolved);
  const foundationMoves = moves.filter(isFoundationMove);
  const nonFoundationMoves = moves.filter(
    (move) =>
      move.kind !== 'move' ||
      (move.destination.zone !== 'foundation' &&
        !(move.destination.zone === 'tableau' && state.tableau[move.destination.pileIndex].length === 0)),
  );

  return foundationMoves.length > 0 && nonFoundationMoves.length === 0;
}

export function runAutoComplete(state: KlondikeState, options?: KlondikeRuleOptions): KlondikeState {
  const resolved = resolveOptions(options);
  let next = cloneKlondikeState(state);
  let advanced = true;

  while (advanced) {
    advanced = false;

    const foundationMove = getLegalMoves(next, resolved).find(isFoundationMove);

    if (foundationMove) {
      next = applyKlondikeMove(next, foundationMove, resolved);
      advanced = true;
    }
  }

  return next;
}

export function isWon(state: KlondikeState): boolean {
  return state.foundations.every((pile) => pile.length === 13);
}

export function getPreferredDestination(
  state: KlondikeState,
  source: KlondikeSource,
  options?: KlondikeRuleOptions,
): KlondikeDestination | null {
  const resolved = resolveOptions(options);
  const foundation = getFoundationTargets(state, source)[0];

  if (foundation) {
    return foundation;
  }

  const tableauTargets = getTableauTargets(state, source, resolved.emptyTableauPolicy);

  return tableauTargets.length === 1 ? tableauTargets[0] : null;
}

export function describeCard(card: { rank: number; suit: string }): string {
  return `${rankLabel(card.rank as never)}${getSuitSymbol(card.suit)}`;
}

function moveCardsLabel(source: KlondikeSource, destination: KlondikeDestination, cards: { rank: number; suit: string }[]): string {
  if (source.zone === 'waste') {
    return `Move ${describeCard(cards[0])} from waste to ${destination.zone} ${destination.pileIndex + 1}`;
  }

  if (source.zone === 'foundation') {
    return `Move ${describeCard(cards[0])} from foundation ${source.pileIndex + 1} to tableau ${destination.pileIndex + 1}`;
  }

  if (destination.zone === 'foundation') {
    return `Promote ${describeCard(cards[0])} to foundation ${destination.pileIndex + 1}`;
  }

  return `Move ${describeCard(cards[0])} stack to tableau ${destination.pileIndex + 1}`;
}

function scoreMove(
  state: KlondikeState,
  move: KlondikeMove,
  mode: KlondikeHintMode,
): MoveCandidate {
  if (move.kind === 'draw') {
    return {
      move,
      score: mode === 'foundation-first' ? 5 : 15,
      label: 'Draw cards from stock',
    };
  }

  if (move.kind === 'recycle') {
    return {
      move,
      score: 3,
      label: 'Recycle waste back into stock',
    };
  }

  const payload = getMovePayload(state, move.source);

  if (!payload) {
    return {
      move,
      score: Number.NEGATIVE_INFINITY,
      label: 'No legal move available',
    };
  }

  let score = 20;

  if (move.destination.zone === 'foundation') {
    score += mode === 'foundation-first' ? 120 : 70;
  }

  if (move.destination.zone === 'tableau') {
    score += mode === 'mobility' ? 80 : 45;
  }

  if (move.source.zone === 'tableau') {
    const sourcePile = state.tableau[move.source.pileIndex];
    const revealsHidden =
      move.source.cardIndex > 0 &&
      sourcePile[move.source.cardIndex - 1] &&
      !sourcePile[move.source.cardIndex - 1].faceUp;

    if (revealsHidden) {
      score += 110;
    }

    if (move.destination.zone === 'tableau' && state.tableau[move.destination.pileIndex].length === 0) {
      score += 25;
    }
  }

  if (move.source.zone === 'foundation') {
    score -= 60;
  }

  if (move.source.zone === 'waste' && move.destination.zone === 'tableau') {
    score += 25;
  }

  return {
    move,
    score,
    label: moveCardsLabel(move.source, move.destination, payload.cards),
  };
}

function getMovePayload(
  state: KlondikeState,
  source: KlondikeSource,
): { cards: KlondikeTableauCard[] } | { cards: KlondikeState['stock'] } | null {
  if (source.zone === 'waste') {
    const card = state.waste[state.waste.length - 1];
    return card ? { cards: [card] } : null;
  }

  if (source.zone === 'foundation') {
    const pile = state.foundations[source.pileIndex];
    const card = pile?.[pile.length - 1];
    return card ? { cards: [card] } : null;
  }

  const pile = state.tableau[source.pileIndex];

  if (!pile || source.cardIndex < 0 || source.cardIndex >= pile.length) {
    return null;
  }

  const cards = pile.slice(source.cardIndex);

  if (!cards.every((card) => card.faceUp) || !isValidTableauRun(cards)) {
    return null;
  }

  return { cards };
}

function removeFromSource(
  state: MutableKlondikeState,
  source: KlondikeSource,
): { cards: KlondikeTableauCard[] } | null {
  if (source.zone === 'waste') {
    const card = state.waste.pop();
    return card ? { cards: [{ ...card, faceUp: true }] } : null;
  }

  if (source.zone === 'foundation') {
    const card = state.foundations[source.pileIndex]?.pop();
    return card ? { cards: [{ ...card, faceUp: true }] } : null;
  }

  const pile = state.tableau[source.pileIndex];

  if (!pile) {
    return null;
  }

  const cards = pile.splice(source.cardIndex);

  if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
    pile[pile.length - 1] = {
      ...pile[pile.length - 1],
      faceUp: true,
    };
  }

  return { cards };
}

function getFoundationTargets(state: KlondikeState, source: KlondikeSource): KlondikeDestination[] {
  const payload = getMovePayload(state, source);

  if (!payload || payload.cards.length !== 1) {
    return [];
  }

  return state.foundations.flatMap((pile, pileIndex) =>
    canPlaceOnFoundation(payload.cards[0], pile)
      ? [{ zone: 'foundation' as const, pileIndex }]
      : [],
  );
}

function getTableauTargets(
  state: KlondikeState,
  source: KlondikeSource,
  emptyTableauPolicy: KlondikeEmptyTableauPolicy,
): KlondikeDestination[] {
  const payload = getMovePayload(state, source);

  if (!payload) {
    return [];
  }

  return state.tableau.flatMap((pile, pileIndex) => {
    if (source.zone === 'tableau' && source.pileIndex === pileIndex) {
      return [];
    }

    return canPlaceOnTableau(payload.cards, pile, emptyTableauPolicy)
      ? [{ zone: 'tableau' as const, pileIndex }]
      : [];
  });
}

function canPlaceOnFoundation(
  card: { suit: string; rank: number },
  pile: Array<{ suit: string; rank: number }>,
): boolean {
  if (pile.length === 0) {
    return card.rank === 1;
  }

  const top = pile[pile.length - 1];
  return top.suit === card.suit && top.rank + 1 === card.rank;
}

function canPlaceOnTableau(
  cards: Array<{ color: string; rank: number }>,
  pile: Array<{ color: string; rank: number }>,
  emptyTableauPolicy: KlondikeEmptyTableauPolicy,
): boolean {
  const leadCard = cards[0];

  if (!leadCard) {
    return false;
  }

  if (pile.length === 0) {
    return emptyTableauPolicy === 'any' || leadCard.rank === 13;
  }

  const top = pile[pile.length - 1];
  return top.color !== leadCard.color && top.rank === leadCard.rank + 1;
}

function isValidTableauRun(cards: Array<{ faceUp?: boolean; color: string; rank: number }>): boolean {
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];

    if (card.faceUp === false) {
      return false;
    }

    const next = cards[index + 1];

    if (!next) {
      continue;
    }

    if (card.color === next.color || card.rank !== next.rank + 1) {
      return false;
    }
  }

  return true;
}

function allTableauCardsFaceUp(state: KlondikeState): boolean {
  return state.tableau.every((pile) => pile.every((card) => card.faceUp));
}

function isFoundationMove(move: KlondikeMove): move is Extract<KlondikeMove, { kind: 'move' }> {
  return move.kind === 'move' && move.destination.zone === 'foundation';
}

function dedupeMoves(moves: KlondikeMove[]): KlondikeMove[] {
  const seen = new Set<string>();

  return moves.filter((move) => {
    const key = JSON.stringify(move);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function toMoves(source: KlondikeSource, destinations: KlondikeDestination[]): KlondikeMove[] {
  return destinations.map((destination) => ({
    kind: 'move' as const,
    source,
    destination,
  }));
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function recycleWasteIntoStock<T>(waste: T[], drawCount: number): T[] {
  const groups: T[][] = [];

  for (let index = 0; index < waste.length; index += drawCount) {
    groups.push(waste.slice(index, index + drawCount));
  }

  return groups.reverse().flat();
}

function getSuitSymbol(suit: string): string {
  if (suit === 'hearts') {
    return '♥';
  }

  if (suit === 'diamonds') {
    return '♦';
  }

  if (suit === 'spades') {
    return '♠';
  }

  return '♣';
}
