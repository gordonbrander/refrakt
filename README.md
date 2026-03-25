# Refrakt: state management with signals

A lightweight state management library built on top of signals. Pairs well with [Lit](https://lit.dev/) and other frameworks that support [TC39 signals](https://github.com/proposal-signals/signal-polyfill).

Refrakt is built around a simple concept: define a signal with a reducer, send actions to update it.

## Features

- **Fine-grained reactivity**: Built on top of TC39 signals.
- **Managed effects**: Elm-style transactional effect management.
- **Scoped stores**: Create child stores that project parent state and tag actions.
- **Minimal dependencies**: Uses only `signal-polyfill` library for maximum compatibility.

## Example

Here's a simple counter example using [Lit](https://lit.dev/) for UI.

```typescript
import { reducer } from "refrakt/reducer.js";
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

type Model = { count: number };
type Action = { type: 'inc' } | { type: 'dec' };

const update = (state: Model, action: Action) => {
  switch (action.type) {
    case 'inc': return { count: state.count + 1 };
    case 'dec': { count: state.count - 1 };
    default: return state;
  }
};

const counter = reducer(update, { count: 0 });

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

## Reducer

`reducer()` creates a signal updated via a pure reducer function. It works like React's `useReducer()` hook, except it's a signal.

```typescript
import { reducer } from 'refrakt/reducer.js';

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'set', value: number };

const update = (state: number, action: CounterAction): number => {
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

## Store

`store()` returns a signal looks exactly like the type returned by `reducer()`, but has additional support for managed side-effects. Instead of the reducer returning just the next state, a store reducer returns a transaction object containing the next state *and* optional side-effects.

Effects are modeled as async generator functions that yield zero or more actions over time.

```typescript
import { store, tx, type Tx } from 'refrakt/store.js';

type Model = { count: number, fetching: boolean };

type Action =
  | { type: 'increment' }
  | { type: 'fetch' }
  | { type: 'fetch-complete', value: number };

const update = (state: Model, action: Action): Tx<Model, Action> => {
  switch (action.type) {
    case 'increment':
      return tx({ ...state, count: state.count + 1 });
    case 'fetch':
      // State update and effect in a single transaction
      return tx(
        { ...state, fetching: true },
        function* () {
          const response = await fetch('/api/count');
          const data = await response.json();
          yield { type: 'fetch-complete', value: data.count };
        }
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

`tx(state, effect?)` is a convenience factory for creating transactions. Effects are async generators that yield actions back to the store.

Effect generator functions can also take an optional `state()` argument, which can be used to check in on the current state of the store as the generator progresses.

```typescript
async function* (state: () => Model) {
  await sleep(2000);
  if (state().cancel) {
    return;
  }
  yield { type: "msg", value: "hello world" }
}
```

### Transactional effects

Why store? Why return a transaction? For simple effect cases, a reducer combined with a signal `effect()` may be enough. But when side-effects become complex, you might want a store.

The key advantage is that store lets you implement **transactional** side effects. This lets you implement atomic check-then-update-then-effect patterns. For example, preventing duplicate fetches:

```typescript
case 'fetch':
  // Already fetching? Do nothing.
  if (state.fetching) {
    return tx(state);
  }
  // Set flag AND issue effect atomically
  return tx(
    { ...state, fetching: true },
    async function* () {
      const data = await fetchData();
      yield { type: 'fetch-complete', value: data };
    }
  );
```

Because update runs sequentially and atomically, and the flag and effect are set during the same transaction, there is no window where a duplicate fetch can slip through. It is difficult to achieve this kind of atomic control when state and effects are separated.

### Context

`store()` accepts an optional third `context` argument, passed to the update function on every action:

```typescript
const update: Update<Model, Action, Services> = (state, action, services) => {
  // ...
};

const myStore = store(update, initialState, services);
```

This can be used to expose external services to the update function.

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

## Logging

Both `store` and `reducer` provide a `withLogging` function that wraps an update/reducer function with debug logging.

```typescript
import { store, tx, withLogging, type Update } from 'refrakt/store.js';

const update: Update<Model, Action, void> = (state, action) => {
  // ...
};

const loggedUpdate = withLogging(update, { name: 'myStore' });
const myStore = store(loggedUpdate, initialState);
```

```typescript
import { reducer, withLogging, type Reducer } from 'refrakt/reducer.js';

const step: Reducer<Model, Action> = (state, action) => {
  // ...
};

const loggedStep = withLogging(step, { name: 'myReducer' });
const myStore = reducer(loggedStep, initialState);
```

Example output:
```
<- myStore { type: 'increment' }
-> myStore { count: 1 }
```

You can also pass a `log` predicate to conditionally enable logging:

```typescript
const loggedUpdate = withLogging(update, {
  name: 'myStore',
  log: () => import.meta.env.DEV,
});
```

## Scope

`scope` creates a child store from a parent store. The child store's state is derived from the parent state, and all actions are tagged and routed through the parent store.

```typescript
import { scope } from 'refrakt/scope.js';

const childStore = scope({
  store: parentStore,
  // Project parent state to child state
  get: (state: ParentModel) => state.child,
  // Tag child actions, transforming them into parent actions
  tag: (action: ChildAction): ParentAction => ({
    type: "child",
    action
  }),
});
```

One way you can use scope is to create components that can be used in _either_ an island architecture style, or in a more Elmish subcomponent style.

Components can be initialized with their own store by default. This store can be optionally overridden with a scoped store that customizes child component behavior.

```typescript
// child-component.ts
import { store, tx, type Store } from "refrakt/store.js";
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
import { scope } from "refrakt/scope.js";
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import * as ChildComponent from "./child-component.js";

// ...

const childStore = scope({
  store: parentStore,
  get: (state: ParentModel) => state.child,
  tag: (action: ChildAction): ParentAction => ({ type: "child", action }),
});

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

## Async Iterator Utilities

The `iter` submodule provides utility functions for working with async generators. These can be useful for merging and mapping effects between component domains.

- `mergeAsync(...iterables)` - Merge multiple async iterables, yielding values in interleaved order as they become available
- `sequenceAsync(...iterables)` - Sequence async iterables, yielding all values from the first before moving to the next
- `mapAsync(iterable, transform)` - Transform each value in an async iterable using a sync or async function

## Utility Functions

- `forward(send, tag)` - Transform a send function so that it tags actions on the way out (`refrakt/send.js`)
- `tx(state, effects?)` - Create a transaction with state and optional effects (`refrakt/store.js`)
- `unknown(state, action)` - Default handler for unknown actions in switch default arm; enforces exhaustive switches via `never` type (available in both `refrakt/store.js` and `refrakt/reducer.js`)

## License

MIT
