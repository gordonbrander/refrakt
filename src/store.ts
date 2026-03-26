import { signal } from "./signal.js";
import { type SendableSignal } from "./send.js";

/** Represents an fx that can be executed against a model state, yielding actions. */
export type Fx<Model, Action> = (state: () => Model) => AsyncGenerator<Action>;

/** A no-op fx that yields nothing. */
export async function* noFx<Action>(): AsyncGenerator<Action> {
  // Yield nothing
}

/**
 * A transaction is a value that represents a state update and optional fx.
 */
export type Tx<Model, Action> = {
  state: Model;
  fx: Fx<Model, Action>;
};

/** Create a transaction */
export const tx = <Model, Action>(
  state: Model,
  fx: Fx<Model, Action> = noFx<Action>,
): Tx<Model, Action> => ({ state, fx });

export type Update<Model, Action, Context> = (
  state: Model,
  action: Action,
  context: Context,
) => Tx<Model, Action>;

export type Store<Model, Action> = SendableSignal<Model, Action>;

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

  const forkFx = async (fx: Fx<Model, Action>) => {
    const generator = fx(get);
    while (true) {
      try {
        const { value, done } = await generator.next();

        if (done) {
          return;
        }

        if (value != undefined) {
          send(value);
        }
      } catch (e) {
        console.error("Error in effect", e);
        return;
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
    const { state, fx } = update($state.get(), action, context!);
    $state.set(state);
    forkFx(fx);
  };

  return { get, send };
}

const alwaysLog = () => true;

/**
 * Wrap update function with logging.
 * @param update - The update function to wrap.
 * @param options - options object
 * @param options.name - Name of the store in log messages. Defaults to "store".
 * @param options.log - A function that returns `true` if logging should be enabled.
 * @returns A new update function that logs state transitions.
 */
export const withLogging = <Model, Action, Context>(
  update: Update<Model, Action, Context>,
  {
    name = "store",
    log = alwaysLog,
  }: {
    name?: string;
    log?: () => boolean;
  } = {},
): Update<Model, Action, Context> => {
  return (state: Model, action: Action, context: Context) => {
    if (log()) {
      console.debug("<-", name, action);
    }
    const result = update(state, action, context);
    if (log()) {
      console.debug("->", name, result.state);
    }
    return result;
  };
};

/**
 * Convenience function for handling unreachable actions in the default arm
 * of a reducer.
 *
 * Because `action` is of type `never`, Typescript will show an error under
 * this argument if the switch is not exhaustive.
 */
export const unreachable = <Model, Action>(
  state: Model,
  action: never,
): Tx<Model, Action> => {
  console.error("Unreachable action", action);
  return tx(state);
};
