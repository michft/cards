import type { PlayingCard } from '@mumscards/engine-core';
import { applyKlondikeMove, type KlondikeDestination, type KlondikeSource, type KlondikeState } from '@mumscards/game-klondike';
import { applyFreeCellMove, type FreeCellDestination, type FreeCellSource, type FreeCellState } from '@mumscards/game-freecell';

type Rejection = { code: string; message: string };

export function getKlondikeRejection(
  state: KlondikeState,
  source: KlondikeSource,
  destination: KlondikeDestination | null,
): Rejection | null {
  const cards = source.zone === 'tableau'
    ? state.tableau[source.pileIndex]?.slice(source.cardIndex) ?? []
    : source.zone === 'waste' ? state.waste.slice(-1) : state.foundations[source.pileIndex]?.slice(-1) ?? [];
  if (!cards.length) return { code: 'source-empty', message: 'There is no card here to move.' };
  if (source.zone === 'tableau') {
    if (state.tableau[source.pileIndex].slice(source.cardIndex).some((card) => !card.faceUp)) {
      return { code: 'source-hidden', message: 'Uncover face-down cards before moving them.' };
    }
    if (!validRun(cards, 'alternate-red-black')) {
      return { code: 'source-run', message: 'Move a descending run of alternating red and black cards.' };
    }
  }
  if (!destination) return { code: 'source-blocked', message: 'This card or run has no legal destination. Try another card or draw from the stock.' };
  if (JSON.stringify(applyKlondikeMove(state, { kind: 'move', source, destination })) !== JSON.stringify(state)) return null;
  if (destination.zone === 'foundation') return foundationRejection(cards, state.foundations[destination.pileIndex]);
  const pile = state.tableau[destination.pileIndex];
  if (!pile?.length && state.emptyTableauPolicy === 'king-only' && cards[0].rank !== 13) {
    return { code: 'tableau-king', message: 'Only a King or a run starting with a King can fill an empty column in this deal.' };
  }
  return buildRejection(cards[0], pile?.at(-1), 'alternate-red-black');
}

export function getFreeCellRejection(
  state: FreeCellState,
  source: FreeCellSource,
  destination: FreeCellDestination | null,
): Rejection | null {
  const policy = state.tableauBuildPolicy ?? 'alternate-red-black';
  const cellCard = source.zone === 'cell' ? state.freeCells[source.cellIndex] : null;
  const cards = source.zone === 'tableau'
    ? state.tableau[source.pileIndex]?.slice(source.cardIndex) ?? []
    : cellCard ? [cellCard] : [];
  if (!cards.length) return { code: 'source-empty', message: 'There is no card here to move.' };
  if (!validRun(cards, policy)) {
    return { code: 'source-run', message: policy === 'suit-matching'
      ? 'Move a descending run of cards in the same suit.'
      : policy === 'any' ? 'Move a descending run of cards, one rank at a time.'
        : 'Move a descending run of alternating red and black cards.' };
  }
  if (!destination) return { code: 'source-blocked', message: 'This card or run has no legal destination. Free a cell or column, or try another card.' };
  if (JSON.stringify(applyFreeCellMove(state, source, destination)) !== JSON.stringify(state)) return null;
  if (destination.zone === 'cell') {
    if (cards.length !== 1) return { code: 'cell-single', message: 'A free cell holds one card. Move the bottom card on its own.' };
    return { code: 'cell-occupied', message: 'This free cell is occupied. Choose an empty free cell.' };
  }
  if (destination.zone === 'foundation') return foundationRejection(cards, state.foundations[destination.pileIndex]);
  const freeCells = state.freeCells.filter((card) => card === null).length;
  const auxiliaryColumns = state.tableau.filter((pile, index) => !pile.length && index !== destination.pileIndex).length;
  const capacity = (freeCells + 1) * 2 ** auxiliaryColumns;
  if (cards.length > capacity) return { code: 'tableau-capacity', message: `Only ${capacity} ${capacity === 1 ? 'card can' : 'cards can'} move together with the available free cells and spare columns. Free more space or move a shorter run.` };
  return buildRejection(cards[0], state.tableau[destination.pileIndex]?.at(-1), policy);
}

function foundationRejection(cards: PlayingCard[], pile: PlayingCard[] | undefined): Rejection {
  if (cards.length !== 1) return { code: 'foundation-single', message: 'Move one card at a time to a foundation.' };
  if (!pile?.length) return { code: 'foundation-ace', message: 'An empty foundation must start with an Ace.' };
  if (pile.at(-1)?.suit !== cards[0].suit) return { code: 'foundation-suit', message: 'Build each foundation in one suit. Choose the foundation matching this card.' };
  return { code: 'foundation-rank', message: 'Foundations build up one rank at a time, from Ace to King.' };
}

function validRun(cards: PlayingCard[], policy: string): boolean {
  return cards.every((card, index) => !cards[index + 1] || !buildRejection(cards[index + 1], card, policy));
}

function buildRejection(card: PlayingCard, top: PlayingCard | undefined, policy: string): Rejection | null {
  if (!top) return null;
  if (top.rank !== card.rank + 1) return { code: 'tableau-rank', message: 'Place this card on a card exactly one rank higher.' };
  if (policy === 'suit-matching' && top.suit !== card.suit) return { code: 'tableau-suit', message: 'This deal builds columns in the same suit.' };
  if (policy !== 'any' && policy !== 'suit-matching' && top.color === card.color) return { code: 'tableau-color', message: 'Columns must alternate red and black cards in this deal.' };
  return null;
}
