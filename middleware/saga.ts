import type { Get, Middleware, Send } from "../store.ts";
import { peek } from "../signals.ts";

export type Saga<Model, Msg> = (
  state: Get<Model>,
  msg: Msg,
) => AsyncGenerator<Msg>;

/**
 * Saga middleware provides managed effects modeled as async generators.
 * Each incoming msg spawns a new forked saga at the top level that can yield
 * zero or more messages.
 *
 * Sagas have access to a getter function for the current state of the store
 * allowing them to make decisions about when to continue and when to exit.
 * Cancellable tasks can be modeled by recording relevant state on the model and
 * checking the current state within the generator.
 *
 * @usage
 * ```ts
 * import { saga } from "signal-store/middleware/saga.ts";
 *
 * async function* fx(state: () => Model, msg: Msg) {
 *    if (msg.type === "some-action") {
 *      yield { type: "some-other-action", payload: "some-payload" };
 *    }
 * }
 *
 * const state = store(
 *   state,
 *   update,
 *   middleware: [saga(fx)];
 * );
 * ```
 */
export const saga = <Model, Msg>(
  saga: Saga<Model, Msg>,
): Middleware<Model, Msg> =>
(
  get: Get<Model>,
) => {
  const forkFx = async (fx: AsyncGenerator<Msg>, send: Send<Msg>) => {
    try {
      for await (const msg of fx) {
        send(msg);
      }
    } catch (error) {
      console.warn("Error in saga", error);
    }
  };

  const getUntracked = () => peek(get);

  return (next: Send<Msg>) => (msg: Msg) => {
    // First, apply the message to update the state
    next(msg);
    // Then generate and fork the saga
    const fx = saga(getUntracked, msg);
    forkFx(fx, next);
  };
};
