import { test } from "node:test";
import assert from "node:assert/strict";
import { reducer, type Reducer, unknown, withLogging } from "./reducer.js";

// Test types for actions
type CounterAction =
  | { type: "increment" }
  | { type: "decrement" }
  | { type: "set"; value: number }
  | { type: "add"; value: number };

type TodoAction =
  | { type: "add"; text: string }
  | { type: "toggle"; id: number }
  | { type: "remove"; id: number };

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

interface TodoState {
  todos: Todo[];
  nextId: number;
}

test("reducer - creates reducer with initial state", () => {
  const counterReducer: Reducer<number, CounterAction> = (state, action) => {
    switch (action.type) {
      case "increment":
        return state + 1;
      case "decrement":
        return state - 1;
      case "set":
        return action.value;
      case "add":
        return state + action.value;
      default:
        return unknown(state, action);
    }
  };

  const counterStore = reducer(counterReducer, 0);

  assert.strictEqual(counterStore.get(), 0);
});

test("reducer - handles actions through send", () => {
  const counterReducer: Reducer<number, CounterAction> = (state, action) => {
    switch (action.type) {
      case "increment":
        return state + 1;
      case "decrement":
        return state - 1;
      case "set":
        return action.value;
      case "add":
        return state + action.value;
      default:
        return unknown(state, action);
    }
  };

  const counterStore = reducer(counterReducer, 0);

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

test("reducer - works with complex state", () => {
  const todoReducer: Reducer<TodoState, TodoAction> = (state, action) => {
    switch (action.type) {
      case "add":
        return {
          ...state,
          todos: [
            ...state.todos,
            {
              id: state.nextId,
              text: action.text,
              completed: false,
            },
          ],
          nextId: state.nextId + 1,
        };
      case "toggle":
        return {
          ...state,
          todos: state.todos.map((todo) =>
            todo.id === action.id
              ? { ...todo, completed: !todo.completed }
              : todo,
          ),
        };
      case "remove":
        return {
          ...state,
          todos: state.todos.filter((todo) => todo.id !== action.id),
        };
      default:
        return unknown(state, action);
    }
  };

  const todoStore = reducer(todoReducer, { todos: [], nextId: 1 });

  assert.strictEqual(todoStore.get().todos.length, 0);

  todoStore.send({ type: "add", text: "Buy milk" });
  assert.strictEqual(todoStore.get().todos.length, 1);
  assert.strictEqual(todoStore.get().todos[0].text, "Buy milk");
  assert.strictEqual(todoStore.get().todos[0].completed, false);
  assert.strictEqual(todoStore.get().todos[0].id, 1);

  todoStore.send({ type: "add", text: "Walk dog" });
  assert.strictEqual(todoStore.get().todos.length, 2);
  assert.strictEqual(todoStore.get().nextId, 3);

  todoStore.send({ type: "toggle", id: 1 });
  assert.strictEqual(todoStore.get().todos[0].completed, true);

  todoStore.send({ type: "remove", id: 1 });
  assert.strictEqual(todoStore.get().todos.length, 1);
  assert.strictEqual(todoStore.get().todos[0].text, "Walk dog");
});

test("withLogging - logs actions and state transitions", () => {
  const logs: string[] = [];
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    const counterReducer: Reducer<number, CounterAction> = (state, action) => {
      switch (action.type) {
        case "increment":
          return state + 1;
        case "decrement":
          return state - 1;
        default:
          return state;
      }
    };

    const logged = withLogging(counterReducer, { name: "counter" });
    const counterStore = reducer(logged, 0);

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
    const counterReducer: Reducer<number, CounterAction> = (state, action) => {
      switch (action.type) {
        case "increment":
          return state + 1;
        default:
          return state;
      }
    };

    const logged = withLogging(counterReducer, { log: () => false });
    const counterStore = reducer(logged, 0);

    counterStore.send({ type: "increment" });
    assert.strictEqual(counterStore.get(), 1);
    assert.strictEqual(logs.length, 0);
  } finally {
    console.debug = originalDebug;
  }
});

test("unknown - logs warning and returns state unchanged", () => {
  const originalWarn = console.warn;
  let warningMessage = "";

  // Mock console.warn
  console.warn = (msg: string, data: unknown) => {
    warningMessage = `${msg} ${JSON.stringify(data)}`;
  };

  try {
    const state = { count: 5 };
    const unknownAction = { type: "unknown", data: "test" };

    // @ts-expect-error - we want to test updateUnknown
    const result = unknown(state, unknownAction);

    assert.strictEqual(result, state);
    assert.strictEqual(
      warningMessage,
      'Unknown action {"type":"unknown","data":"test"}',
    );
  } finally {
    // Restore console.warn
    console.warn = originalWarn;
  }
});
