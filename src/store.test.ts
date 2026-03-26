import { test } from "node:test";
import assert from "node:assert/strict";
import { store, tx, type Update, unreachable, withLogging } from "./store.js";

// Helper function to create a promise that resolves after a delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Test types for actions
type CounterAction =
  | { type: "increment" }
  | { type: "decrement" }
  | { type: "set"; value: number }
  | { type: "add"; value: number };

test("store - creates store with initial state", () => {
  const update: Update<number, CounterAction, void> = (state, action) => {
    switch (action.type) {
      case "increment":
        return tx(state + 1);
      case "decrement":
        return tx(state - 1);
      case "set":
        return tx(action.value);
      case "add":
        return tx(state + action.value);
      default:
        return unreachable(state, action);
    }
  };

  const counterStore = store(update, 0);

  assert.strictEqual(counterStore.get(), 0);
});

test("store - handles actions through send", () => {
  const update: Update<number, CounterAction, void> = (state, action) => {
    switch (action.type) {
      case "increment":
        return tx(state + 1);
      case "decrement":
        return tx(state - 1);
      case "set":
        return tx(action.value);
      case "add":
        return tx(state + action.value);
      default:
        return unreachable(state, action);
    }
  };

  const counterStore = store(update, 0);

  counterStore.send({ type: "increment" });
  assert.strictEqual(counterStore.get(), 1);

  counterStore.send({ type: "increment" });
  assert.strictEqual(counterStore.get(), 2);

  counterStore.send({ type: "decrement" });
  assert.strictEqual(counterStore.get(), 1);

  counterStore.send({ type: "set", value: 10 });
  assert.strictEqual(counterStore.get(), 10);

  counterStore.send({ type: "add", value: 5 });
  assert.strictEqual(counterStore.get(), 15);
});

test("store - transactional effects yield actions", async () => {
  type Action = { type: "fetch" } | { type: "set"; value: number };

  const update: Update<number, Action, void> = (state, action) => {
    switch (action.type) {
      case "fetch":
        return tx<number, Action>(state, async function* () {
          await delay(10);
          yield { type: "set", value: 42 };
        });
      case "set":
        return tx(action.value);
      default:
        return unreachable(state, action);
    }
  };

  const myStore = store(update, 0);

  myStore.send({ type: "fetch" });
  assert.strictEqual(myStore.get(), 0);

  await delay(20);

  assert.strictEqual(myStore.get(), 42);
});

test("store - effects can yield multiple actions", async () => {
  type Action = { type: "start" } | { type: "increment" };

  const update: Update<number, Action, void> = (state, action) => {
    switch (action.type) {
      case "start":
        return tx<number, Action>(state, async function* () {
          yield { type: "increment" };
          await delay(5);
          yield { type: "increment" };
          yield { type: "increment" };
        });
      case "increment":
        return tx(state + 1);
      default:
        return unreachable(state, action);
    }
  };

  const myStore = store(update, 0);
  myStore.send({ type: "start" });

  await delay(20);

  assert.strictEqual(myStore.get(), 3);
});

test("store - transactional check-then-update-then-effect", async () => {
  type Model = {
    count: number;
    fetching: boolean;
  };

  type Action = { type: "fetch" } | { type: "set"; value: number };

  const update: Update<Model, Action, void> = (state, action) => {
    switch (action.type) {
      case "fetch":
        // Check: if already fetching, do nothing (no duplicate effects)
        if (state.fetching) {
          return tx(state);
        }
        // Update flag AND issue effect in a single transaction
        return tx<Model, Action>(
          { ...state, fetching: true },
          async function* () {
            await delay(10);
            yield { type: "set", value: 42 };
          },
        );
      case "set":
        return tx({ ...state, count: action.value, fetching: false } as Model);
      default:
        return unreachable(state, action);
    }
  };

  const myStore = store(update, { count: 0, fetching: false });

  // First fetch: sets fetching=true, starts effect
  myStore.send({ type: "fetch" });
  assert.strictEqual(myStore.get().fetching, true);

  // Second fetch while first is in-flight: no-op (no duplicate effect)
  myStore.send({ type: "fetch" });
  assert.strictEqual(myStore.get().fetching, true);

  await delay(20);

  assert.strictEqual(myStore.get().count, 42);
  assert.strictEqual(myStore.get().fetching, false);
});

test("store - context is passed to update function", () => {
  type Context = { multiplier: number };

  const update: Update<number, CounterAction, Context> = (
    state,
    action,
    context,
  ) => {
    switch (action.type) {
      case "increment":
        return tx(state + context.multiplier);
      case "decrement":
        return tx(state - context.multiplier);
      default:
        return tx(state);
    }
  };

  const myStore = store(update, 0, { multiplier: 10 });

  myStore.send({ type: "increment" });
  assert.strictEqual(myStore.get(), 10);

  myStore.send({ type: "decrement" });
  assert.strictEqual(myStore.get(), 0);
});

test("withLogging - logs actions and state transitions", () => {
  const logs: string[] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    const update: Update<number, CounterAction, void> = (state, action) => {
      switch (action.type) {
        case "increment":
          return tx(state + 1);
        case "decrement":
          return tx(state - 1);
        default:
          return tx(state);
      }
    };

    const logged = withLogging(update, { name: "counter" });
    const counterStore = store(logged, 0);

    counterStore.send({ type: "increment" });

    assert.strictEqual(logs.length, 2);
    assert.ok(logs[0].includes("<-"));
    assert.ok(logs[0].includes("counter"));
    assert.ok(logs[1].includes("->"));
    assert.ok(logs[1].includes("counter"));
  } finally {
    console.debug = originalDebug;
  }
});

test("withLogging - respects log predicate", () => {
  const logs: string[] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    const update: Update<number, CounterAction, void> = (state, action) => {
      switch (action.type) {
        case "increment":
          return tx(state + 1);
        default:
          return tx(state);
      }
    };

    const logged = withLogging(update, { log: () => false });
    const counterStore = store(logged, 0);

    counterStore.send({ type: "increment" });
    assert.strictEqual(counterStore.get(), 1);
    assert.strictEqual(logs.length, 0);
  } finally {
    console.debug = originalDebug;
  }
});

test("unreachable - logs error and returns state unchanged", () => {
  const originalError = console.error;
  let errorMessage = "";

  console.error = (msg: string, data: unknown) => {
    errorMessage = `${msg} ${JSON.stringify(data)}`;
  };

  try {
    const state = { count: 5 };
    const unknownAction = { type: "unknown", data: "test" };

    // @ts-expect-error - we want to test unreachable
    const result = unreachable(state, unknownAction);

    assert.strictEqual(result.state, state);
    assert.strictEqual(
      errorMessage,
      'Unreachable action {"type":"unknown","data":"test"}',
    );
  } finally {
    console.error = originalError;
  }
});
