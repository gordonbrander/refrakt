# Refrakt: state management with signals

A lightweight, scalable state management library built on top of signals. Pairs well with [Lit](https://lit.dev/) and other frameworks that support [TC39 signals](https://github.com/proposal-signals/signal-polyfill).

Refrakt offers two approaches:

- **Store** with transactional effects (Elm-style) — state updates and effects are returned together, enabling check-then-update-then-effect patterns.
- **Reducer** for pure state updates (Redux-style) — effects can be added separately via the `fx` middleware.

Both return the same `ReducerSignal` interface, so all middleware works with either.

## Features

- **Fine-grained reactivity**: Built on top of TC39 signals.
- **Transactional effects**: State updates and side effects in a single transaction.
- **Middleware**: Enhance behavior via function composition.
- **Minimal dependencies**: Uses only `signal-polyfill` library for maximum compatibility.

## Example

Here's a simple counter example using [Lit](https://lit.dev/) for UI.

```typescript
import { store, tx } from "refrakt";
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

type Model = { count: number };
type Action = { type: 'inc' } | { type: 'dec' };

const update = (state: Model, action: Action) => {
  switch (action.type) {
    case 'inc': return tx({ count: state.count + 1 });
    case 'dec': return tx({ count: state.count - 1 });
    default: return tx(state);
  }
};

const counter = store(update, { count: 0 });

@customElement('counter-app')
class CounterApp extends SignalWatcher(LitElement) {
  render() {
    return html`
      <div>
        <h1>Count: ${counter.get().count}</h1>
        <button @click=${() => counter.send({ type: 'inc' })}>+</button>
        <button @click=${() => counter.send({ type: 'dec' })}>-</button>
      </div>
    `;
  }
}
```

## Store

`store()` creates a signal updated via a transactional update function. The update function returns a `Tx` containing the new state and optional effects.

```typescript
import { store, tx, type Update } from 'refrakt';

type Model = { count: number, fetching: boolean };

type Action =
  | { type: 'increment' }
  | { type: 'fetch' }
  | { type: 'fetch-complete', value: number };

const update: Update<Model, Action, void> = (state, action) => {
  switch (action.type) {
    case 'increment':
      return tx({ ...state, count: state.count + 1 });
    case 'fetch':
      // State update and effect in a single transaction
      return tx(
        { ...state, fetching: true },
        (async function* () {
          const response = await fetch('/api/count');
          const data = await response.json();
          yield { type: 'fetch-complete', value: data.count };
        })()
      );
    case 'fetch-complete':
      return tx({ ...state, count: action.value, fetching: false });
    default:
      return tx(state);
  }
};

const counterStore = store(update, { count: 0, fetching: false });
counterStore.send({ type: 'increment' });
```

`tx(state, effects?)` is a convenience factory for creating transactions. Effects are async generators that yield actions back to the store.

### Transactional effects

The key advantage of combining state updates with effects is **transactional** check-then-update-then-effect patterns. For example, preventing duplicate fetches:

```typescript
case 'fetch':
  // Already fetching? Do nothing.
  if (state.fetching) {
    return tx(state);
  }
  // Set flag AND issue effect atomically
  return tx(
    { ...state, fetching: true },
    (async function* () {
      const data = await fetchData();
      yield { type: 'fetch-complete', value: data };
    })()
  );
```

Because the flag and effect are set in the same transaction, there's no window where a duplicate fetch can slip through. This is difficult to achieve when reducers and effects are separated, since effects run in parallel while state updates are sequential.

### Context

`store()` accepts an optional third `context` argument, passed to the update function on every action:

```typescript
const update: Update<Model, Action, Services> = (state, action, services) => {
  // ...
};

const myStore = store(update, initialState, services);
```

## Reducer

`reducer()` creates a signal updated via a pure reducer function. It's the simpler option when you don't need transactional effects.

```typescript
import { reducer, type Reducer } from 'refrakt';

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'set', value: number };

const update: Reducer<number, CounterAction> = (state, action) => {
  switch (action.type) {
    case 'increment':
      return state + 1;
    case 'decrement':
      return state - 1;
    case 'set':
      return action.value;
    default:
      return state;
  }
};

const counterStore = reducer(update, 0);

counterStore.send({ type: 'increment' });
console.log(counterStore.get()); // 1
```

Effects can be added to a reducer via the `fx` middleware (see below).

## Signals

The signals module re-exports the TC39 signals polyfill, as well as providing a handful of convenience functions.

```typescript
import { signal, computed, effect } from 'refrakt/signal.js';

// Create a `State` signal
const count = signal(10);

// Create a `Computed` signal
const doubled = computed(() => count.get() * 2);
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

Because stores are just another signal, you can use `computed` to scope down state for fine-grained reactivity.

```ts
// Only updates when username changes
const username = computed(() => myStore.get().account.profile.username);
```

## Fx middleware

The `fx` middleware adds managed side effects to a `reducer`. Effects are modeled as async generators that yield actions back to the store.

```typescript
type Fx<Model, Action> = (
  state: () => Model, // Get current state
  action: Action // Action triggering this effect
) => AsyncGenerator<Action>; // Yielded actions are sent back to store
```

The effect generator function is called for each action sent to the store, allowing it to perform async work and yield back zero or more actions in response.

```typescript
import { reducer, pipe } from 'refrakt';
import { fx, type Fx } from 'refrakt/middleware/fx.js';

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
  reducer(appReducer, initialState),
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

`fx` can also take an additional `context` parameter. This can be used to pass additional information to the effect generator, such as services for performing I/O operations.

```ts
import services from './services.js';

const loginFx: Fx<AppState, AppAction, AppContext> = async function* (state, action, context) {
  if (action.type === "login") {
    const success = await auth.login();
    if (success) {
      yield { type: 'login-success' };
    } else {
      yield { type: 'login-failure' };
    }
  }
};

const appStore = pipe(
  reducer(appReducer, initialState),
  fx(loginFx, services)
);
````

Because effects are just async generators, they can be easily composed and mapped. The `iter` submodule provides a handful of useful utility functions for merging and mapping async generators:

- `mergeAsync(...iterables)` - Merge multiple async iterables, yielding values in interleaved order as they become available
- `sequenceAsync(...iterables)` - Sequence async iterables, yielding all values from the first before moving to the next
- `mapAsync(iterable, transform)` - Transform each value in an async iterable using a sync or async function

## Logger middleware

Logs all actions and state changes to the console. Works with both `store` and `reducer`.

```typescript
import { reducer, pipe } from 'refrakt';
import { logger } from 'refrakt/middleware/logger.js';

const myStore = pipe(
  reducer(update, initialState),
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
import { pipe } from 'refrakt';
import { scope } from 'refrakt/middleware/scope.js';

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

One way you can use scope is to create components that can be used in _either_ an island architecture style, or in a more Elmish subcomponent style.

Components can be initialized with their own store by default. This store can be optionally overridden with a scoped store that customizes child component behavior.

```typescript
// child-component.ts
import { store, tx, type Store } from "refrakt";
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { watch } from '@lit-labs/signals';

// ...

@customElement('child-component')
class ChildComponent extends LitElement {
  @property({ attribute: false })
  store: Store<ChildModel, ChildAction> = store(update, { count: 0 });

  // ...
}
```

```typescript
// parent-component.ts
import { pipe } from "refrakt";
import { scope } from "refrakt/middleware/scope.js";
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import * as ChildComponent from "./child-component.js";

// ...

const childStore = pipe(
  parentStore,
  scope(
    (state: ParentModel) => state.child,
    (msg: ChildAction): ParentAction => ({ type: "child", msg })
  ),
);

@customElement('parent-component')
class ParentComponent extends LitElement {
  render() {
    return html`
      <div class="parent">
          <child-component .store=${childStore}></child-component>
      </div>
    `;
  }
}
```

Because scoped stores are indistinguishable from parent stores, you can replace the default child store, and the child component will be none the wiser. This allows for a form of dependency injection where parent components can intercept and react to child actions, as well as customize child component behavior.

## Custom Middleware

Middleware are functions of `(store: ReducerSignal<Model, Action>) => ReducerSignal<Model, Action>` that wrap the store, returning a new store with enhanced behavior. They work with both `store` and `reducer` since both return a `ReducerSignal`.

That means you can simply pass the store to a middleware function:

```ts
const loggerMiddleware = logger();
const myStore = loggerMiddleware(reducer(update, initial));
```

Simple! However, if you're applying more than one middleware, these nested function calls can get a little tedious. `pipe()` makes this a bit more ergonomic. It applies multiple middleware functions to the store from left-to-right, returning the final decorated store:

```typescript
import { reducer, pipe } from 'refrakt';
import { fx } from 'refrakt/middleware/fx.js';
import { logger } from 'refrakt/middleware/logger.js';

const counterStore = pipe(
  reducer(update, { count: 0 }),
  logger({ prefix: 'Counter: ' }),
  fx(myEffects)
);
```

This compositional approach makes it easy to add, remove, or write your own middleware. Just write a function that takes a store and returns a new store with enhanced behavior:

```typescript
import type { ReducerSignal } from 'refrakt';

const timingMiddleware = <Model, Action>() =>
  (store: ReducerSignal<Model, Action>): ReducerSignal<Model, Action> => {
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
  reducer(update, initialState),
  timingMiddleware()
);
```

## Utility Functions

- `action(type, value)` - Create tagged actions: `action('set', 42)` -> `{ type: 'set', value: 42 }`
- `forward(send, transform)` - Decorates send function so that it transforms actions before sending
- `updateUnknown(state, action)` - Default handler for unknown actions (logs warning)
- `tx(state, effects?)` - Create a transaction with state and optional effects

## License

MIT
