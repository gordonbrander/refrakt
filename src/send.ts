import { type AnySignal } from "./signal.js";

export type Send<Action> = (action: Action) => void;

export type SendableSignal<Model, Action> = AnySignal<Model> & {
  send: Send<Action>;
};

/**
 * Transform a send function so that it tags actions on the way out.
 * This can be useful for mapping actions from one component domain to another.
 */
export const forward = <ActionA, ActionB>(
  send: (action: ActionA) => void,
  tag: (action: ActionB) => ActionA,
) =>
  (action: ActionB): void => {
    send(tag(action));
  };
