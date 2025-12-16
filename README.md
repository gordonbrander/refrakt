# Refrakt: state management with signals

A lightweight, scalable state management library built on top of signals. Pairs well with [Lit](https://lit.dev/) and other frameworks that support [TC39 signals](https://github.com/proposal-signals/signal-polyfill).

At its core, Refrakt is just a signal defined with a reducer. But don't underestimate it! Using middleware, you can scale Refrakt all the way up into a powerful store with managed side effects and more.

## Features

- **Fine-grained reactivity**: Built on top of TC39 signals.
- **Effects**: Optional managed side effects via async generators.
- **Middleware**: Enhance store behavior via function composition.
- **Minimal dependencies**: Uses only `signal-polyfill` library for maximum compatibility.

## Example

Here's a simple counter example using [Lit](https://lit.dev/) for UI.

```typescript
import { store } from "refrakt";
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

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

`store()` creates a signal that can only be updated via its reducer function. It's conceptually similar to React's `useReducer` hook, except it's based on signals.

```typescript
import { store } from 'refrakt';

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

All actions go through the update function. There is no other way to update the store's state. This gives you consistent and predictable state management that is easy to test. By writing unit tests for the update function, you can ensure that your application's state is always valid.

You can create multiple stores for different components, or create a single central store for your entire application state. It's up to you!

Because stores are just signals, you can use computed signals to scope store state, or even combine state from multiple stores. Signals give you a lot of flexibility to mix and match approaches. Refrakt even offers a `scope` middleware to create scoped child stores from parent stores (see below).

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
const username = computed(() => store.get().account.profile.username);
```


## Fx middleware

While `effect()` is great for running simple side-effects whenever data changes, you sometimes want a more structured approach for managing complex side-effects. The `fx` middleware provides a powerful way to handle managed side effects using async generators.

The `fx` middleware takes a single function that returns an async generator.

```typescript
type Fx<Model, Action> = (
  state: () => Model, // Get current state
  action: Action // Action triggering this effect
) => AsyncGenerator<Action>; // Yielded actions are sent back to store
```

The effect generator function is called for each new action sent to the store, allowing it to perform async work and yield back zero or more actions in response.

```typescript
import { store, pipe } from 'refrakt';
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
  store(appReducer, initialState),
  fx(loginFx, services)
);
````

Because effects are just async generators, they can be easily composed and mapped. The `iter` submodule provides a handful of useful utility functions for merging and mapping async generators:

- `mergeAsync(...iterables)` - Merge multiple async iterables, yielding values in interleaved order as they become available
- `sequenceAsync(...iterables)` - Sequence async iterables, yielding all values from the first before moving to the next
- `mapAsync(iterable, transform)` - Transform each value in an async iterable using a sync or async function

## Logger middleware

Logs all actions and state changes to the console:

```typescript
import { store, pipe } from 'refrakt';
import { logger } from 'refrakt/middleware/logger.js';

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
import { store, pipe } from 'refrakt';
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
import { store, type Store } from "refrakt";
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

Middleware are just functions of `(store: Store<Model, Msg>) => Store<Model, Msg>` that wrap the store, returning a new store with enhanced behavior.

That means you can simply pass the store to a middleware function:

```ts
const loggerMiddleware = logger();
const myStore = loggerMiddleware(store(update, initial));
```

Simple! However, if you're applying more than one middleware, these nested function calls can get a little tedious. `pipe()` makes this a bit more ergonomic. It applies multiple middleware functions to the store from left-to-right, returning the final decorated store:

```typescript
import { store, pipe } from 'refrakt';
import { fx } from 'refrakt/middleware/fx.js';
import { logger } from 'refrakt/middleware/logger.js';

const counterStore = pipe(
  store(update, { count: 0 }),
  logger({ prefix: 'Counter: ' }),
  fx(mySaga)
);
```

This compositional approach makes it easy to add, remove, or write your own middleware. Just write a function that takes a store and returns a new store with enhanced behavior:

```typescript
import type { Store } from 'refrakt';

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
