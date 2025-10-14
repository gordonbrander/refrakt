# Signal Store

A reactive state management library built on TC39 Signals, featuring middleware support and managed side effects based on Async Generators.

This library provides an Elm or Redux-like store for Lit and other frameworks that support TC39 Signals.

## Features

- **Fine-grained reactivity**: Built on the TC39 Signals proposal.
- **Middleware System**: Supports composable middleware
- **Saga Effects**: managed side effects with async generators
- **TypeScript support**: Full TypeScript support with strong typing
- **Minimal dependencies**: Uses only the signal-polyfill for maximum compatibility

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

## Managed effects with saga middleware

Sagas provide a powerful way to handle async side effects using async generators.

Each new message to the store spawns a new saga which can yield one or more messages. The saga receives a getter function that returns the current state, allowing it to adapt its behavior. Cancellable effects can be modeled by recording the relevant state on the model and allowing the effect to cancel itself.

```typescript
import { saga, type Saga } from './middleware/saga.ts';

type AppMsg =
  | { type: 'start-clock' }
  | { type: 'stop-clock' }
  | { type: 'tick' };

const clockSaga: Saga<AppState, AppMsg> = async function* (state, msg) {
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
  middleware: [saga(clockSaga)]
});

// Trigger async effect
appStore.send({ type: 'start-clock' });
```

Because sagas are just async generators, they can be easily composed and mapped. The `iter` namespace provides a handful of useful utility functions for merging and mapping component effects:

- `mergeAsync(...iterables)` - Merge multiple async iterables, yielding values in interleaved order as they become available
- `sequenceAsync(...iterables)` - Sequence async iterables, yielding all values from the first before moving to the next
- `mapAsync(iterable, transform)` - Transform each value in an async iterable using a sync or async function

### Saga API

```typescript
type Saga<Model, Msg> = (
  state: Get<Model>,  // Function to get current state
  msg: Msg           // The message that triggered this saga
) => AsyncGenerator<Msg>; // Yields messages back to store
```

### Middleware

Middleware allows you to intercept and transform messages as they flow through the store. Middleware functions have access to the current state and can modify, log, or trigger side effects.

```typescript
import { store } from './store.ts';
import { logger, saga } from './middleware/index.ts';

const counterStore = store({
  state: { count: 0 },
  update: (state, msg) => { /* reducer */ },
  middleware: [
    logger({ prefix: 'Counter: ' }),
    saga(mySaga)
  ]
});
```

#### Middleware Signature

```typescript
type Middleware<Model, Msg> = (
  state: Get<Model>
) => (
  send: Send<Msg>
) => Send<Msg>;
```

Middleware is curried to provide access to:
1. `state` - Function to get current state
2. `send` - The next middleware or base send function
3. Returns a new send function that can intercept messages

#### Built-in Middleware

##### Logger Middleware

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

## Utility Functions

- `msg(type, value)` - Create tagged messages: `msg('set', 42)` → `{ type: 'set', value: 42 }`
- `forward(send, transform)` - Transform messages before sending
- `updateUnknown(state, msg)` - Default handler for unknown messages (logs warning)


## Advanced Usage

### Composing Stores

You can compose multiple stores and forward messages between them:

```typescript
import { forward } from './store.ts';

const childStore = store({ /* ... */ });

const parentStore = store({
  state: { child: childStore.get(), /* ... */ },
  update: (state, msg) => {
    if (msg.type === 'child_msg') {
      // Forward to child store
      const childSend = forward(childStore.send, (msg) => msg.payload);
      childSend(msg.payload);
      return { ...state, child: childStore.get() };
    }
    // Handle parent messages...
  }
});
```

### Custom Middleware

Create your own middleware for specialized behavior:

```typescript
const timingMiddleware = <Model, Msg>(): Middleware<Model, Msg> =>
  (get) => (next) => (msg) => {
    const start = performance.now();
    next(msg);
    const duration = performance.now() - start;
    console.log(`Message ${msg.type} took ${duration}ms`);
  };
```

### Complex Sagas

Sagas can handle complex async workflows:

```typescript
const complexSaga: Saga<AppState, AppMsg> = async function* (get, msg) {
  if (msg.type === 'start_workflow') {
    // Step 1: Initial setup
    yield { type: 'workflow_started' };

    // Step 2: Parallel operations
    const [result1, result2] = await Promise.all([
      fetchData('endpoint1'),
      fetchData('endpoint2')
    ]);

    yield { type: 'data_loaded', data: { result1, result2 } };

    // Step 3: Conditional logic based on state
    const currentState = get();
    if (currentState.shouldContinue) {
      for (let i = 0; i < 3; i++) {
        await delay(1000);
        yield { type: 'progress_update', step: i + 1 };
      }
    }

    yield { type: 'workflow_complete' };
  }
};
```

## Async Utilities

The library includes utilities for working with async iterables in the `iter.ts` module:

- `mergeAsync(...iterables)` - Merge multiple async iterables
- `sequenceAsync(...iterables)` - Sequence async iterables
- `mapAsync(iterable, transform)` - Transform async iterable values

## Best Practices

1. **Keep reducers pure** - No side effects, just state transformations
2. **Use sagas for async operations** - Don't put async logic in reducers
3. **Type your messages** - Use discriminated unions for type safety
4. **Compose middleware** - Build complex behavior from simple middleware
5. **Batch related updates** - Let the signal system handle batching automatically

## Examples

### Simple Counter

```typescript
const counter = store({
  state: { count: 0 },
  update: (state, msg: { type: 'inc' } | { type: 'dec' }) => {
    switch (msg.type) {
      case 'inc': return { count: state.count + 1 };
      case 'dec': return { count: state.count - 1 };
      default: return state;
    }
  }
});
```

### Todo App with Async Effects

```typescript
type TodoMsg =
  | { type: 'add_todo', text: string }
  | { type: 'toggle_todo', id: string }
  | { type: 'save_todos' }
  | { type: 'todos_saved' };

const todoSaga: Saga<TodoState, TodoMsg> = async function* (get, msg) {
  if (msg.type === 'save_todos') {
    const todos = get().todos;
    await fetch('/api/todos', {
      method: 'POST',
      body: JSON.stringify(todos)
    });
    yield { type: 'todos_saved' };
  }
};

const todoStore = store({
  state: { todos: [], saving: false },
  update: todoReducer,
  middleware: [saga(todoSaga), logger()]
});
```

## License

MIT
