import { test } from "node:test";
import assert from "node:assert/strict";
import { forward } from "./send.js";

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
