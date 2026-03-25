import { type SendableSignal, forward } from "./send.js";
import { computed } from "./signal.js";

/**
 * Create a scoped reducer.
 * Scoped reducers are useful for creating isolated state and behavior for child components.
 * A scoped reducer exposes a computed subset of the parent state and maps the
 * actions you send to it from the child domain to the parent domain.
 * @usage
 * ```ts
 * const parentStore = store(updateParent, { count: 0 });
 * const childStore = scope({
 *   store: parentStore,
 *   get: (state) => state.count,
 *   tag: (action) => ({ type: "child", action }),
 * });
 * ```
 */
export const scope = <ModelA, ActionA, ModelB, ActionB>({
  store,
  get,
  tag,
}: {
  store: SendableSignal<ModelA, ActionA>,
  get: (state: ModelA) => ModelB,
  tag: (action: ActionB) => ActionA,
}): SendableSignal<ModelB, ActionB> => {
  const $state = computed(() => get(store.get()));
  const send = forward(store.send, tag);
  return {
    get: () => $state.get(),
    send,
  };
};
