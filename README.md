# Signal Store

A lightweight, scalable store built on top of signals. Pairs well with [Lit](https://lit.dev/) or any other UI framework that supports [TC39 signals](https://github.com/proposal-signals/signal-polyfill).

## Features

- **Fine-grained reactivity**: Built on top of TC39 signals.
- **Effects**: Optional managed side effects via async generators.
- **Middleware**: Enhance store behavior through function composition.
- **Minimal dependencies**: Uses only `signal-polyfill` library for maximum compatibility.

### Example

Here's a simple counter app, with UI implemented with [Lit](https://lit.dev/).

```typescript
import { store, computed } from "@gordonb/signal-store";
import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { html } from '@lit-labs/signals';

type Model = { count: number };
type Action = { type: 'inc' } | { type: 'dec' };

const updateCounter = (state: Model, action: Action) => {
  switch (action.type) {
    case 'inc': return { count: state.count + 1 };
    case 'dec': return { count: state.count - 1 };
    default: return state;
  }
};

const counter = store(updateCounter, { count: 0 });

@customElement('counter-app')
class CounterApp extends LitElement {
  render() {
    const count = computed(() => counter.get().count);

    return html`
      <div>
        <h1>Count: ${count}</h1>
        <button @click=${() => counter.send({ type: 'inc' })}>+</button>
        <button @click=${() => counter.send({ type: 'dec' })}>-</button>
      </div>
    `;
  }
}
```

## Store

`store()` lets you create a signal that can only be updated via its reducer function. This is similar to React's `useReducer` hook, except it's based on signals.

```typescript
import { store } from './store.js';

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'set', value: number };

type CounterModel = { count: number };

const update = (state: CounterModel, action: CounterAction) => {
  switch (action.type) {
    case 'increment':
      return { count: state.count + 1 };
    case 'decrement':
      return { count: state.count - 1 };
    case 'set':
      return { count: action.value };
    default:
      return state;
  }
};

const counterStore = store(update, { count: 0 });

// Send actions to update state
counterStore.send({ type: 'increment' });
console.log(counterStore.get().count); // 1
```

The returned store can be used as a signal. You can `.send()` actions to the store to update it. The update function is responsible for taking the current state and the action, and returning the next state. There is no other way to update the store's state. This gives you consistent and predictable state management that is easy to test.

Store can be used as a centralized store for application state, or you can create multiple stores for different parts of your application. Signals give you a lot of flexibility to mix and match approaches.

### Signals

The signals module re-exports the TC39 signals polyfill, as well as providing a handful of convenience functions.

```typescript
import { signal, computed, effect } from '@gordonb/signal-store/signal.js';

// Create a `State` signal
const count = signal(10);

// Create a `Computed` signal
const doubled = computed(() => count.get() * 2);
```

Because the store is a signal, you can use `computed` to scope the store state for fine-grained reactivity.

```ts
// Only updates when username changes
const username = computed(() => store.get().account.profile.username);
```

When you want to react to signal changes, you can use `effect`. Effects are automatically batched and run on the next microtask, preventing unnecessary re-renders and cascading updates.

```ts
// React to changes
const cleanup = effect(() => {
  console.log('Count:', count.get(), 'Doubled:', doubled.get());
});

count.set(20); // Logs: "Count: 20 Doubled: 40"
cleanup(); // Stop the effect
```

## Managed effects

The optional `fx` middleware provides a powerful way to handle side effects using async generators.

Effects are modeled as async generators.

```typescript
type Fx<Model, Action> = (
  state: () => Model, // Get current state
  action: Action // Action triggering this effect
) => AsyncGenerator<Action>; // Yielded actions are sent back to store
```

The effect generator function is called for each new action sent to the store, allowing it to perform async work in response and yield back zero or more actions.

```typescript
import { store, pipe } from '@gordonb/signal-store';
import { fx, type Fx } from '@gordonb/signal-store/middleware/fx.js';

const fetchProfileFx: Fx<AppState, AppAction> = async function* (state, action) {
  if (action.type === "fetch-profile") {
    const response = await fetch("/api/v1/profile", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action.id),
    });

    const json = await response.json();

    yield {
      type: "fetch-profile-success",
      value: json
    };

    return;
  }
};

// Apply middleware
const appStore = pipe(
  store(appReducer, initialState),
  fx(fetchProfileFx)
);

// Trigger effect
appStore.send({ type: 'fetch-profile' });
````

The effect generator function also receives a getter function that returns the current state. This allows effects to decide if they should keep running by checking the application state, giving us a simple mechanism for effect cancellation.

```typescript
type AppAction =
  | { type: 'start-clock' }
  | { type: 'stop-clock' }
  | { type: 'tick' };

const clockFx: Fx<AppState, AppAction> = async function* (state, action) {
  if (action.type === "start-clock") {
    // Run effect until application model says to stop
    while (state().isClockRunning === true) {
      yield { type: 'tick' };
      await sleep(1000);
    }
  }
};
```

Because effects are just async generators, they can be easily composed and mapped. The `iter` submodule provides a handful of useful utility functions for merging and mapping async generators:

- `mergeAsync(...iterables)` - Merge multiple async iterables, yielding values in interleaved order as they become available
- `sequenceAsync(...iterables)` - Sequence async iterables, yielding all values from the first before moving to the next
- `mapAsync(iterable, transform)` - Transform each value in an async iterable using a sync or async function

## Logger middleware

Logs all actions and state changes to the console:

```typescript
import { store } from '@gordonb/signal-store';
import { pipe } from '@gordonb/signal-store/pipe.js';
import { logger } from '@gordonb/signal-store/middleware/logger.js';

const myStore = pipe(
  store(update, initialState),
  logger({ prefix: 'MyStore: ' })
);
```

Example output:
```
MyStore: < { type: 'increment' }
MyStore: > { count: 1 }
```

## Scope middleware

Scope lets you create a scoped child store from a parent store. It returns a new store that is indistinguishable from a top-level store. However, this child store's state is derived from the parent state, and all messages are routed through the parent store.

```typescript
import { store } from '@gordonb/signal-store';
import { pipe } from '@gordonb/signal-store/pipe.js';
import { scope } from '@gordonb/signal-store/middleware/scope.js';

const childStore = pipe(
  parentStore,
  scope(
    // Get child state from parent state
    (state: Model) => state.child,
    // Tag child actions, transforming them into parent actions
    (action: ChildAction) => ({
      type: "child",
      value: action
    })
  )
);
```

## How middleware works

Middleware are just functions of `(store: Store<Model, Msg>) => Store<Model, Msg>` that wrap the store, returning a new store with enhanced behavior.

That means you can simply pass the store to a middleware function:

```ts
const loggerMiddleware = logger();
const myStore = loggerMiddleware(store(update, initial));
```

Simple! However, if you're applying more than one middleware, these nested function calls can get a little tedious. `pipe()` makes this a bit more ergonomic. It applies multiple middleware functions to the store from left-to-right, returning the final decorated store:

```typescript
import { store } from '@gordonb/signal-store';
import { pipe } from '@gordonb/signal-store/pipe.js';
import { fx } from '@gordonb/signal-store/middleware/fx.js';
import { logger } from '@gordonb/signal-store/middleware/logger.js';

const counterStore = pipe(
  store(update, { count: 0 }),
  logger({ prefix: 'Counter: ' }),
  fx(mySaga)
);
```

This compositional approach makes it easy to add, remove, or write your own middleware.

### Custom Middleware

Creating your own middleware functions is easy. Just write a function that takes a store and returns a new store with enhanced behavior:

```typescript
import type { Store } from './store.js';

const timingMiddleware = <Model, Action>() =>
  (store: Store<Model, Action>): Store<Model, Action> => {
    const timedSend = (action: Action) => {
      const start = performance.now();
      store.send(action);
      const duration = performance.now() - start;
      console.log(`Action took ${duration}ms`);
    };

    return {
      get: store.get,
      send: timedSend
    };
  };

// Use with pipe
const myStore = pipe(
  store(update, initialState),
  timingMiddleware()
);
```

## Utility Functions

- `action(type, value)` - Create tagged actions: `action('set', 42)` → `{ type: 'set', value: 42 }`
- `forward(send, transform)` - Decorates send function so that it transform actions before sending
- `updateUnknown(state, action)` - Default handler for unknown actions (logs warning)

## License

MIT
