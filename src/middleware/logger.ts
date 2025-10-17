import { type Store } from "../store.js";
import { peek } from "../signal.js";

/**
 * Logger middleware that logs actions and state changes to the console.
 * @usage
 * ```ts
 * const myStore = pipe(
 *   reducer(update, initial),
 *   logger(),
 * );
 * ```
 */
export const logger = <Model, Action>({
  prefix = "",
  log = true,
}: {
  log?: boolean;
  prefix?: string;
} = {}) =>
(
  { get, send }: Store<Model, Action>,
): Store<Model, Action> => {
  const sendWithLogging = (action: Action) => {
    if (log) console.log(`${prefix}<`, action);
    send(action);
    if (log) console.log(`${prefix}>`, peek(get));
  };

  return {
    get,
    send: sendWithLogging,
  };
};
