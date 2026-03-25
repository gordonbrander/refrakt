import { test } from "node:test";
import assert from "node:assert/strict";
import { reducer, type Reducer } from "./reducer.js";
import { scope } from "./scope.js";

type ParentModel = {
  child: { count: number };
  other: string;
};

type ChildAction = { type: "increment" } | { type: "decrement" };

type ParentAction =
  | { type: "child"; action: ChildAction }
  | { type: "set-other"; value: string };

const parentReducer: Reducer<ParentModel, ParentAction> = (state, action) => {
  switch (action.type) {
    case "child":
      switch (action.action.type) {
        case "increment":
          return { ...state, child: { count: state.child.count + 1 } };
        case "decrement":
          return { ...state, child: { count: state.child.count - 1 } };
        default:
          return state;
      }
    case "set-other":
      return { ...state, other: action.value };
    default:
      return state;
  }
};

test("scope - projects parent state to child state", () => {
  const parent = reducer(parentReducer, { child: { count: 0 }, other: "hi" });

  const child = scope({
    store: parent,
    get: (state: ParentModel) => state.child,
    tag: (action: ChildAction): ParentAction => ({ type: "child", action }),
  });

  assert.deepStrictEqual(child.get(), { count: 0 });
});

test("scope - tags and forwards actions to parent", () => {
  const parent = reducer(parentReducer, { child: { count: 0 }, other: "hi" });

  const child = scope({
    store: parent,
    get: (state: ParentModel) => state.child,
    tag: (action: ChildAction): ParentAction => ({ type: "child", action }),
  });

  child.send({ type: "increment" });

  assert.deepStrictEqual(child.get(), { count: 1 });
  assert.strictEqual(parent.get().child.count, 1);
});

test("scope - child state updates when parent state changes", () => {
  const parent = reducer(parentReducer, { child: { count: 0 }, other: "hi" });

  const child = scope({
    store: parent,
    get: (state: ParentModel) => state.child,
    tag: (action: ChildAction): ParentAction => ({ type: "child", action }),
  });

  // Update parent directly
  parent.send({ type: "child", action: { type: "increment" } });

  assert.deepStrictEqual(child.get(), { count: 1 });
});

test("scope - multiple actions through scoped store", () => {
  const parent = reducer(parentReducer, { child: { count: 0 }, other: "hi" });

  const child = scope({
    store: parent,
    get: (state: ParentModel) => state.child,
    tag: (action: ChildAction): ParentAction => ({ type: "child", action }),
  });

  child.send({ type: "increment" });
  child.send({ type: "increment" });
  child.send({ type: "increment" });
  child.send({ type: "decrement" });

  assert.deepStrictEqual(child.get(), { count: 2 });
  assert.strictEqual(parent.get().other, "hi");
});
