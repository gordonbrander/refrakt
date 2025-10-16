import { test } from "node:test";
import assert from "node:assert/strict";
import { pipe } from "./pipe.js";

const add1 = (x: number) => x + 1;

test("pipes value through functions", () => {
  const result = pipe(0, add1, add1);
  assert.strictEqual(result, 2);
});

test("pipes value through many functions", () => {
  const result = pipe(
    0,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
    add1,
  );
  assert.strictEqual(result, 20);
});

test("pipes different types, preserving type safety", () => {
  const toString = (x: number) => x.toString();

  const result = pipe(
    0,
    add1,
    toString,
  );
  assert.strictEqual(result, "1");
});
