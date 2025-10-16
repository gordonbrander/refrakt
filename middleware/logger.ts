import { type Store } from "../store.ts";
import { peek } from "../signal.ts";

/**
 * Logger middleware that logs messages and state changes to the console.
 * @usage
 * ```ts
 * const myStore = pipe(
 *   reducer(update, initial),
 *   logger(),
 * );
 * ```
 */
export const logger = <Model, Msg>({
  prefix = "",
  log = true,
}: {
  log?: boolean;
  prefix?: string;
} = {}) =>
(
  { get, send }: Store<Model, Msg>,
): Store<Model, Msg> => {
  const sendWithLogging = (msg: Msg) => {
    if (log) console.log(`${prefix}<`, msg);
    send(msg);
    if (log) console.log(`${prefix}>`, peek(get));
  };

  return {
    get,
    send: sendWithLogging,
  };
};
