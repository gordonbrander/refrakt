# Signal Store

A reactive state management library built on top of TC39 Signals, featuring middleware support and managed side effects based on async generators.

This library provides an Elm/Redux-style store for Lit and other frameworks that support TC39 Signals.

## Features

- **Signals**: Built on top of TC39 signals for fine-grained reactivity.
- **Effects**: managed side effects with async generators.
- **Middleware System**: Fully customize store behavior.
- **TypeScript support**: Full TypeScript support with strong typing.
- **Minimal dependencies**: Uses only `signal-polyfill` library for maximum compatibility.

### Example

Here's a simple counter example with UI provided by Lit.

```typescript
import { store, computed } from "signal-store";
import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { html } from '@lit-labs/signals';

type Msg = { type: 'inc' } | { type: 'dec' };

const counter = store({
  state: { count: 0 },
  update: (state, msg: Msg) => {
    switch (msg.type) {
      case 'inc': return { count: state.count + 1 };
      case 'dec': return { count: state.count - 1 };
      default: return state;
    }
  }
});

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

The store is the central hub that holds your application state. It combines a signal for reactive state updates with a message-passing system for state changes.

```typescript
import { store } from './store.ts';

type CounterMsg =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'set', value: number };

type CounterModel = { count: number };

const update = (state: CounterModel, msg: CounterMsg) => {
  switch (msg.type) {
    case 'increment':
      return { count: state.count + 1 };
    case 'decrement':
      return { count: state.count - 1 };
    case 'set':
      return { count: msg.value };
    default:
      return state;
  }
};

const counterStore = store({
  state: { count: 0 },
  update,
});

// Send messages to update state
counterStore.send({ type: 'increment' });
console.log(counterStore.get().count); // 1
```

### API

- `store({ state, update, middleware? })` - Creates a new store
  - `state`: Initial state value
  - `update`: Reducer function `(state, msg) => newState`
  - `middleware`: Optional array of middleware functions
- `store.get()` - Get current state value
- `store.send(msg)` - Send a message to update state

### Signals

The signals module provides reactive primitives built on the JavaScript Signals proposal. All state in the store is backed by signals for automatic reactivity.

```typescript
import { signal, computed, effect } from './signals.ts';

// Create reactive state
const count = signal(10);

// Derived state
const doubled = computed(() => count.get() * 2);
```

Because the store is also a signal, you can use `computed` to scope the store state for fine-grained reactivity.

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

The `fx` middleware provides a powerful way to handle side effects using async generators.

Each new message to the store spawns a new effect which can yield zero or more messages. The effect generator function also receives a getter function that returns the current state. Cancellable effects can be modeled by recording the relevant state on the model and allowing the effect to cancel itself.

```typescript
import { fx, type Fx } from './middleware/fx.ts';

type AppMsg =
  | { type: 'start-clock' }
  | { type: 'stop-clock' }
  | { type: 'tick' };

const clockFx: Fx<AppState, AppMsg> = async function* (state, msg) {
  if (msg.type === "start-clock") {
    // Run effect until application model says to stop
    while (state().isClockRunning === true) {
      yield { type: 'tick' };
      await sleep(1000);
    }
  }
};

const appStore = store({
  state: initialState,
  update: appReducer,
  middleware: [fx(clockFx)]
});

// Trigger async effect
appStore.send({ type: 'start-clock' });
```

Because effects are just async generators, they can be easily composed and mapped. The `iter` namespace provides a handful of useful utility functions for merging and mapping component effects:

- `mergeAsync(...iterables)` - Merge multiple async iterables, yielding values in interleaved order as they become available
- `sequenceAsync(...iterables)` - Sequence async iterables, yielding all values from the first before moving to the next
- `mapAsync(iterable, transform)` - Transform each value in an async iterable using a sync or async function

### Saga API

```typescript
type Fx<Model, Msg> = (
  state: Get<Model>,  // Function to get current state
  msg: Msg           // The message triggering this effect
) => AsyncGenerator<Msg>; // Yields messages back to store
```

## Middleware

Middleware allows you to intercept and transform messages as they flow through the store. Middleware functions have access to the current state and can modify, log, or trigger side effects.

```typescript
import { store } from './store.ts';
import { logger, fx } from './middleware/index.ts';

const counterStore = store({
  state: { count: 0 },
  update: (state, msg) => { /* reducer */ },
  middleware: [
    logger({ prefix: 'Counter: ' }),
    fx(mySaga)
  ]
});
```

### Logger Middleware

Logs all messages and state changes to the console:

```typescript
import { logger } from './middleware/logger.ts';

const loggerMiddleware = logger({
  prefix: 'MyStore: ', // Optional prefix for logs
  log: true            // Enable/disable logging
});
```

Example output:
```
MyStore: < { type: 'increment' }
MyStore: > { count: 1 }
```

### Saga Middleware

Sagas are asynchronous middleware that can yield messages back to the store.

```typescript
import { fx } from './middleware/fx.ts';

const myFx = fx(async function* (state, msg) => {
  yield { type: 'increment' };
});
```

### Custom Middleware

Create your own middleware for specialized behavior. Middleware Signature:

```typescript
type Middleware<Model, Msg> = (
  state: Get<Model>
) => (
  send: Send<Msg>
) => Send<Msg>;
```

Example:

```typescript
const timingMiddleware = <Model, Msg>(): Middleware<Model, Msg> =>
  (get) => (next) => (msg) => {
    const start = performance.now();
    next(msg);
    const duration = performance.now() - start;
    console.log(`Message ${msg.type} took ${duration}ms`);
  };
```

## Utility Functions

- `msg(type, value)` - Create tagged messages: `msg('set', 42)` → `{ type: 'set', value: 42 }`
- `forward(send, transform)` - Decorates send function so that it transform messages before sending
- `updateUnknown(state, msg)` - Default handler for unknown messages (logs warning)

## License

MIT
