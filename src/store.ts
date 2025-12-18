import { type AnySignal, signal } from "./signal.js";

/**
 * A tagged action. Convenience type for simple actions with a
 * `type` discriminator and a `value`.
 */
export type TaggedAction<Type extends string, Value> = {
  type: Type;
  value: Value;
};

/** Convencience factory for creating an action with a `type` discriminator and `value` */
export const action = <Type extends string, Value>(
  type: Type,
  value: Value,
): TaggedAction<Type, Value> => ({
  type,
  value,
});

export type Reducer<Model, Action> = (
  state: Model,
  action: Action,
) => Model;

export type Send<Action> = (action: Action) => void;

export type Store<Model, Action> = AnySignal<Model> & {
  send: Send<Action>;
};

/**
 * Create a signals-based store that updates through the provided `update`
 * reducer function.
 * @arg update - The reducer function that updates the store state.
 * @arg initial - The initial state of the store.
 * @returns A store object with a signal for the state and a send method.
 */
export const store = <Model, Action>(
  update: Reducer<Model, Action>,
  initial: Model,
): Store<Model, Action> => {
  const $state = signal(initial);

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
    const next = update($state.get(), action);
    $state.set(next);
  };

  return { get, send };
};

/**
 * Transform a send function so that it tags actions on the way out.
 * This can be useful for mapping actions from one component domain to another.
 */
export const forward = <ActionA, ActionB>(
  send: (action: ActionA) => void,
  tag: (action: ActionB) => ActionA,
) =>
  (action: ActionB): void => {
    send(tag(action));
  };

/**
 * Convenience function for logging unknown actions in the default arm
 * of a reducer.
 *
 * Because `action` is of type `never`, Typescript will show an error under
 * this argument if the switch is not exhaustive.
 */
export const updateUnknown = <Model>(
  state: Model,
  action: never,
): Model => {
  console.warn("Unknown action", action);
  return state;
};
