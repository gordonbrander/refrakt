import { forward, type Store } from "../store.js";
import { computed } from "../signal.js";

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
 *   scope((state) => state.count, (action) => action),
 * );
 * ```
 */
export const scope = <ModelA, ActionA, ModelB, ActionB>(
  get: (state: ModelA) => ModelB,
  tag: (action: ActionB) => ActionA,
) =>
(
  store: Store<ModelA, ActionA>,
): Store<ModelB, ActionB> => {
  const $state = computed(() => get(store.get()));
  const send = forward(store.send, tag);
  return {
    get: () => $state.get(),
    send,
  };
};
