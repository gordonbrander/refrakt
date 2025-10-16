import { assertEquals } from "@std/assert";
import { pipe } from "./pipe.ts";

const add1 = (x: number) => x + 1;

Deno.test("pipes value through functions", () => {
  const result = pipe(0, add1, add1);
  assertEquals(result, 2);
});

Deno.test("pipes value through many functions", () => {
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
  assertEquals(result, 20);
});

Deno.test("pipes different types, preserving type safety", () => {
  const toString = (x: number) => x.toString();

  const result = pipe(
    0,
    add1,
    toString,
  );
  assertEquals(result, "1");
});
