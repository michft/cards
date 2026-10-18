import { getCardColor, SUITS, type PersistedGameEnvelope } from '@mumscards/engine-core';
import { normalizeClockState } from '@mumscards/game-clock';

import type { GameStateMap, GameVariant, SavedStateSnapshot } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integerIn(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function isCard(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()
    || !integerIn(value.rank, 1, 13)) return false;
  const suit = SUITS.find((candidate) => candidate === value.suit);
  return suit !== undefined && value.color === getCardColor(suit);
}

function isFaceUpCard(value: unknown): boolean {
  return isRecord(value) && isCard(value) && typeof value.faceUp === 'boolean';
}

function isNullableCard(value: unknown): boolean {
  return value === null || isCard(value);
}

function isArrayOf(value: unknown, validate: (entry: unknown) => boolean, length?: number): value is unknown[] {
  return Array.isArray(value) && (length === undefined || value.length === length) && value.every(validate);
}

function isPile(value: unknown): boolean {
  return isArrayOf(value, isCard);
}

function isPiles(value: unknown, length?: number, faceUp = false): boolean {
  return isArrayOf(value, (pile) => isArrayOf(pile, faceUp ? isFaceUpCard : isCard), length);
}

function optionalChoice(value: unknown, choices: readonly unknown[]): boolean {
  return value === undefined || choices.includes(value);
}

function isClockSource(value: unknown): boolean {
  return value === undefined || value === null || (isRecord(value)
    && ((value.zone === 'stock' && integerIn(value.pileIndex, 0, 3))
      || (value.zone === 'hour' && integerIn(value.hourIndex, 0, 11))));
}

function isClockShape(state: Record<string, unknown>): boolean {
  return isPiles(state.hours, 12)
    && (state.stockPiles === undefined ? isPile(state.stock) : isPiles(state.stockPiles, 4))
    && (state.stock === undefined || isPile(state.stock))
    && isNullableCard(state.activeCard)
    && isClockSource(state.activeSource)
    && (state.activeStockPileIndex === undefined || state.activeStockPileIndex === null
      || integerIn(state.activeStockPileIndex, 0, 3))
    && (state.completedStockPiles === undefined
      || (isArrayOf(state.completedStockPiles, (index) => integerIn(index, 0, 3))
        && new Set(state.completedStockPiles).size === state.completedStockPiles.length))
    && isArrayOf(state.kings, (card) => isRecord(card) && isCard(card) && card.rank === 13)
    && state.kings.length <= 4
    && (state.stockPiles !== undefined
      || (state.stock as unknown[]).length + state.kings.length + (state.activeCard === null ? 0 : 1) <= 4)
    && (state.returnedKingIds === undefined || isArrayOf(state.returnedKingIds,
      (id) => typeof id === 'string' && id.length > 0))
    && (state.placedCardIds === undefined || isArrayOf(state.placedCardIds,
      (id) => typeof id === 'string' && id.length > 0))
    && typeof state.won === 'boolean'
    && (state.lost === undefined || typeof state.lost === 'boolean');
}

export function isGameState<Variant extends GameVariant>(
  variant: Variant,
  value: unknown,
): value is GameStateMap[Variant] {
  if (!isRecord(value) || value.gameId !== variant) return false;

  switch (variant) {
    case 'klondike':
      return (value.drawCount === 1 || value.drawCount === 3)
        && optionalChoice(value.emptyTableauPolicy, ['any', 'king-only'])
        && typeof value.completed === 'boolean'
        && isPile(value.stock) && isPile(value.waste)
        && isPiles(value.foundations, 4) && isPiles(value.tableau, 7, true);
    case 'freecell':
      return optionalChoice(value.tableauBuildPolicy, ['any', 'red-black', 'alternate-red-black', 'suit-matching'])
        && typeof value.won === 'boolean' && isPiles(value.foundations, 4)
        && isArrayOf(value.freeCells, isNullableCard, 4) && isPiles(value.tableau, 8);
    case 'spider':
      return typeof value.suitMode === 'string'
        && ['spades-only', 'hearts-only', 'red-black', 'all-suits'].includes(value.suitMode)
        && integerIn(value.completedRuns, 0, 8)
        && isPiles(value.foundations) && (value.foundations as unknown[]).length <= 8
        && isPile(value.stock) && isPiles(value.tableau, 10, true);
    case 'pyramid':
      return isArrayOf(value.tableau, (row) => isArrayOf(row, isNullableCard), 7)
        && value.tableau.every((row, index) => (row as unknown[]).length === index + 1)
        && isPile(value.stock) && isPile(value.waste)
        && integerIn(value.removedCount, 0, 52) && integerIn(value.recyclesUsed, 0)
        && integerIn(value.maxRecycles, 0) && typeof value.won === 'boolean';
    case 'clock':
      return isClockShape(value);
    default:
      return false;
  }
}

function parseState<Variant extends GameVariant>(variant: Variant, value: unknown): GameStateMap[Variant] | null {
  if (!isGameState(variant, value)) return null;
  if (variant !== 'clock') return value;

  const clock = normalizeClockState(value as GameStateMap['clock']);
  // A chain without a recoverable origin cannot return its King safely.
  if (!isClockShape(clock) || (clock.activeCard !== null && clock.activeStockPileIndex === null)) return null;
  return clock as GameStateMap[Variant];
}

export function parseGameEnvelope<Variant extends GameVariant>(
  variant: Variant,
  value: unknown,
): PersistedGameEnvelope<GameStateMap[Variant]> | null {
  if (!isRecord(value) || value.gameId !== variant || typeof value.updatedAt !== 'string') return null;
  const state = parseState(variant, value.state);
  if (!state) return null;

  const result: PersistedGameEnvelope<GameStateMap[Variant]> = { gameId: variant, updatedAt: value.updatedAt, state };
  if (isRecord(value.history)) {
    const initial = parseState(variant, value.history.initial);
    if (initial) {
      const parsePositions = (positions: unknown) => Array.isArray(positions)
        ? positions.flatMap((position: unknown) => {
          const parsed = parseState(variant, position);
          return parsed ? [parsed] : [];
        }) : [];
      result.history = {
        initial,
        past: parsePositions(value.history.past).slice(-50),
        future: parsePositions(value.history.future).slice(0, 50),
      };
    }
  }
  return result;
}

export function parseSavedSnapshot<Variant extends GameVariant>(
  variant: Variant,
  value: unknown,
): SavedStateSnapshot<GameStateMap[Variant]> | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim() || typeof value.label !== 'string') return null;
  const envelope = parseGameEnvelope(variant, value);
  return envelope ? { ...envelope, id: value.id, label: value.label } : null;
}
