import { AnySignal, signal } from "./signal.ts";

/**
 * A tagged message. Convenience type for simple messages with a
 * `type` discriminator and a `value`.
 */
export type TaggedMsg<Type extends string, Value> = {
  type: Type;
  value: Value;
};

/** Convencience factory for creating a message with a `type` discriminator and `value` */
export const msg = <Type extends string, Value>(
  type: Type,
  value: Value,
): TaggedMsg<Type, Value> => ({
  type,
  value,
});

export type Reducer<Model, Msg> = (
  state: Model,
  msg: Msg,
) => Model;

export type Store<Model, Msg> = AnySignal<Model> & {
  send: (msg: Msg) => void;
};

/**
 * Create a signals-based store that updates through the provided `update`
 * reducer function.
 * @arg update - The reducer function that updates the store state.
 * @arg initial - The initial state of the store.
 * @returns A store object with a signal for the state and a send method.
 */
export const store = <Model, Msg>(
  update: Reducer<Model, Msg>,
  initial: Model,
): Store<Model, Msg> => {
  const $state = signal(initial);

  /**
   * Get the current state.
   * This method is hard-bound to the reducer so you can pass it around as a function.
   */
  const get = () => $state.get();

  /**
   * Send a message to the reducer.
   * This method is hard-bound to the reducer so you can pass it around as a function.
   */
  const send = (msg: Msg) => {
    const next = update($state.get(), msg);
    $state.set(next);
  };

  return { get, send };
};

/**
 * Transform a send function so that it tags messages on the way out.
 * This can be useful for mapping messages from one component domain to another.
 */
export const forward = <MsgA, MsgB>(
  send: (msg: MsgA) => void,
  tag: (msg: MsgB) => MsgA,
) =>
(msg: MsgB): void => {
  send(tag(msg));
};

/**
 * Convenience function for logging unknown messages in the default arm
 * of a reducer.
 */
export const updateUnknown = <Model, Msg>(
  state: Model,
  msg: Msg,
): Model => {
  console.warn("Unknown message", msg);
  return state;
};
