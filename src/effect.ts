/** Represents an effect that can be executed against a model state, yielding actions. */
export type Effect<Model, Action> = (state: () => Model) => AsyncGenerator<Action>;

export async function* none<Action>(): AsyncGenerator<Action> {
  // Yield nothing
}
