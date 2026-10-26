// Snapshot-based undo/redo. Graph operations are immutable, so each snapshot
// shares unchanged nodes with its neighbours and stays cheap.

export const MAX_HISTORY = 100;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Record a new state. `base` is the state to return to on undo; it defaults to
 * the current present, but a drag passes the position from before it started.
 */
export function push<T>(history: History<T>, next: T, base: T = history.present): History<T> {
  if (next === base) return next === history.present ? history : { ...history, present: next };
  return {
    past: [...history.past, base].slice(-MAX_HISTORY),
    present: next,
    future: [],
  };
}

/** Replace the present without recording it (used while a drag is in progress). */
export function replace<T>(history: History<T>, next: T): History<T> {
  return next === history.present ? history : { ...history, present: next };
}

export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  const [next, ...rest] = history.future;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}
