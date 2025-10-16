import { type Store } from "../store.ts";
import { peek } from "../signals.ts";

export type Fx<Model, Msg> = (
  state: () => Model,
  msg: Msg,
) => AsyncGenerator<Msg>;

const forkFx = async <Msg>(
  generator: AsyncGenerator<Msg>,
  send: (msg: Msg) => void,
) => {
  try {
    for await (const msg of generator) {
      send(msg);
    }
  } catch (error) {
    console.warn("Error in fx", error);
  }
};

/**
 * Fx middleware provides managed effects modeled as async generators.
 * Each incoming msg spawns a new forked fx at the top level that can yield
 * zero or more messages.
 *
 * Effects have access to a getter function for the current state of the store
 * allowing them to make decisions about when to continue and when to exit.
 * Cancellable tasks can be modeled by recording relevant state on the model and
 * checking the current state within the generator.
 *
 * @usage
 * ```ts
 * import { store, pipe, middleware } from "signal-store";
 *
 * async function* effects(state: () => Model, msg: Msg) {
 *    if (msg.type === "some-action") {
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
export const fx = <Model, Msg>(
  fx: Fx<Model, Msg>,
) =>
(
  { get, send }: Store<Model, Msg>,
): Store<Model, Msg> => {
  const peekState = () => peek(get);

  const sendWithFx = (msg: Msg) => {
    // First, apply the message to update the state
    send(msg);
    // Then generate and fork the effect
    const effect = fx(peekState, msg);
    forkFx(effect, sendWithFx);
  };

  return {
    get,
    send: sendWithFx,
  };
};
