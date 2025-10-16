import { test } from "node:test";
import assert from "node:assert/strict";
import { forward, msg, type Reducer, store, updateUnknown } from "./store.js";

// Test types for messaging
type CounterMsg =
  | { type: "increment" }
  | { type: "decrement" }
  | { type: "set"; value: number }
  | { type: "add"; value: number };

type TodoMsg =
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
  const counterReducer: Reducer<number, CounterMsg> = (state, message) => {
    switch (message.type) {
      case "increment":
        return state + 1;
      case "decrement":
        return state - 1;
      case "set":
        return message.value;
      case "add":
        return state + message.value;
      default:
        return updateUnknown(state, message);
    }
  };

  const counterStore = store(counterReducer, 0);

  assert.strictEqual(counterStore.get(), 0);
});

test("store - handles messages through send", () => {
  const counterReducer: Reducer<number, CounterMsg> = (state, message) => {
    switch (message.type) {
      case "increment":
        return state + 1;
      case "decrement":
        return state - 1;
      case "set":
        return message.value;
      case "add":
        return state + message.value;
      default:
        return updateUnknown(state, message);
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
  const todoReducer: Reducer<TodoState, TodoMsg> = (state, message) => {
    switch (message.type) {
      case "add":
        return {
          ...state,
          todos: [...state.todos, {
            id: state.nextId,
            text: message.text,
            completed: false,
          }],
          nextId: state.nextId + 1,
        };
      case "toggle":
        return {
          ...state,
          todos: state.todos.map((todo) =>
            todo.id === message.id
              ? { ...todo, completed: !todo.completed }
              : todo
          ),
        };
      case "remove":
        return {
          ...state,
          todos: state.todos.filter((todo) => todo.id !== message.id),
        };
      default:
        return updateUnknown(state, message);
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

test("msg - creates tagged message", () => {
  const message = msg("test", 42);

  assert.strictEqual(message.type, "test");
  assert.strictEqual(message.value, 42);
});

test("msg - works with different value types", () => {
  const stringMsg = msg("string", "hello");
  assert.strictEqual(stringMsg.type, "string");
  assert.strictEqual(stringMsg.value, "hello");

  const objectMsg = msg("object", { key: "value" });
  assert.strictEqual(objectMsg.type, "object");
  assert.deepStrictEqual(objectMsg.value, { key: "value" });

  const arrayMsg = msg("array", [1, 2, 3]);
  assert.strictEqual(arrayMsg.type, "array");
  assert.deepStrictEqual(arrayMsg.value, [1, 2, 3]);
});

test("forward - transforms messages", () => {
  const receivedMessages: string[] = [];

  const parentSend = (msg: string) => {
    receivedMessages.push(msg);
  };

  const childSend = forward(
    parentSend,
    (childMsg: number) => `child:${childMsg}`,
  );

  childSend(1);
  childSend(2);
  childSend(3);

  assert.deepStrictEqual(receivedMessages, ["child:1", "child:2", "child:3"]);
});

test("forward - works with complex transformations", () => {
  type ParentMsg = { type: "parent"; data: string };
  type ChildMsg = { type: "child"; value: number };

  const receivedMessages: ParentMsg[] = [];

  const parentSend = (msg: ParentMsg) => {
    receivedMessages.push(msg);
  };

  const childSend = forward(parentSend, (childMsg: ChildMsg) => ({
    type: "parent" as const,
    data: `transformed-${childMsg.value}`,
  }));

  childSend({ type: "child", value: 42 });

  assert.strictEqual(receivedMessages.length, 1);
  assert.strictEqual(receivedMessages[0].type, "parent");
  assert.strictEqual(receivedMessages[0].data, "transformed-42");
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
    const unknownMsg = { type: "unknown", data: "test" };

    const result = updateUnknown(state, unknownMsg);

    assert.strictEqual(result, state);
    assert.strictEqual(
      warningMessage,
      'Unknown message {"type":"unknown","data":"test"}',
    );
  } finally {
    // Restore console.warn
    console.warn = originalWarn;
  }
});
