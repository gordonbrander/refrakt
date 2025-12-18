import { test } from "node:test";
import assert from "node:assert/strict";
import { forward, action, type Reducer, store, updateUnknown } from "./store.js";

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

test("store - creates store with initial state", () => {
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
        return updateUnknown(state, action);
    }
  };

  const counterStore = store(counterReducer, 0);

  assert.strictEqual(counterStore.get(), 0);
});

test("store - handles actions through send", () => {
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
        return updateUnknown(state, action);
    }
  };

  const counterStore = store(counterReducer, 0);

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

test("store - works with complex state", () => {
  const todoReducer: Reducer<TodoState, TodoAction> = (state, action) => {
    switch (action.type) {
      case "add":
        return {
          ...state,
          todos: [...state.todos, {
            id: state.nextId,
            text: action.text,
            completed: false,
          }],
          nextId: state.nextId + 1,
        };
      case "toggle":
        return {
          ...state,
          todos: state.todos.map((todo) =>
            todo.id === action.id
              ? { ...todo, completed: !todo.completed }
              : todo
          ),
        };
      case "remove":
        return {
          ...state,
          todos: state.todos.filter((todo) => todo.id !== action.id),
        };
      default:
        return updateUnknown(state, action);
    }
  };

  const todoStore = store(todoReducer, { todos: [], nextId: 1 });

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

test("action - creates tagged action", () => {
  const testAction = action("test", 42);

  assert.strictEqual(testAction.type, "test");
  assert.strictEqual(testAction.value, 42);
});

test("action - works with different value types", () => {
  const stringAction = action("string", "hello");
  assert.strictEqual(stringAction.type, "string");
  assert.strictEqual(stringAction.value, "hello");

  const objectAction = action("object", { key: "value" });
  assert.strictEqual(objectAction.type, "object");
  assert.deepStrictEqual(objectAction.value, { key: "value" });

  const arrayAction = action("array", [1, 2, 3]);
  assert.strictEqual(arrayAction.type, "array");
  assert.deepStrictEqual(arrayAction.value, [1, 2, 3]);
});

test("forward - transforms actions", () => {
  const receivedActions: string[] = [];

  const parentSend = (action: string) => {
    receivedActions.push(action);
  };

  const childSend = forward(
    parentSend,
    (childAction: number) => `child:${childAction}`,
  );

  childSend(1);
  childSend(2);
  childSend(3);

  assert.deepStrictEqual(receivedActions, ["child:1", "child:2", "child:3"]);
});

test("forward - works with complex transformations", () => {
  type ParentAction = { type: "parent"; data: string };
  type ChildAction = { type: "child"; value: number };

  const receivedActions: ParentAction[] = [];

  const parentSend = (action: ParentAction) => {
    receivedActions.push(action);
  };

  const childSend = forward(parentSend, (childAction: ChildAction) => ({
    type: "parent" as const,
    data: `transformed-${childAction.value}`,
  }));

  childSend({ type: "child", value: 42 });

  assert.strictEqual(receivedActions.length, 1);
  assert.strictEqual(receivedActions[0].type, "parent");
  assert.strictEqual(receivedActions[0].data, "transformed-42");
});

test("updateUnknown - logs warning and returns state unchanged", () => {
  const originalWarn = console.warn;
  let warningMessage = "";

  // Mock console.warn
  console.warn = (msg: string, data: unknown) => {
    warningMessage = `${msg} ${JSON.stringify(data)}`;
  };

  try {
    const state = { count: 5 };
    const unknownAction = { type: "unknown", data: "test" };

    // @ts-ignore - we want to test updateUnknown
    const result = updateUnknown(state, unknownAction);

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
