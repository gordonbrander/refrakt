/** Represents an fx that can be executed against a model state, yielding actions. */
export type Fx<Model, Action> = (state: () => Model) => AsyncGenerator<Action>;

export async function* none<Action>(): AsyncGenerator<Action> {
  // Yield nothing
}
