import { AnySignal, signal } from "./signals.ts";

export type Get<T> = () => T;
export type Saga<Model, Msg> = (
  state: Get<Model>,
  msg: Msg,
) => AsyncGenerator<Msg>;

/**
 * A tagged message. This is a convenience type for simple messages with a
 * type discriminator and a value.
 */
export type TaggedMsg<Type extends string, Value> = {
  type: Type;
  value: Value;
};

/** Convenience function for creating a tagged message */
export const msg = <Type extends string, Value>(
  type: Type,
  value: Value,
): TaggedMsg<Type, Value> => ({
  type,
  value,
});

/**
 * An update function takes the current state, a message, and a context,
 * and returns a transaction
 */
export type Reducer<Model, Msg> = (
  state: Model,
  msg: Msg,
) => Model;

export type Send<Msg> = (msg: Msg) => void;

export type Store<Model, Msg> = AnySignal<Model> & {
  send: Send<Msg>;
};

export const store = <Model, Msg>({
  state,
  update,
  saga,
  debug = false,
}: {
  state: Model;
  update: Reducer<Model, Msg>;
  saga: Saga<Model, Msg>;
  debug?: boolean;
}): Store<Model, Msg> => {
  const $state = signal(state);

  const forkFx = async (fx: AsyncGenerator<Msg>) => {
    try {
      for await (const msg of fx) {
        send(msg);
      }
    } catch (error) {
      console.warn("Error in saga", error);
    }
  };

  const get = () => $state.get();

  const send = (msg: Msg) => {
    if (debug) console.log("<", msg);
    const next = update($state.get(), msg);
    if (debug) console.log(">", next);
    $state.set(next);
    // Generate next saga and fork it
    const fx = saga(get, msg);
    forkFx(fx);
  };

  return {
    get,
    send,
  };
};

/** Transform a send function so that it tags messages on the way out. */
export const forward = <MsgA, MsgB>(
  send: (msg: MsgA) => void,
  tag: (msg: MsgB) => MsgA,
) =>
(msg: MsgB): void => {
  send(tag(msg));
};

/** Takes a message and logs it. Convenience for the default arm of a reducer. */
export const updateUnknown = <Model, Msg>(
  state: Model,
  msg: Msg,
): Model => {
  console.warn("Unknown message", msg);
  return state;
};
