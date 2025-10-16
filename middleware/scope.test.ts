import { assertEquals } from "@std/assert";
import { scope } from "./scope.ts";
import { type Reducer, store } from "../store.ts";
import { pipe } from "../pipe.ts";
import { effect } from "../signal.ts";

// Test types for parent store
type ParentMsg =
  | { type: "increment_counter" }
  | { type: "decrement_counter" }
  | { type: "set_counter"; value: number }
  | { type: "set_name"; name: string }
  | { type: "child_increment" }
  | { type: "child_set"; value: number };

interface ParentState {
  counter: number;
  name: string;
  timestamp: number;
}

// Test types for child store
type ChildMsg =
  | { type: "increment" }
  | { type: "set"; value: number };

Deno.test("scope - creates scoped store with subset of parent state", () => {
  const parentReducer: Reducer<ParentState, ParentMsg> = (state, msg) => {
    switch (msg.type) {
      case "increment_counter":
        return { ...state, counter: state.counter + 1 };
      case "set_counter":
        return { ...state, counter: msg.value };
      case "set_name":
        return { ...state, name: msg.name };
      default:
        return state;
    }
  };

  const parentStore = store(parentReducer, {
    counter: 0,
    name: "test",
    timestamp: 0,
  });

  // Create a scoped store that only exposes the counter
  const childStore = pipe(
    parentStore,
    scope(
      (state) => state.counter,
      (_msg: ChildMsg) => ({ type: "child_increment" }),
    ),
  );

  assertEquals(childStore.get(), 0);
  assertEquals(parentStore.get().counter, 0);
});

Deno.test("scope - maps child messages to parent messages", () => {
  const parentReducer: Reducer<ParentState, ParentMsg> = (state, msg) => {
    switch (msg.type) {
      case "increment_counter":
        return { ...state, counter: state.counter + 1 };
      case "child_increment":
        return { ...state, counter: state.counter + 1 };
      case "child_set":
        return { ...state, counter: msg.value };
      default:
        return state;
    }
  };

  const parentStore = store(parentReducer, {
    counter: 0,
    name: "test",
    timestamp: 0,
  });

  const childStore = pipe(
    parentStore,
    scope(
      (state) => state.counter,
      (msg: ChildMsg) => {
        switch (msg.type) {
          case "increment":
            return { type: "child_increment" };
          case "set":
            return { type: "child_set", value: msg.value };
        }
      },
    ),
  );

  // Send message to child store
  childStore.send({ type: "increment" });
  assertEquals(childStore.get(), 1);
  assertEquals(parentStore.get().counter, 1);

  childStore.send({ type: "set", value: 10 });
  assertEquals(childStore.get(), 10);
  assertEquals(parentStore.get().counter, 10);
});

Deno.test("scope - reflects parent state changes in scoped store", () => {
  const parentReducer: Reducer<ParentState, ParentMsg> = (state, msg) => {
    switch (msg.type) {
      case "increment_counter":
        return { ...state, counter: state.counter + 1 };
      case "set_counter":
        return { ...state, counter: msg.value };
      default:
        return state;
    }
  };

  const parentStore = store(parentReducer, {
    counter: 5,
    name: "test",
    timestamp: 0,
  });

  const childStore = pipe(
    parentStore,
    scope(
      (state) => state.counter,
      (_msg: ChildMsg) => ({ type: "child_increment" }),
    ),
  );

  assertEquals(childStore.get(), 5);

  // Update parent store directly
  parentStore.send({ type: "increment_counter" });
  assertEquals(childStore.get(), 6);

  parentStore.send({ type: "set_counter", value: 100 });
  assertEquals(childStore.get(), 100);
});

Deno.test("scope - isolates child from unrelated parent state changes", () => {
  const parentReducer: Reducer<ParentState, ParentMsg> = (state, msg) => {
    switch (msg.type) {
      case "set_name":
        return { ...state, name: msg.name };
      case "set_counter":
        return { ...state, counter: msg.value };
      default:
        return state;
    }
  };

  const parentStore = store(parentReducer, {
    counter: 0,
    name: "test",
    timestamp: 0,
  });

  const childStore = pipe(
    parentStore,
    scope(
      (state) => state.counter,
      (_msg: ChildMsg) => ({ type: "child_increment" }),
    ),
  );

  assertEquals(childStore.get(), 0);

  // Change unrelated parent state
  parentStore.send({ type: "set_name", name: "new name" });

  // Child store should still return the same counter value
  assertEquals(childStore.get(), 0);
  assertEquals(parentStore.get().name, "new name");
});

Deno.test("scope - works with complex state transformations", () => {
  interface ComplexParent {
    user: {
      id: number;
      profile: {
        name: string;
        age: number;
      };
      settings: {
        theme: string;
        notifications: boolean;
      };
    };
  }

  type ComplexParentMsg =
    | { type: "set_name"; name: string }
    | { type: "set_age"; age: number }
    | { type: "child_set_name"; name: string };

  type ChildProfileMsg = { type: "set_name"; name: string };

  const complexReducer: Reducer<ComplexParent, ComplexParentMsg> = (
    state,
    msg,
  ) => {
    switch (msg.type) {
      case "set_name":
      case "child_set_name":
        return {
          ...state,
          user: {
            ...state.user,
            profile: { ...state.user.profile, name: msg.name },
          },
        };
      case "set_age":
        return {
          ...state,
          user: {
            ...state.user,
            profile: { ...state.user.profile, age: msg.age },
          },
        };
      default:
        return state;
    }
  };

  const parentStore = store(complexReducer, {
    user: {
      id: 1,
      profile: { name: "Alice", age: 30 },
      settings: { theme: "dark", notifications: true },
    },
  });

  // Scope to just the profile
  const profileStore = pipe(
    parentStore,
    scope(
      (state) => state.user.profile,
      (msg: ChildProfileMsg) => ({ type: "child_set_name", name: msg.name }),
    ),
  );

  assertEquals(profileStore.get(), { name: "Alice", age: 30 });

  // Send message through child
  profileStore.send({ type: "set_name", name: "Bob" });
  assertEquals(profileStore.get().name, "Bob");
  assertEquals(parentStore.get().user.profile.name, "Bob");

  // Update parent
  parentStore.send({ type: "set_age", age: 31 });
  assertEquals(profileStore.get().age, 31);
});

Deno.test("scope - works with primitive value scopes", () => {
  type PrimitiveParentMsg =
    | { type: "set_name"; name: string }
    | { type: "child_set_name"; name: string };

  const parentReducer: Reducer<ParentState, PrimitiveParentMsg> = (
    state,
    msg,
  ) => {
    switch (msg.type) {
      case "set_name":
      case "child_set_name":
        return { ...state, name: msg.name };
      default:
        return state;
    }
  };

  const parentStore = store(parentReducer, {
    counter: 0,
    name: "initial",
    timestamp: 0,
  });

  // Scope to just the name string
  const nameStore = pipe(
    parentStore,
    scope(
      (state) => state.name,
      (msg: { type: "set"; value: string }) => ({
        type: "child_set_name",
        name: msg.value,
      }),
    ),
  );

  assertEquals(nameStore.get(), "initial");

  nameStore.send({ type: "set", value: "updated" });
  assertEquals(nameStore.get(), "updated");
  assertEquals(parentStore.get().name, "updated");
});

Deno.test("scope - can be chained for nested scoping", () => {
  interface NestedState {
    level1: {
      level2: {
        level3: {
          value: number;
        };
      };
    };
  }

  type NestedMsg =
    | { type: "set_value"; value: number }
    | { type: "l1_set_value"; value: number }
    | { type: "l2_set_value"; value: number }
    | { type: "l3_set_value"; value: number };

  const nestedReducer: Reducer<NestedState, NestedMsg> = (state, msg) => {
    switch (msg.type) {
      case "set_value":
      case "l1_set_value":
      case "l2_set_value":
      case "l3_set_value":
        return {
          ...state,
          level1: {
            ...state.level1,
            level2: {
              ...state.level1.level2,
              level3: { value: msg.value },
            },
          },
        };
      default:
        return state;
    }
  };

  const rootStore = store(nestedReducer, {
    level1: { level2: { level3: { value: 0 } } },
  });

  // First level of scoping
  const level1Store = pipe(
    rootStore,
    scope(
      (state) => state.level1,
      (msg: NestedMsg) =>
        msg.type === "set_value"
          ? { type: "l1_set_value", value: msg.value }
          : msg,
    ),
  );

  // Second level of scoping
  const level2Store = pipe(
    level1Store,
    scope(
      (state) => state.level2,
      (msg: NestedMsg) =>
        msg.type === "set_value"
          ? { type: "l2_set_value", value: msg.value }
          : msg,
    ),
  );

  // Third level of scoping
  const level3Store = pipe(
    level2Store,
    scope(
      (state) => state.level3,
      (msg: NestedMsg) =>
        msg.type === "set_value"
          ? { type: "l3_set_value", value: msg.value }
          : msg,
    ),
  );

  assertEquals(level3Store.get(), { value: 0 });

  level3Store.send({ type: "set_value", value: 42 });
  assertEquals(level3Store.get().value, 42);
  assertEquals(rootStore.get().level1.level2.level3.value, 42);
});

Deno.test("scope - works with effects and reactivity", async () => {
  const parentReducer: Reducer<ParentState, ParentMsg> = (state, msg) => {
    switch (msg.type) {
      case "increment_counter":
        return { ...state, counter: state.counter + 1 };
      case "child_increment":
        return { ...state, counter: state.counter + 1 };
      default:
        return state;
    }
  };

  const parentStore = store(parentReducer, {
    counter: 0,
    name: "test",
    timestamp: 0,
  });

  const childStore = pipe(
    parentStore,
    scope(
      (state) => state.counter,
      (_msg: ChildMsg) => ({ type: "child_increment" }),
    ),
  );

  const effectValues: number[] = [];

  const cleanup = effect(() => {
    effectValues.push(childStore.get());
  });

  // Initial value
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(effectValues[0], 0);

  // Update through child
  childStore.send({ type: "increment" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(effectValues[effectValues.length - 1], 1);

  // Update through parent
  parentStore.send({ type: "increment_counter" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(effectValues[effectValues.length - 1], 2);

  cleanup();
});

Deno.test("scope - multiple scoped stores from same parent", () => {
  const parentReducer: Reducer<ParentState, ParentMsg> = (state, msg) => {
    switch (msg.type) {
      case "increment_counter":
        return { ...state, counter: state.counter + 1 };
      case "set_name":
        return { ...state, name: msg.name };
      case "child_increment":
        return { ...state, counter: state.counter + 1 };
      case "child_set":
        return { ...state, counter: msg.value };
      default:
        return state;
    }
  };

  const parentStore = store(parentReducer, {
    counter: 10,
    name: "parent",
    timestamp: 0,
  });

  // First scoped store - counter
  const counterStore = pipe(
    parentStore,
    scope(
      (state) => state.counter,
      (msg: ChildMsg) => {
        switch (msg.type) {
          case "increment":
            return { type: "child_increment" };
          case "set":
            return { type: "child_set", value: msg.value };
        }
      },
    ),
  );

  // Second scoped store - name
  const nameStore = pipe(
    parentStore,
    scope(
      (state) => state.name,
      (msg: { type: "set_name"; name: string }) => msg,
    ),
  );

  assertEquals(counterStore.get(), 10);
  assertEquals(nameStore.get(), "parent");

  // Update counter
  counterStore.send({ type: "increment" });
  assertEquals(counterStore.get(), 11);
  assertEquals(nameStore.get(), "parent"); // unchanged

  // Update name
  nameStore.send({ type: "set_name", name: "updated" });
  assertEquals(counterStore.get(), 11); // unchanged
  assertEquals(nameStore.get(), "updated");
});

Deno.test("scope - handles computed transformations", () => {
  interface TodoState {
    todos: Array<{ id: number; text: string; completed: boolean }>;
  }

  type TodoMsg =
    | { type: "toggle"; id: number }
    | { type: "child_toggle"; id: number };

  type CompletedMsg = { type: "toggle"; id: number };

  const todoReducer: Reducer<TodoState, TodoMsg> = (state, msg) => {
    switch (msg.type) {
      case "toggle":
      case "child_toggle":
        return {
          ...state,
          todos: state.todos.map((todo) =>
            todo.id === msg.id ? { ...todo, completed: !todo.completed } : todo
          ),
        };
      default:
        return state;
    }
  };

  const parentStore = store(todoReducer, {
    todos: [
      { id: 1, text: "Task 1", completed: false },
      { id: 2, text: "Task 2", completed: true },
      { id: 3, text: "Task 3", completed: false },
    ],
  });

  // Scope to only completed todos
  const completedStore = pipe(
    parentStore,
    scope(
      (state) => state.todos.filter((todo) => todo.completed),
      (msg: CompletedMsg) => ({ type: "child_toggle", id: msg.id }),
    ),
  );

  assertEquals(completedStore.get().length, 1);
  assertEquals(completedStore.get()[0].id, 2);

  // Toggle a completed todo
  completedStore.send({ type: "toggle", id: 2 });

  // Now no todos are completed
  assertEquals(completedStore.get().length, 0);

  // Toggle another todo through parent
  parentStore.send({ type: "toggle", id: 1 });
  assertEquals(completedStore.get().length, 1);
  assertEquals(completedStore.get()[0].id, 1);
});

Deno.test("scope - preserves referential equality for unchanged scopes", () => {
  const parentReducer: Reducer<ParentState, ParentMsg> = (state, msg) => {
    switch (msg.type) {
      case "set_name":
        return { ...state, name: msg.name };
      case "increment_counter":
        return { ...state, counter: state.counter + 1 };
      default:
        return state;
    }
  };

  const parentStore = store(parentReducer, {
    counter: 0,
    name: "test",
    timestamp: 0,
  });

  const childStore = pipe(
    parentStore,
    scope(
      (state) => state.counter,
      (_msg: ChildMsg) => ({ type: "child_increment" }),
    ),
  );

  const firstGet = childStore.get();

  // Change unrelated parent state
  parentStore.send({ type: "set_name", name: "new name" });

  const secondGet = childStore.get();

  // The scoped value should be the same (both return 0)
  assertEquals(firstGet, secondGet);
});
