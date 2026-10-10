import type { PersistedGameEnvelope } from '@mumscards/engine-core';

import { cloneGameState } from './clone-game-state';

export type GameHistory<TState extends object> = {
  initial: TState;
  past: TState[];
  present: TState;
  future: TState[];
};

const HISTORY_LIMIT = 50;

export function createGameHistory<TState extends object>(state: TState): GameHistory<TState> {
  return { initial: cloneGameState(state), past: [], present: cloneGameState(state), future: [] };
}

function isState(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function restoreGameHistory<TState extends object>(
  envelope: PersistedGameEnvelope<TState>,
): GameHistory<TState> {
  const history = envelope.history;
  if (!history || !isState(history.initial)
    || !Array.isArray(history.past) || !history.past.every(isState)
    || !Array.isArray(history.future) || !history.future.every(isState)) {
    // Legacy saves have no original deal; their saved position is the only restart point available.
    return createGameHistory(envelope.state);
  }

  return cloneGameState({
    initial: history.initial,
    past: history.past.slice(-HISTORY_LIMIT),
    present: envelope.state,
    future: history.future.slice(0, HISTORY_LIMIT),
  });
}

export function persistGameHistory<TState extends object>(
  gameId: string,
  history: GameHistory<TState>,
  updatedAt = new Date().toISOString(),
): PersistedGameEnvelope<TState> {
  return cloneGameState({
    gameId,
    updatedAt,
    state: history.present,
    history: {
      initial: history.initial,
      past: history.past.slice(-HISTORY_LIMIT),
      future: history.future.slice(0, HISTORY_LIMIT),
    },
  });
}
