export type Orientation = 'portrait' | 'landscape';

export type PersistedGameEnvelope<TState extends object> = {
  gameId: string;
  updatedAt: string;
  state: TState;
};
