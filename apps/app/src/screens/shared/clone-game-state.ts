export function cloneGameState<T>(state: T): T {
  return JSON.parse(JSON.stringify(state)) as T;
}
