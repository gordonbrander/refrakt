import { Signal } from "signal-polyfill";
export * from "signal-polyfill";

export type AnySignal<T> = {
  get(): T;
};

let needsEnqueue = true;

const w = new Signal.subtle.Watcher(() => {
  if (needsEnqueue) {
    needsEnqueue = false;
    queueMicrotask(processPending);
  }
});

const processPending = () => {
  needsEnqueue = true;

  for (const s of w.getPending()) {
    s.get();
  }

  w.watch();
};

export type Cleanup = () => void;

/**
 * Creates a batcked effect that runs on next microtask whenever any dependent signals change
 * @returns a cleanup function that can be called to cancel the effect.
 */
export const effect = (callback: () => Cleanup | void): Cleanup => {
  let cleanup: Cleanup | void = undefined;

  const computed = new Signal.Computed(() => {
    cleanup?.();
    cleanup = callback();
  });

  w.watch(computed);
  computed.get();

  return () => {
    w.unwatch(computed);
    cleanup?.();
    cleanup = undefined;
  };
};

/** Convenience factory for a read-write signal (Signal.State) */
export const signal = <T>(value: T): Signal.State<T> => new Signal.State(value);

/** Convenience factory for a read-only computed signal (Signal.Computed) */
export const computed = <T>(callback: () => T): Signal.Computed<T> =>
  new Signal.Computed(callback);

/**
 * Peek at the value of a signal without tracking it.
 * Be careful with this function, it can lead to unsound code!
 */
export const peek = <T>(cb: () => T): T => Signal.subtle.untrack(cb);
