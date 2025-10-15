import type { Get, Middleware, Send } from "../store.ts";
import { peek } from "../signals.ts";

export type Fx<Model, Msg> = (
  state: Get<Model>,
  msg: Msg,
) => AsyncGenerator<Msg>;

const forkFx = async <Msg>(generator: AsyncGenerator<Msg>, send: Send<Msg>) => {
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
 * import { fx } from "signal-store/middleware/fx.ts";
 *
 * async function* effects(state: () => Model, msg: Msg) {
 *    if (msg.type === "some-action") {
 *      yield { type: "some-other-action", payload: "some-payload" };
 *    }
 * }
 *
 * const state = store(
 *   state,
 *   update,
 *   middleware: [fx(effects)];
 * );
 * ```
 */
export const fx = <Model, Msg>(
  fx: Fx<Model, Msg>,
): Middleware<Model, Msg> =>
(
  get: Get<Model>,
) => {
  const getUntracked = () => peek(get);

  return (next: Send<Msg>) => (msg: Msg) => {
    // First, apply the message to update the state
    next(msg);
    // Then generate and fork the fx
    const effect = fx(getUntracked, msg);
    forkFx(effect, next);
  };
};
