import { signal } from "./signal.js";
import { type SendableSignal } from "./send.js";

export type Reducer<Model, Action> = (
  state: Model,
  action: Action,
) => Model;

/**
 * Create a signals-based reducer that updates through the provided `step`
 * reducer function.
 * @arg step - The reducer function that updates the store state.
 * @arg initial - The initial state of the store.
 * @returns A store object with a signal for the state and a send method.
 */
export const reducer = <Model, Action>(
  step: Reducer<Model, Action>,
  initial: Model,
): SendableSignal<Model, Action> => {
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
    const next = step($state.get(), action);
    $state.set(next);
  };

  return { get, send };
};

const alwaysLog = () => true;

/**
 * Wrap update function with logging.
 * @param update - The reduer function to wrap.
 * @param options - options object
 * @param options.name - Name of the reducer in log messages. Defaults to "reducer".
 * @param options.log - A function that returns `true` if logging should be enabled.
 * @returns A new update function that logs state transitions.
 */
export const withLogging = <Model, Action>(
  update: Reducer<Model, Action>,
  {
    name = "reducer",
    log = alwaysLog,
  }: {
    name?: string;
    log?: () => boolean
  } = {}
): Reducer<Model, Action> => {
  return (state: Model, action: Action) => {
    if (log()) {
      console.debug("<-", name, action);
    }
    const next = update(state, action);
    if (log()) {
      console.debug("->", name, next);
    }
    return next;
  };
}

/**
 * Convenience function for logging unknown actions in the default arm
 * of a reducer.
 *
 * Because `action` is of type `never`, Typescript will show an error under
 * this argument if the switch is not exhaustive.
 */
export const unknown = <Model>(
  state: Model,
  action: never,
): Model => {
  console.warn("Unknown action", action);
  return state;
};
