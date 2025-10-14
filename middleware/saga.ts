import type { Get, Middleware, Send } from "../store.ts";
import { peek } from "../signals.ts";

export type Saga<Model, Msg> = (
  state: Get<Model>,
  msg: Msg,
) => AsyncGenerator<Msg>;

/**
 * Saga middleware that handles async effects/sagas execution.
 * Extracts the saga functionality from the store into reusable middleware.
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
