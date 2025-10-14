import type { Get, Middleware, Send } from "../store.ts";

/**
 * Logger middleware that logs messages and state changes.
 * Replaces the debug logging functionality from the store.
 */
export const logger = <Model, Msg>({
  prefix = "",
  log = true,
}: {
  log?: boolean;
  prefix?: string;
} = {}): Middleware<Model, Msg> => {
  return (get: Get<Model>) => (next: Send<Msg>) => (msg: Msg) => {
    if (log) console.log(`${prefix}<`, msg);
    next(msg);
    if (log) console.log(`${prefix}>`, get());
  };
};
