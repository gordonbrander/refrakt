import { type Store } from "../store.js";
import { peek } from "../signal.js";

export type Fx<Model, Action> = (
  state: () => Model,
  action: Action,
) => AsyncGenerator<Action>;

const forkFx = async <Action>(
  generator: AsyncGenerator<Action>,
  send: (action: Action) => void,
) => {
  try {
    for await (const action of generator) {
      send(action);
    }
  } catch (error) {
    console.warn("Error in fx", error);
  }
};

/**
 * Fx middleware provides managed effects modeled as async generators.
 * Each incoming action spawns a new forked fx at the top level that can yield
 * zero or more actions.
 *
 * Effects have access to a getter function for the current state of the store
 * allowing them to make decisions about when to continue and when to exit.
 * Cancellable tasks can be modeled by recording relevant state on the model and
 * checking the current state within the generator.
 *
 * @usage
 * ```ts
 * import { store, pipe, middleware } from "refrakt";
 *
 * async function* effects(state: () => Model, action: Action) {
 *    if (action.type === "some-action") {
 *      yield { type: "some-other-action", payload: "some-payload" };
 *    }
 * }
 *
 * const myStore = pipe(
 *   store(update, initial),
 *   middleware.fx(effects),
 * );
 * ```
 */
export const fx = <Model, Action>(
  fx: Fx<Model, Action>,
) =>
(
  { get, send }: Store<Model, Action>,
): Store<Model, Action> => {
  const peekState = () => peek(get);

  const sendWithFx = (action: Action) => {
    // First, apply the action to update the state
    send(action);
    // Then generate and fork the effect
    const effect = fx(peekState, action);
    forkFx(effect, sendWithFx);
  };

  return {
    get,
    send: sendWithFx,
  };
};
