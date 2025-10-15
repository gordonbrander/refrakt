import { assertEquals } from "@std/assert";
import { type Fx, fx } from "./fx.ts";
import { type Reducer, store } from "../store.ts";

// Test types
type CounterMsg =
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

Deno.test("fx - handles simple async effects", async () => {
  const counterReducer: Reducer<CounterState, CounterMsg> = (state, msg) => {
    switch (msg.type) {
      case "increment":
        return { ...state, count: state.count + 1 };
      case "decrement":
        return { ...state, count: state.count - 1 };
      case "set":
        return { ...state, count: msg.value };
      case "async_increment":
        return { ...state, loading: true };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterMsg> = async function* (get, msg) {
    if (msg.type === "async_increment") {
      await delay(10);
      yield { type: "increment" };
      yield { type: "set", value: get().count + 5 };
    }
  };

  const counterStore = store({
    state: { count: 0, loading: false },
    update: counterReducer,
    middleware: [fx(testFx)],
  });

  counterStore.send({ type: "async_increment" });
  assertEquals(counterStore.get().loading, true);

  // Wait for async effects to complete
  await delay(20);

  assertEquals(counterStore.get().count, 6); // 0 + 1 + 5
});

Deno.test("fx - handles multiple yielded messages", async () => {
  const messages: CounterMsg[] = [];

  const counterReducer: Reducer<CounterState, CounterMsg> = (state, msg) => {
    messages.push(msg);
    switch (msg.type) {
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

  const testFx: Fx<CounterState, CounterMsg> = async function* (_get, msg) {
    if (msg.type === "multi_step") {
      yield { type: "increment" };
      await delay(5);
      yield { type: "increment" };
      yield { type: "decrement" };
      await delay(5);
      yield { type: "increment" };
    }
  };

  const counterStore = store({
    state: { count: 0, loading: false },
    update: counterReducer,
    middleware: [fx(testFx)],
  });

  counterStore.send({ type: "multi_step" });

  // Wait for all async effects
  await delay(20);

  assertEquals(counterStore.get().count, 2); // +1 +1 -1 +1 = 2
  assertEquals(messages.length, 5); // multi_step + 4 yielded messages
  assertEquals(messages[0].type, "multi_step");
  assertEquals(messages[1].type, "increment");
  assertEquals(messages[2].type, "increment");
  assertEquals(messages[3].type, "decrement");
  assertEquals(messages[4].type, "increment");
});

Deno.test("fx - ignores messages that don't trigger effects", async () => {
  const messages: CounterMsg[] = [];

  const counterReducer: Reducer<CounterState, CounterMsg> = (state, msg) => {
    messages.push(msg);
    switch (msg.type) {
      case "increment":
        return { ...state, count: state.count + 1 };
      case "no_effect":
        return { ...state, loading: false };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterMsg> = async function* (_get, msg) {
    if (msg.type === "increment") {
      await delay(5);
      yield { type: "increment" };
    }
    // no_effect message doesn't trigger any fx
  };

  const counterStore = store({
    state: { count: 0, loading: false },
    update: counterReducer,
    middleware: [fx(testFx)],
  });

  counterStore.send({ type: "no_effect" });
  assertEquals(messages.length, 1);
  assertEquals(messages[0].type, "no_effect");

  await delay(10);

  // No additional messages should have been sent
  assertEquals(messages.length, 1);
  assertEquals(counterStore.get().count, 0);
});

Deno.test("fx - can access current state", async () => {
  const counterReducer: Reducer<CounterState, CounterMsg> = (state, msg) => {
    switch (msg.type) {
      case "increment":
        return { ...state, count: state.count + 1 };
      case "set":
        return { ...state, count: msg.value };
      case "async_double":
        return { ...state, loading: true };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterMsg> = async function* (get, msg) {
    if (msg.type === "async_double") {
      const currentCount = get().count;
      await delay(5);
      yield { type: "set", value: currentCount * 2 };
    }
  };

  const counterStore = store({
    state: { count: 5, loading: false },
    update: counterReducer,
    middleware: [fx(testFx)],
  });

  counterStore.send({ type: "async_double" });

  await delay(10);

  assertEquals(counterStore.get().count, 10); // 5 * 2
});

Deno.test("fx - handles errors gracefully", async () => {
  const originalWarn = console.warn;
  let warningMessage = "";

  // Mock console.warn
  console.warn = (msg: string, _error: unknown) => {
    warningMessage = `${msg}`;
  };

  try {
    const counterReducer: Reducer<CounterState, CounterMsg> = (state, msg) => {
      switch (msg.type) {
        case "increment":
          return { ...state, count: state.count + 1 };
        case "async_error":
          return { ...state, loading: true };
        default:
          return state;
      }
    };

    // deno-lint-ignore require-yield
    const testFx: Fx<CounterState, CounterMsg> = async function* (
      _get,
      msg,
    ) {
      if (msg.type === "async_error") {
        await delay(5);
        throw new Error("Test error");
      }
    };

    const counterStore = store({
      state: { count: 0, loading: false },
      update: counterReducer,
      middleware: [fx(testFx)],
    });

    counterStore.send({ type: "async_error" });
    assertEquals(counterStore.get().loading, true);

    await delay(10);

    // Store state should remain unchanged after error
    assertEquals(counterStore.get().count, 0);
    assertEquals(counterStore.get().loading, true);
    assertEquals(warningMessage, "Error in fx");
  } finally {
    // Restore console.warn
    console.warn = originalWarn;
  }
});

Deno.test("fx - works with empty generator", async () => {
  const messages: CounterMsg[] = [];

  const counterReducer: Reducer<CounterState, CounterMsg> = (state, msg) => {
    messages.push(msg);
    return state;
  };

  // deno-lint-ignore require-yield
  const testFx: Fx<CounterState, CounterMsg> = async function* (
    _get,
    _msg,
  ) {
    // Empty generator - no yields
    await delay(5);
  };

  const counterStore = store({
    state: { count: 0, loading: false },
    update: counterReducer,
    middleware: [fx(testFx)],
  });

  counterStore.send({ type: "increment" });

  await delay(10);

  assertEquals(messages.length, 1);
  assertEquals(messages[0].type, "increment");
});

Deno.test("fx - preserves message order", async () => {
  const processedMessages: string[] = [];

  const counterReducer: Reducer<CounterState, CounterMsg> = (state, msg) => {
    processedMessages.push(`reducer:${msg.type}`);
    switch (msg.type) {
      case "increment":
        return { ...state, count: state.count + 1 };
      case "async_increment":
        return { ...state, loading: true };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterMsg> = async function* (_get, msg) {
    if (msg.type === "async_increment") {
      processedMessages.push(`fx:${msg.type}`);
      await delay(5);
      yield { type: "increment" };
    }
  };

  const counterStore = store({
    state: { count: 0, loading: false },
    update: counterReducer,
    middleware: [fx(testFx)],
  });

  counterStore.send({ type: "async_increment" });

  await delay(10);

  assertEquals(processedMessages, [
    "reducer:async_increment",
    "fx:async_increment",
    "reducer:increment",
  ]);
});

Deno.test("fx - can chain multiple async operations", async () => {
  const counterReducer: Reducer<CounterState, CounterMsg> = (state, msg) => {
    switch (msg.type) {
      case "increment":
        return { ...state, count: state.count + 1 };
      case "set":
        return { ...state, count: msg.value };
      case "async_increment":
        return { ...state, loading: true };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterMsg> = async function* (get, msg) {
    if (msg.type === "async_increment") {
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

  const counterStore = store({
    state: { count: 0, loading: false },
    update: counterReducer,
    middleware: [fx(testFx)],
  });

  counterStore.send({ type: "async_increment" });

  await delay(20);

  assertEquals(counterStore.get().count, 12); // 0 + 1 + 1 + 10
});

Deno.test("fx - runs concurrently for multiple messages", async () => {
  const timestamps: number[] = [];

  const counterReducer: Reducer<CounterState, CounterMsg> = (state, msg) => {
    switch (msg.type) {
      case "increment":
        timestamps.push(Date.now());
        return { ...state, count: state.count + 1 };
      case "async_increment":
        return { ...state, loading: true };
      default:
        return state;
    }
  };

  const testFx: Fx<CounterState, CounterMsg> = async function* (_get, msg) {
    if (msg.type === "async_increment") {
      await delay(10);
      yield { type: "increment" };
    }
  };

  const counterStore = store({
    state: { count: 0, loading: false },
    update: counterReducer,
    middleware: [fx(testFx)],
  });

  // Send multiple async messages quickly
  counterStore.send({ type: "async_increment" });
  counterStore.send({ type: "async_increment" });
  counterStore.send({ type: "async_increment" });

  await delay(20);

  assertEquals(counterStore.get().count, 3);
  assertEquals(timestamps.length, 3);

  // All should complete around the same time (within 5ms of each other)
  const timeDiff = Math.max(...timestamps) - Math.min(...timestamps);
  assertEquals(timeDiff < 5, true);
});
