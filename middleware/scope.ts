import { forward, type Store } from "../store.ts";
import { computed } from "../signals.ts";

/**
 * Create a scoped store.
 * Scoped stores are useful for creating isolated state and behavior for child components.
 * A scoped store exposes a computed subset of the parent state and maps the
 * actions you send to it from the child domain to the parent domain.
 * @usage
 * ```ts
 * const parentStore = store(updateParent, { count: 0 });
 * const childStore = pipe(
 *   parentStore,
 *   scope((state) => state.count, (msg) => msg),
 * );
 * ```
 */
export const scope = <ModelA, MsgA, ModelB, MsgB>(
  get: (state: ModelA) => ModelB,
  tag: (msg: MsgB) => MsgA,
) =>
(
  store: Store<ModelA, MsgA>,
): Store<ModelB, MsgB> => {
  const $state = computed(() => get(store.get()));
  const send = forward(store.send, tag);
  return {
    get: () => $state.get(),
    send,
  };
};
