export type Effect<Model, Action> = AsyncGenerator<Action, void, Model>;

export async function* none<Model, Action>(): Effect<Model, Action> {
  // Yield nothing
}
