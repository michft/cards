import { describe, expect, it } from 'vitest';
import { createDeck, type PlayingCard } from '@mumscards/engine-core';
import { applyFreeCellMove, createFreeCellGame, type FreeCellState } from '@mumscards/game-freecell';
import { createKlondikeGame, getLegalMoves, type KlondikeState } from '@mumscards/game-klondike';
import { getFreeCellRejection, getKlondikeRejection } from './move-rejection-reasons';

function card(suit: PlayingCard['suit'], rank: number) {
  const result = createDeck('feedback').find((item) => item.suit === suit && item.rank === rank);
  if (!result) throw new Error('Missing fixture card');
  return { ...result, faceUp: true };
}

function klondike(): KlondikeState {
  return { ...createKlondikeGame(() => 0.5), stock: [], waste: [], foundations: [[], [], [], []],
    tableau: [[card('spades', 7)], [card('hearts', 9)], [card('clubs', 8)], [], [], [], []] };
}
function freecell(): FreeCellState {
  return { ...createFreeCellGame(() => 0.5), foundations: [[], [], [], []], freeCells: [null, null, null, null],
    tableau: [[card('spades', 7), card('hearts', 6)], [card('hearts', 8)], [card('clubs', 8)], [], [], [], [], []] };
}
const tableauSource = { zone: 'tableau', pileIndex: 0, cardIndex: 0 } as const;

describe('Klondike rejected move explanations', () => {
  it('distinguishes rank, colour and King-only empty-column failures using the deal rules', () => {
    const state = klondike();
    expect(getKlondikeRejection(state, tableauSource, { zone: 'tableau', pileIndex: 1 })?.code).toBe('tableau-rank');
    expect(getKlondikeRejection(state, tableauSource, { zone: 'tableau', pileIndex: 2 })?.code).toBe('tableau-color');
    expect(getKlondikeRejection(state, tableauSource, { zone: 'tableau', pileIndex: 3 })).toBeNull();
    state.emptyTableauPolicy = 'king-only';
    expect(getKlondikeRejection(state, tableauSource, { zone: 'tableau', pileIndex: 3 })?.code).toBe('tableau-king');
  });
  it('explains hidden cards and malformed runs before destination rules', () => {
    const state = klondike();
    state.tableau[0][0].faceUp = false;
    expect(getKlondikeRejection(state, tableauSource, { zone: 'foundation', pileIndex: 0 })?.code).toBe('source-hidden');
    state.tableau[0][0].faceUp = true;
    state.tableau[0].push(card('spades', 6));
    expect(getKlondikeRejection(state, tableauSource, null)?.code).toBe('source-run');
  });
  it('explains foundations needing a single card, an Ace, matching suit or next rank', () => {
    const state = klondike();
    const destination = { zone: 'foundation', pileIndex: 0 } as const;
    expect(getKlondikeRejection(state, tableauSource, destination)?.code).toBe('foundation-ace');
    state.tableau[0] = [card('spades', 3)];
    state.foundations[0] = [card('hearts', 1)];
    expect(getKlondikeRejection(state, tableauSource, destination)?.code).toBe('foundation-suit');
    state.foundations[0] = [card('spades', 1)];
    expect(getKlondikeRejection(state, tableauSource, destination)?.code).toBe('foundation-rank');
    state.tableau[0].push(card('hearts', 2));
    expect(getKlondikeRejection(state, tableauSource, destination)?.code).toBe('foundation-single');
  });
  it('never rejects an engine-approved move', () => {
    const state = createKlondikeGame(() => 0.5);
    for (const move of getLegalMoves(state)) {
      if (move.kind === 'move') expect(getKlondikeRejection(state, move.source, move.destination)).toBeNull();
    }
  });
});

describe('FreeCell rejected move explanations', () => {
  it('distinguishes occupied cells and multi-card cell moves', () => {
    const state = freecell();
    const destination = { zone: 'cell', cellIndex: 0 } as const;
    expect(getFreeCellRejection(state, tableauSource, destination)?.code).toBe('cell-single');
    state.tableau[0] = [card('hearts', 6)];
    state.freeCells[0] = card('spades', 1);
    expect(getFreeCellRejection(state, tableauSource, destination)?.code).toBe('cell-occupied');
  });
  it('uses the saved deal build policy when explaining a bad run or destination', () => {
    const state = freecell();
    state.tableauBuildPolicy = 'suit-matching';
    expect(getFreeCellRejection(state, tableauSource, null)?.message).toContain('same suit');
    state.tableau[0] = [card('spades', 7)];
    expect(getFreeCellRejection(state, tableauSource, { zone: 'tableau', pileIndex: 1 })?.code).toBe('tableau-suit');
    state.tableauBuildPolicy = 'any';
    expect(getFreeCellRejection(state, tableauSource, { zone: 'tableau', pileIndex: 2 })).toBeNull();
    state.tableau[0].push(card('clubs', 5));
    expect(getFreeCellRejection(state, tableauSource, null)?.message).toContain('one rank at a time');
  });
  it('counts free cells and auxiliary empty columns, excluding the destination', () => {
    const state = freecell();
    state.freeCells = Array.from({ length: 4 }, () => card('clubs', 2));
    state.tableau = [state.tableau[0], [card('hearts', 8)], [], ...Array.from({ length: 5 }, () => [card('clubs', 10)])];
    expect(getFreeCellRejection(state, tableauSource, { zone: 'tableau', pileIndex: 1 })).toBeNull();
    const reason = getFreeCellRejection(state, tableauSource, { zone: 'tableau', pileIndex: 2 });
    expect(reason?.code).toBe('tableau-capacity');
    expect(reason?.message).toContain('Only 1 card can');
  });
  it('never rejects an engine-approved move for any build policy', () => {
    for (const tableauBuildPolicy of ['alternate-red-black', 'red-black', 'suit-matching', 'any'] as const) {
      const state = { ...freecell(), tableauBuildPolicy };
      for (let pileIndex = 0; pileIndex < state.tableau.length; pileIndex += 1) {
        for (let cardIndex = 0; cardIndex < state.tableau[pileIndex].length; cardIndex += 1) {
          const source = { zone: 'tableau', pileIndex, cardIndex } as const;
          const destinations = [
            ...state.tableau.map((_, pileIndex) => ({ zone: 'tableau' as const, pileIndex })),
            ...state.foundations.map((_, pileIndex) => ({ zone: 'foundation' as const, pileIndex })),
            ...state.freeCells.map((_, cellIndex) => ({ zone: 'cell' as const, cellIndex })),
          ];
          for (const destination of destinations) {
            const next = applyFreeCellMove(state, source, destination);
            if (JSON.stringify(next) !== JSON.stringify(state)) expect(getFreeCellRejection(state, source, destination)).toBeNull();
          }
        }
      }
    }
  });
});
