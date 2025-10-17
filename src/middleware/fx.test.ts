import { test } from "node:test";
import assert from "node:assert/strict";
import { type Fx, fx } from "./fx.js";
import { type Reducer, store } from "../store.js";
import { pipe } from "../pipe.js";

// Test types
type CounterAction =
  | { type: "increment" }
  | { type: "decrement" }
  | { type: "set"; value: number }
  | { type: "async_increment" }
  | { type: "async_double" }
  | { type: "async_error" }
  | { type: "multi_step" }
  | { type: "no_effect" };

type CounterState = {
  count: number;
  loading: boolean;
  error?: string;
};

// Helper function to create a promise that resolves after a delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("fx - handles simple async effects", async () => {
  const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
    switch (action.type) {
      case "increment":
        return { ...state, count: state.count + 1 };
      case "decrement":
        return { ...state, count: state.count - 1 };
      case "set":
        return { ...state, count: action.value };
      case "async_increment":
        return { ...state, loading: true };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterAction> = async function* (get, action) {
    if (action.type === "async_increment") {
      await delay(10);
      yield { type: "increment" };
      yield { type: "set", value: get().count + 5 };
    }
  };

  const counterStore = pipe(
    store(counterReducer, { count: 0, loading: false } as CounterState),
    fx(testFx),
  );

  counterStore.send({ type: "async_increment" });
  assert.strictEqual(counterStore.get().loading, true);

  // Wait for async effects to complete
  await delay(20);

  assert.strictEqual(counterStore.get().count, 6); // 0 + 1 + 5
});

test("fx - handles multiple yielded actions", async () => {
  const actions: CounterAction[] = [];

  const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
    actions.push(action);
    switch (action.type) {
      case "increment":
        return { ...state, count: state.count + 1 };
      case "decrement":
        return { ...state, count: state.count - 1 };
      case "multi_step":
        return { ...state, loading: true };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterAction> = async function* (_get, action) {
    if (action.type === "multi_step") {
      yield { type: "increment" };
      await delay(5);
      yield { type: "increment" };
      yield { type: "decrement" };
      await delay(5);
      yield { type: "increment" };
    }
  };

  const counterStore = pipe(
    store(counterReducer, { count: 0, loading: false }),
    fx(testFx),
  );

  counterStore.send({ type: "multi_step" });

  // Wait for all async effects
  await delay(20);

  assert.strictEqual(counterStore.get().count, 2); // +1 +1 -1 +1 = 2
  assert.strictEqual(actions.length, 5); // multi_step + 4 yielded actions
  assert.strictEqual(actions[0].type, "multi_step");
  assert.strictEqual(actions[1].type, "increment");
  assert.strictEqual(actions[2].type, "increment");
  assert.strictEqual(actions[3].type, "decrement");
  assert.strictEqual(actions[4].type, "increment");
});

test("fx - ignores actions that don't trigger effects", async () => {
  const actions: CounterAction[] = [];

  const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
    actions.push(action);
    switch (action.type) {
      case "increment":
        return { ...state, count: state.count + 1 };
      case "no_effect":
        return { ...state, loading: false };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterAction> = async function* (_get, action) {
    if (action.type === "increment") {
      await delay(5);
      yield { type: "increment" };
    }
    // no_effect action doesn't trigger any fx
  };

  const counterStore = pipe(
    store(counterReducer, { count: 0, loading: false }),
    fx(testFx),
  );

  counterStore.send({ type: "no_effect" });
  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].type, "no_effect");

  await delay(10);

  // No additional actions should have been sent
  assert.strictEqual(actions.length, 1);
  assert.strictEqual(counterStore.get().count, 0);
});

test("fx - can access current state", async () => {
  const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
    switch (action.type) {
      case "increment":
        return { ...state, count: state.count + 1 };
      case "set":
        return { ...state, count: action.value };
      case "async_double":
        return { ...state, loading: true };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterAction> = async function* (get, action) {
    if (action.type === "async_double") {
      const currentCount = get().count;
      await delay(5);
      yield { type: "set", value: currentCount * 2 };
    }
  };

  const counterStore = pipe(
    store(counterReducer, { count: 5, loading: false }),
    fx(testFx),
  );

  counterStore.send({ type: "async_double" });

  await delay(10);

  assert.strictEqual(counterStore.get().count, 10); // 5 * 2
});

test("fx - handles errors gracefully", async () => {
  const originalWarn = console.warn;
  let warningMessage = "";

  // Mock console.warn
  console.warn = (msg: string, _error: unknown) => {
    warningMessage = `${msg}`;
  };

  try {
    const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
      switch (action.type) {
        case "increment":
          return { ...state, count: state.count + 1 };
        case "async_error":
          return { ...state, loading: true };
        default:
          return state;
      }
    };

    const testFx: Fx<CounterState, CounterAction> = async function* (
      _get,
      action,
    ) {
      if (action.type === "async_error") {
        await delay(5);
        throw new Error("Test error");
      }
    };

    const counterStore = pipe(
      store(counterReducer, { count: 0, loading: false }),
      fx(testFx),
    );

    counterStore.send({ type: "async_error" });
    assert.strictEqual(counterStore.get().loading, true);

    await delay(10);

    // Store state should remain unchanged after error
    assert.strictEqual(counterStore.get().count, 0);
    assert.strictEqual(counterStore.get().loading, true);
    assert.strictEqual(warningMessage, "Error in fx");
  } finally {
    // Restore console.warn
    console.warn = originalWarn;
  }
});

test("fx - works with empty generator", async () => {
  const actions: CounterAction[] = [];

  const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
    actions.push(action);
    return state;
  };

  const testFx: Fx<CounterState, CounterAction> = async function* (
    _get,
    _action,
  ) {
    // Empty generator - no yields
    await delay(5);
  };

  const counterStore = pipe(
    store(counterReducer, { count: 0, loading: false }),
    fx(testFx),
  );

  counterStore.send({ type: "increment" });

  await delay(10);

  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].type, "increment");
});

test("fx - preserves action order", async () => {
  const processedActions: string[] = [];

  const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
    processedActions.push(`reducer:${action.type}`);
    switch (action.type) {
      case "increment":
        return { ...state, count: state.count + 1 };
      case "async_increment":
        return { ...state, loading: true };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterAction> = async function* (_get, action) {
    if (action.type === "async_increment") {
      processedActions.push(`fx:${action.type}`);
      await delay(5);
      yield { type: "increment" };
    }
  };

  const counterStore = pipe(
    store(counterReducer, { count: 0, loading: false }),
    fx(testFx),
  );

  counterStore.send({ type: "async_increment" });

  await delay(10);

  assert.deepStrictEqual(processedActions, [
    "reducer:async_increment",
    "fx:async_increment",
    "reducer:increment",
  ]);
});

test("fx - can chain multiple async operations", async () => {
  const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
    switch (action.type) {
      case "increment":
        return { ...state, count: state.count + 1 };
      case "set":
        return { ...state, count: action.value };
      case "async_increment":
        return { ...state, loading: true };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterAction> = async function* (get, action) {
    if (action.type === "async_increment") {
      // First async operation
      await delay(5);
      yield { type: "increment" };

      // Second async operation
      await delay(5);
      yield { type: "increment" };

      // Third operation using current state
      const currentCount = get().count;
      yield { type: "set", value: currentCount + 10 };
    }
  };

  const counterStore = pipe(
    store(counterReducer, { count: 0, loading: false }),
    fx(testFx),
  );

  counterStore.send({ type: "async_increment" });

  await delay(20);

  assert.strictEqual(counterStore.get().count, 12); // 0 + 1 + 1 + 10
});

test("fx - runs concurrently for multiple actions", async () => {
  const timestamps: number[] = [];

  const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => {
    switch (action.type) {
      case "increment":
        timestamps.push(Date.now());
        return { ...state, count: state.count + 1 };
      case "async_increment":
        return { ...state, loading: true };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterAction> = async function* (_get, action) {
    if (action.type === "async_increment") {
      await delay(10);
      yield { type: "increment" };
    }
  };

  const counterStore = pipe(
    store(counterReducer, { count: 0, loading: false }),
    fx(testFx),
  );

  // Send multiple async actions quickly
  counterStore.send({ type: "async_increment" });
  counterStore.send({ type: "async_increment" });
  counterStore.send({ type: "async_increment" });

  await delay(20);

  assert.strictEqual(counterStore.get().count, 3);
  assert.strictEqual(timestamps.length, 3);

  // All should complete around the same time (within 5ms of each other)
  const timeDiff = Math.max(...timestamps) - Math.min(...timestamps);
  assert.strictEqual(timeDiff < 5, true);
});
