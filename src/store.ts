import { signal } from "./signal.js";
import { type ReducerSignal } from "./reducer.js";
export { type Send, forward, updateUnknown } from "./reducer.js";

/**
 * A transaction is a value that represents a state update and optional effects.
 */
export type Tx<Model, Action> = {
  state: Model;
  effects?: AsyncGenerator<Action>;
};

/** Create a transaction */
export const tx = <Model, Action>(
  state: Model,
  effects?: AsyncGenerator<Action>,
): Tx<Model, Action> => ({ state, effects });

export type Update<Model, Action, Context> = (
  state: Model,
  action: Action,
  context: Context,
) => Tx<Model, Action>;

export type Store<Model, Action> = ReducerSignal<Model, Action>;

/**
 * Create a signals-based store that updates through the provided `update`
 * reducer function.
 * @arg update - The reducer function that updates the store by returning
 *   a new state and optional effects.
 * @arg initial - The initial state of the store.
 * @arg context - The context object passed to the reducer function (optional)
 * @returns A store object with a signal for the state and a send method.
 */
export function store<Model, Action>(
  update: Update<Model, Action, void>,
  initial: Model,
): Store<Model, Action>;
export function store<Model, Action, Context>(
  update: Update<Model, Action, Context>,
  initial: Model,
  context: Context,
): Store<Model, Action>;
export function store<Model, Action, Context>(
  update: Update<Model, Action, Context>,
  initial: Model,
  context?: Context,
): Store<Model, Action> {
  const $state = signal(initial);

  const forkEffects = async (effects: AsyncGenerator<Action>) => {
    while (true) {
      const { value, done } = await effects.next(get());
      if (done) return;
      if (value != undefined) {
        send(value);
      }
    }
  };

  /**
   * Get the current state.
   * This method is hard-bound to the reducer so you can pass it around as a function.
   */
  const get = () => $state.get();

  /**
   * Send an action to the reducer.
   * This method is hard-bound to the reducer so you can pass it around as a function.
   */
  const send = (action: Action) => {
    const { state, effects } = update($state.get(), action, context!);
    $state.set(state);
    if (effects) {
      forkEffects(effects);
    }
  };

  return { get, send };
};
