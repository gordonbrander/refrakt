---
name: refrakt
description: How to use Refrakt signals-based state mangement library
---

Refrakt is a lightweight state management library built on TC39 signals.

## Modules

- `refrakt/signal.js` — signal primitives: `signal`, `computed`, `effect`, `peek`
- `refrakt/reducer.js` — pure reducer-based state: `reducer`, `withLogging`, `unreachable`
- `refrakt/store.js` — transactional state with effects: `store`, `tx`, `noFx`, `withLogging`, `unreachable`
- `refrakt/send.js` — action utilities: `forward`
- `refrakt/scope.js` — scoped child stores: `scope`
- `refrakt/iter.js` — async iterator utilities: `mergeAsync`, `sequenceAsync`, `mapAsync`

## Reducer (pure state, no effects)

Use `reducer` when you only need state transitions with no side effects.

```ts
import { type Reducer, reducer, unreachable } from "refrakt/reducer.js";

type Action = { type: "increment" } | { type: "decrement" };

const update: Reducer<number, Action> = (state, action) => {
  switch (action.type) {
    case "increment":
      return state + 1;
    case "decrement":
      return state - 1;
    default:
      return unreachable(state, action);
  }
};

const counter = reducer(update, 0);
counter.send({ type: "increment" });
counter.get(); // 1
```

## Store (state + effects)

Use `store` when you need side effects. The update function returns a transaction via `tx(state, fx?)`. Effects are async generators that yield actions back to the store. The `state()` callback passed to fx reads current store state — use it to check flags and cancel effects.

```ts
import { type Update, store, tx, unreachable } from "refrakt/store.js";

type Model = { isRunning: boolean; elapsed: number };
type Action = { type: "start" } | { type: "stop" } | { type: "tick" };

const update: Update<Model, Action, void> = (state, action) => {
  switch (action.type) {
    case "start":
      return tx(
        { ...state, isRunning: true } as Model,
        async function* (state) {
          while (state().isRunning) {
            await delay(1000);
            if (state().isRunning) {
              yield { type: "tick" };
            }
          }
        },
      );
    case "stop":
      return tx({ ...state, isRunning: false } as Model);
    case "tick":
      return tx({ ...state, elapsed: state.elapsed + 1 } as Model);
    default:
      return unreachable(state, action);
  }
};

const myStore = store(update, { isRunning: false, elapsed: 0 });
```

### Store with context

Pass a third argument to `store` for dependency injection:

```ts
const update: Update<Model, Action, { api: Api }> = (
  state,
  action,
  context,
) => {
  switch (action.type) {
    case "fetch":
      return tx({ ...state, loading: true } as Model, async function* () {
        const data = await context.api.getData();
        yield { type: "set", data };
      });
    // ...
  }
};

const myStore = store(update, initialState, { api: myApi });
```

## Signals

```ts
import { signal, computed, effect, peek } from "refrakt/signal.js";

const count = signal(0);
const doubled = computed(() => count.get() * 2);

// Effects are batched to microtask
const cleanup = effect(() => {
  console.log(count.get());
});

// Read without tracking
const value = peek(() => count.get());
```

## Scope

Create a child store that projects a subset of parent state and maps actions:

```ts
import { scope } from "refrakt/scope.js";

const child = scope({
  store: parentStore,
  get: (state) => state.child,
  tag: (action) => ({ type: "child", action }),
});
```

## Forward

Transform a send function to tag actions:

```ts
import { forward } from "refrakt/send.js";

const sendChild = forward(parentStore.send, (action) => ({
  type: "child",
  action,
}));
```

## Key patterns

- **Exhaustive switches**: Use `unreachable(state, action)` in the default arm. TypeScript will error if the switch isn't exhaustive.
- **Cancelling effects**: Use `state()` inside fx to read current state. Check a flag (e.g. `isRunning`) to break out of loops.
- **Atomic check-then-update**: The update function sees state at the moment of dispatch, preventing race conditions.
- **`as Model` assertions**: Use `as Model` when spreading state in `tx()` calls to help TypeScript infer the transaction type.
