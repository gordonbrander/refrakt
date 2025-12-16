import { test } from "node:test";
import assert from "node:assert/strict";
import { scope } from "./scope.js";
import { type Reducer, store } from "../store.js";
import { pipe } from "../pipe.js";
import { effect } from "../signal.js";

// Test types for parent store
type ParentAction =
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
type ChildAction =
  | { type: "increment" }
  | { type: "set"; value: number };

test("scope - creates scoped store with subset of parent state", () => {
  const parentReducer: Reducer<ParentState, ParentAction> = (state, action) => {
    switch (action.type) {
      case "increment_counter":
        return { ...state, counter: state.counter + 1 };
      case "set_counter":
        return { ...state, counter: action.value };
      case "set_name":
        return { ...state, name: action.name };
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
      (_action: ChildAction) => ({ type: "child_increment" }),
    ),
  );

  assert.strictEqual(childStore.get(), 0);
  assert.strictEqual(parentStore.get().counter, 0);
});

test("scope - maps child actions to parent actions", () => {
  const parentReducer: Reducer<ParentState, ParentAction> = (state, action) => {
    switch (action.type) {
      case "increment_counter":
        return { ...state, counter: state.counter + 1 };
      case "child_increment":
        return { ...state, counter: state.counter + 1 };
      case "child_set":
        return { ...state, counter: action.value };
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
      (action: ChildAction) => {
        switch (action.type) {
          case "increment":
            return { type: "child_increment" };
          case "set":
            return { type: "child_set", value: action.value };
        }
      },
    ),
  );

  // Send action to child store
  childStore.send({ type: "increment" });
  assert.strictEqual(childStore.get(), 1);
  assert.strictEqual(parentStore.get().counter, 1);

  childStore.send({ type: "set", value: 10 });
  assert.strictEqual(childStore.get(), 10);
  assert.strictEqual(parentStore.get().counter, 10);
});

test("scope - reflects parent state changes in scoped store", () => {
  const parentReducer: Reducer<ParentState, ParentAction> = (state, action) => {
    switch (action.type) {
      case "increment_counter":
        return { ...state, counter: state.counter + 1 };
      case "set_counter":
        return { ...state, counter: action.value };
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
      (_action: ChildAction) => ({ type: "child_increment" }),
    ),
  );

  assert.strictEqual(childStore.get(), 5);

  // Update parent store directly
  parentStore.send({ type: "increment_counter" });
  assert.strictEqual(childStore.get(), 6);

  parentStore.send({ type: "set_counter", value: 100 });
  assert.strictEqual(childStore.get(), 100);
});

test("scope - isolates child from unrelated parent state changes", () => {
  const parentReducer: Reducer<ParentState, ParentAction> = (state, action) => {
    switch (action.type) {
      case "set_name":
        return { ...state, name: action.name };
      case "set_counter":
        return { ...state, counter: action.value };
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
      (_action: ChildAction) => ({ type: "child_increment" }),
    ),
  );

  assert.strictEqual(childStore.get(), 0);

  // Change unrelated parent state
  parentStore.send({ type: "set_name", name: "new name" });

  // Child store should still return the same counter value
  assert.strictEqual(childStore.get(), 0);
  assert.strictEqual(parentStore.get().name, "new name");
});

test("scope - works with complex state transformations", () => {
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

  type ComplexParentAction =
    | { type: "set_name"; name: string }
    | { type: "set_age"; age: number }
    | { type: "child_set_name"; name: string };

  type ChildProfileAction = { type: "set_name"; name: string };

  const complexReducer: Reducer<ComplexParent, ComplexParentAction> = (
    state,
    action,
  ) => {
    switch (action.type) {
      case "set_name":
      case "child_set_name":
        return {
          ...state,
          user: {
            ...state.user,
            profile: { ...state.user.profile, name: action.name },
          },
        };
      case "set_age":
        return {
          ...state,
          user: {
            ...state.user,
            profile: { ...state.user.profile, age: action.age },
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
      (action: ChildProfileAction) => ({ type: "child_set_name", name: action.name }),
    ),
  );

  assert.deepStrictEqual(profileStore.get(), { name: "Alice", age: 30 });

  // Send action through child
  profileStore.send({ type: "set_name", name: "Bob" });
  assert.strictEqual(profileStore.get().name, "Bob");
  assert.strictEqual(parentStore.get().user.profile.name, "Bob");

  // Update parent
  parentStore.send({ type: "set_age", age: 31 });
  assert.strictEqual(profileStore.get().age, 31);
});

test("scope - works with primitive value scopes", () => {
  type PrimitiveParentAction =
    | { type: "set_name"; name: string }
    | { type: "child_set_name"; name: string };

  const parentReducer: Reducer<ParentState, PrimitiveParentAction> = (
    state,
    action,
  ) => {
    switch (action.type) {
      case "set_name":
      case "child_set_name":
        return { ...state, name: action.name };
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
      (action: { type: "set"; value: string }) => ({
        type: "child_set_name",
        name: action.value,
      }),
    ),
  );

  assert.strictEqual(nameStore.get(), "initial");

  nameStore.send({ type: "set", value: "updated" });
  assert.strictEqual(nameStore.get(), "updated");
  assert.strictEqual(parentStore.get().name, "updated");
});

test("scope - can be chained for nested scoping", () => {
  interface NestedState {
    level1: {
      level2: {
        level3: {
          value: number;
        };
      };
    };
  }

  type NestedAction =
    | { type: "set_value"; value: number }
    | { type: "l1_set_value"; value: number }
    | { type: "l2_set_value"; value: number }
    | { type: "l3_set_value"; value: number };

  const nestedReducer: Reducer<NestedState, NestedAction> = (state, action) => {
    switch (action.type) {
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
              level3: { value: action.value },
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
      (action: NestedAction) =>
        action.type === "set_value"
          ? { type: "l1_set_value", value: action.value }
          : action,
    ),
  );

  // Second level of scoping
  const level2Store = pipe(
    level1Store,
    scope(
      (state) => state.level2,
      (action: NestedAction) =>
        action.type === "set_value"
          ? { type: "l2_set_value", value: action.value }
          : action,
    ),
  );

  // Third level of scoping
  const level3Store = pipe(
    level2Store,
    scope(
      (state) => state.level3,
      (action: NestedAction) =>
        action.type === "set_value"
          ? { type: "l3_set_value", value: action.value }
          : action,
    ),
  );

  assert.deepStrictEqual(level3Store.get(), { value: 0 });

  level3Store.send({ type: "set_value", value: 42 });
  assert.strictEqual(level3Store.get().value, 42);
  assert.strictEqual(rootStore.get().level1.level2.level3.value, 42);
});

test("scope - works with effects and reactivity", async () => {
  const parentReducer: Reducer<ParentState, ParentAction> = (state, action) => {
    switch (action.type) {
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
      (_action: ChildAction) => ({ type: "child_increment" }),
    ),
  );

  const effectValues: number[] = [];

  const cleanup = effect(() => {
    effectValues.push(childStore.get());
  });

  // Initial value
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(effectValues[0], 0);

  // Update through child
  childStore.send({ type: "increment" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(effectValues[effectValues.length - 1], 1);

  // Update through parent
  parentStore.send({ type: "increment_counter" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(effectValues[effectValues.length - 1], 2);

  cleanup();
});

test("scope - multiple scoped stores from same parent", () => {
  const parentReducer: Reducer<ParentState, ParentAction> = (state, action) => {
    switch (action.type) {
      case "increment_counter":
        return { ...state, counter: state.counter + 1 };
      case "set_name":
        return { ...state, name: action.name };
      case "child_increment":
        return { ...state, counter: state.counter + 1 };
      case "child_set":
        return { ...state, counter: action.value };
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
      (action: ChildAction) => {
        switch (action.type) {
          case "increment":
            return { type: "child_increment" };
          case "set":
            return { type: "child_set", value: action.value };
        }
      },
    ),
  );

  // Second scoped store - name
  const nameStore = pipe(
    parentStore,
    scope(
      (state) => state.name,
      (action: { type: "set_name"; name: string }) => action,
    ),
  );

  assert.strictEqual(counterStore.get(), 10);
  assert.strictEqual(nameStore.get(), "parent");

  // Update counter
  counterStore.send({ type: "increment" });
  assert.strictEqual(counterStore.get(), 11);
  assert.strictEqual(nameStore.get(), "parent"); // unchanged

  // Update name
  nameStore.send({ type: "set_name", name: "updated" });
  assert.strictEqual(counterStore.get(), 11); // unchanged
  assert.strictEqual(nameStore.get(), "updated");
});

test("scope - handles computed transformations", () => {
  interface TodoState {
    todos: Array<{ id: number; text: string; completed: boolean }>;
  }

  type TodoAction =
    | { type: "toggle"; id: number }
    | { type: "child_toggle"; id: number };

  type CompletedAction = { type: "toggle"; id: number };

  const todoReducer: Reducer<TodoState, TodoAction> = (state, action) => {
    switch (action.type) {
      case "toggle":
      case "child_toggle":
        return {
          ...state,
          todos: state.todos.map((todo) =>
            todo.id === action.id ? { ...todo, completed: !todo.completed } : todo
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
      (action: CompletedAction) => ({ type: "child_toggle", id: action.id }),
    ),
  );

  assert.strictEqual(completedStore.get().length, 1);
  assert.strictEqual(completedStore.get()[0].id, 2);

  // Toggle a completed todo
  completedStore.send({ type: "toggle", id: 2 });

  // Now no todos are completed
  assert.strictEqual(completedStore.get().length, 0);

  // Toggle another todo through parent
  parentStore.send({ type: "toggle", id: 1 });
  assert.strictEqual(completedStore.get().length, 1);
  assert.strictEqual(completedStore.get()[0].id, 1);
});

test("scope - preserves referential equality for unchanged scopes", () => {
  const parentReducer: Reducer<ParentState, ParentAction> = (state, action) => {
    switch (action.type) {
      case "set_name":
        return { ...state, name: action.name };
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
      (_action: ChildAction) => ({ type: "child_increment" }),
    ),
  );

  const firstGet = childStore.get();

  // Change unrelated parent state
  parentStore.send({ type: "set_name", name: "new name" });

  const secondGet = childStore.get();

  // The scoped value should be the same (both return 0)
  assert.strictEqual(firstGet, secondGet);
});
