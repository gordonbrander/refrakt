import { assertEquals } from "@std/assert";
import {
  forward,
  type Middleware,
  msg,
  type Reducer,
  store,
  updateUnknown,
} from "./store.ts";

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

Deno.test("store - creates store with initial state", () => {
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

  const counterStore = store({
    state: 0,
    update: counterReducer,
  });

  assertEquals(counterStore.get(), 0);
});

Deno.test("store - handles messages through send", () => {
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

  const counterStore = store({
    state: 0,
    update: counterReducer,
  });

  counterStore.send({ type: "increment" });
  assertEquals(counterStore.get(), 1);

  counterStore.send({ type: "increment" });
  assertEquals(counterStore.get(), 2);

  counterStore.send({ type: "decrement" });
  assertEquals(counterStore.get(), 1);

  counterStore.send({ type: "set", value: 10 });
  assertEquals(counterStore.get(), 10);

  counterStore.send({ type: "add", value: 5 });
  assertEquals(counterStore.get(), 15);
});

Deno.test("store - works with complex state", () => {
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

  const todoStore = store({
    state: { todos: [], nextId: 1 },
    update: todoReducer,
  });

  assertEquals(todoStore.get().todos.length, 0);

  todoStore.send({ type: "add", text: "Buy milk" });
  assertEquals(todoStore.get().todos.length, 1);
  assertEquals(todoStore.get().todos[0].text, "Buy milk");
  assertEquals(todoStore.get().todos[0].completed, false);
  assertEquals(todoStore.get().todos[0].id, 1);

  todoStore.send({ type: "add", text: "Walk dog" });
  assertEquals(todoStore.get().todos.length, 2);
  assertEquals(todoStore.get().nextId, 3);

  todoStore.send({ type: "toggle", id: 1 });
  assertEquals(todoStore.get().todos[0].completed, true);

  todoStore.send({ type: "remove", id: 1 });
  assertEquals(todoStore.get().todos.length, 1);
  assertEquals(todoStore.get().todos[0].text, "Walk dog");
});

Deno.test("store - applies middleware", () => {
  const counterReducer: Reducer<number, CounterMsg> = (state, message) => {
    switch (message.type) {
      case "increment":
        return state + 1;
      case "decrement":
        return state - 1;
      default:
        return updateUnknown(state, message);
    }
  };

  const logs: string[] = [];

  const loggingMiddleware: Middleware<number, CounterMsg> =
    (get) => (send) => (msg) => {
      logs.push(`Before: ${get()}, Message: ${JSON.stringify(msg)}`);
      send(msg);
      logs.push(`After: ${get()}`);
    };

  const counterStore = store({
    state: 0,
    update: counterReducer,
    middleware: [loggingMiddleware],
  });

  counterStore.send({ type: "increment" });

  assertEquals(logs.length, 2);
  assertEquals(logs[0], 'Before: 0, Message: {"type":"increment"}');
  assertEquals(logs[1], "After: 1");
  assertEquals(counterStore.get(), 1);
});

Deno.test("store - applies multiple middleware in order", () => {
  const counterReducer: Reducer<number, CounterMsg> = (state, message) => {
    switch (message.type) {
      case "increment":
        return state + 1;
      default:
        return updateUnknown(state, message);
    }
  };

  const execution: string[] = [];

  const middleware1: Middleware<number, CounterMsg> = () => (send) => (msg) => {
    execution.push("middleware1-before");
    send(msg);
    execution.push("middleware1-after");
  };

  const middleware2: Middleware<number, CounterMsg> = () => (send) => (msg) => {
    execution.push("middleware2-before");
    send(msg);
    execution.push("middleware2-after");
  };

  const counterStore = store({
    state: 0,
    update: counterReducer,
    middleware: [middleware1, middleware2],
  });

  counterStore.send({ type: "increment" });

  assertEquals(execution, [
    "middleware2-before",
    "middleware1-before",
    "middleware1-after",
    "middleware2-after",
  ]);
});

Deno.test("store - middleware can access current state", () => {
  const counterReducer: Reducer<number, CounterMsg> = (state, message) => {
    switch (message.type) {
      case "increment":
        return state + 1;
      case "set":
        return message.value;
      default:
        return updateUnknown(state, message);
    }
  };

  const capturedStates: number[] = [];

  const stateCapturingMiddleware: Middleware<number, CounterMsg> =
    (getState) => (send) => (msg) => {
      capturedStates.push(getState());
      send(msg);
      capturedStates.push(getState());
    };

  const counterStore = store({
    state: 5,
    update: counterReducer,
    middleware: [stateCapturingMiddleware],
  });

  counterStore.send({ type: "increment" });
  counterStore.send({ type: "set", value: 10 });

  assertEquals(capturedStates, [5, 6, 6, 10]);
});

Deno.test("store - middleware can prevent message sending", () => {
  const counterReducer: Reducer<number, CounterMsg> = (state, message) => {
    switch (message.type) {
      case "increment":
        return state + 1;
      case "decrement":
        return state - 1;
      default:
        return updateUnknown(state, message);
    }
  };

  const preventNegativeMiddleware: Middleware<number, CounterMsg> =
    (getState) => (send) => (msg) => {
      if (msg.type === "decrement" && getState() <= 0) {
        // Don't send the message if it would make the counter negative
        return;
      }
      send(msg);
    };

  const counterStore = store({
    state: 1,
    update: counterReducer,
    middleware: [preventNegativeMiddleware],
  });

  counterStore.send({ type: "decrement" });
  assertEquals(counterStore.get(), 0);

  counterStore.send({ type: "decrement" });
  assertEquals(counterStore.get(), 0); // Should not go negative

  counterStore.send({ type: "increment" });
  assertEquals(counterStore.get(), 1);
});

Deno.test("msg - creates tagged message", () => {
  const message = msg("test", 42);

  assertEquals(message.type, "test");
  assertEquals(message.value, 42);
});

Deno.test("msg - works with different value types", () => {
  const stringMsg = msg("string", "hello");
  assertEquals(stringMsg.type, "string");
  assertEquals(stringMsg.value, "hello");

  const objectMsg = msg("object", { key: "value" });
  assertEquals(objectMsg.type, "object");
  assertEquals(objectMsg.value, { key: "value" });

  const arrayMsg = msg("array", [1, 2, 3]);
  assertEquals(arrayMsg.type, "array");
  assertEquals(arrayMsg.value, [1, 2, 3]);
});

Deno.test("forward - transforms messages", () => {
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

  assertEquals(receivedMessages, ["child:1", "child:2", "child:3"]);
});

Deno.test("forward - works with complex transformations", () => {
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

  assertEquals(receivedMessages.length, 1);
  assertEquals(receivedMessages[0].type, "parent");
  assertEquals(receivedMessages[0].data, "transformed-42");
});

Deno.test("updateUnknown - logs warning and returns state unchanged", () => {
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

    assertEquals(result, state);
    assertEquals(
      warningMessage,
      'Unknown message {"type":"unknown","data":"test"}',
    );
  } finally {
    // Restore console.warn
    console.warn = originalWarn;
  }
});
