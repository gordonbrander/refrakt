// Curated entry point. Re-exports the primary constructors and core types.
// Long-tail helpers (`withLogging`, `untrack`, `noFx`, the `iter` utilities)
// are available from their respective subpath modules, e.g. `refrakt/iter.js`.

// Signals
export { signal, computed, effect, Signal } from "./signal.js";
export type { AnySignal, Cleanup } from "./signal.js";

// Reducer
export { reducer } from "./reducer.js";
export type { Reducer, ReducerSignal } from "./reducer.js";

// Store
export { store, tx } from "./store.js";
export type { StoreSignal, Update, Tx, Fx } from "./store.js";

// Scope
export { scope } from "./scope.js";

// Send
export { forward } from "./send.js";
export type { Send, SendableSignal } from "./send.js";

// Exhaustiveness
export { assertNever, NeverError } from "./never.js";
