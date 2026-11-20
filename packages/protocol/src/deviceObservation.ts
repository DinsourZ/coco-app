// Adapted from CoCo OS platform/web/src/api/deviceObservation.ts (MIT).
// Removes Web DOM globals (document/navigator) so observation freshness checks
// work identically in React Native (AppState) and Node test environments.

export const DEVICE_READ_TIMEOUT_MS = 10_000;
export const DEVICE_OBSERVATION_MAX_AGE_MS = 20_000;

export interface ObservationClock {
  monotonicMs: number;
  wallMs: number;
}

export function observationClock(): ObservationClock {
  const monotonicMs =
    typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
  return { monotonicMs, wallMs: Date.now() };
}

export function withinObservationBudget(
  started: ObservationClock,
  budgetMs: number,
  now = observationClock(),
): boolean {
  // Monotonic clocks may pause during OS sleep; wall clocks may jump. Either
  // clock becoming inconsistent or exceeding the budget invalidates the snapshot.
  return [now.monotonicMs - started.monotonicMs, now.wallMs - started.wallMs].every(
    (age) => Number.isFinite(age) && age >= 0 && age < budgetMs,
  );
}

export interface ObservationEnvironmentState {
  isForeground: boolean;
  isOnline: boolean;
}

export function isObservationEnvironmentAvailable(state: ObservationEnvironmentState): boolean {
  return state.isForeground && state.isOnline;
}
