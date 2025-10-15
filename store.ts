import { AnySignal, computed, signal } from "./signals.ts";

export type Get<T> = () => T;

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

export type Middleware<Model, Msg> = (
  state: Get<Model>,
) => (
  send: Send<Msg>,
) => Send<Msg>;

export const store = <Model, Msg>({
  state,
  update,
  middleware = [],
}: {
  state: Model;
  update: Reducer<Model, Msg>;
  middleware?: Middleware<Model, Msg>[];
}): Store<Model, Msg> => {
  const $state = signal(state);

  const get = () => $state.get();

  const baseSend = (msg: Msg) => {
    const next = update($state.get(), msg);
    $state.set(next);
  };

  // Apply middleware to the send function
  const send = middleware.reduce(
    (currentSend, mw) => mw(get)(currentSend),
    baseSend,
  );

  return {
    get,
    send,
  };
};

/**
 * Create a scoped store.
 * Scoped stores are useful for creating isolated state and behavior for child components.
 * A scoped store exposes a computed subset of the parent state and maps the
 * actions you send to it from the child domain to the parent domain.
 */
export const scope = <ModelA, MsgA, ModelB, MsgB>(
  store: Store<ModelA, MsgA>,
  get: (state: ModelA) => ModelB,
  tag: (msg: MsgB) => MsgA,
): Store<ModelB, MsgB> => {
  const $state = computed(() => get(store.get()));
  const send = forward(store.send, tag);
  return {
    get: () => $state.get(),
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
