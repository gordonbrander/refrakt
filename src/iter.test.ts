import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapAsync,
  mergeAsync,
  sequenceAsync,
  toAsyncIterator,
} from "./iter.js";

// Helper function to create async iterables from arrays
async function* fromArray<T>(
  array: T[],
  delay = 0,
): AsyncGenerator<T, void, void> {
  for (const item of array) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    yield item;
  }
}

// Helper function to collect all values from an async iterator
async function collectAll<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const value of iterable) {
    results.push(value);
  }
  return results;
}

test("toAsyncIterator - converts AsyncIterable to AsyncIterator", async () => {
  const asyncIterable = fromArray([1, 2, 3]);
  const iterator = toAsyncIterator(asyncIterable);

  const first = await iterator.next();
  assert.strictEqual(first.value, 1);
  assert.strictEqual(first.done, false);

  const second = await iterator.next();
  assert.strictEqual(second.value, 2);
  assert.strictEqual(second.done, false);

  const third = await iterator.next();
  assert.strictEqual(third.value, 3);
  assert.strictEqual(third.done, false);

  const fourth = await iterator.next();
  assert.strictEqual(fourth.done, true);
});

test("mergeAsync - merges single async iterable", async () => {
  const result = await collectAll(mergeAsync(fromArray([1, 2, 3])));
  assert.deepStrictEqual(result, [1, 2, 3]);
});

test("mergeAsync - merges multiple async iterables", async () => {
  const iter1 = fromArray([1, 3, 5]);
  const iter2 = fromArray([2, 4, 6]);

  const result = await collectAll(mergeAsync(iter1, iter2));
  // Result should contain all values, order may vary due to async nature
  assert.deepStrictEqual(result.sort(), [1, 2, 3, 4, 5, 6]);
  assert.strictEqual(result.length, 6);
});

test("mergeAsync - handles empty iterables", async () => {
  const iter1 = fromArray([]);
  const iter2 = fromArray([1, 2, 3]);

  const result = await collectAll(mergeAsync(iter1, iter2));
  assert.deepStrictEqual(result, [1, 2, 3]);
});

test("mergeAsync - handles all empty iterables", async () => {
  const iter1 = fromArray([]);
  const iter2 = fromArray([]);

  const result = await collectAll(mergeAsync(iter1, iter2));
  assert.deepStrictEqual(result, []);
});

test("mergeAsync - preserves order when one iterator is much slower", async () => {
  const fast = fromArray([1, 2, 3], 1);
  const slow = fromArray([10, 20], 50);

  const result = await collectAll(mergeAsync(fast, slow));
  // Fast iterator should yield values first
  assert.deepStrictEqual(result.slice(0, 3), [1, 2, 3]);
  assert.deepStrictEqual(result.slice(-2), [10, 20]);
  assert.strictEqual(result.length, 5);
});

test("mergeAsync - handles different iterables of same type", async () => {
  const numbers1 = fromArray([1, 3]);
  const numbers2 = fromArray([2, 4]);

  const result = await collectAll(mergeAsync(numbers1, numbers2));
  assert.deepStrictEqual(result.sort(), [1, 2, 3, 4]);
});

test("sequenceAsync - sequences single async iterable", async () => {
  const result = await collectAll(sequenceAsync(fromArray([1, 2, 3])));
  assert.deepStrictEqual(result, [1, 2, 3]);
});

test("sequenceAsync - sequences multiple async iterables in order", async () => {
  const iter1 = fromArray([1, 2, 3]);
  const iter2 = fromArray([4, 5, 6]);
  const iter3 = fromArray([7, 8, 9]);

  const result = await collectAll(sequenceAsync(iter1, iter2, iter3));
  assert.deepStrictEqual(result, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("sequenceAsync - handles empty iterables", async () => {
  const iter1 = fromArray([1, 2]);
  const iter2 = fromArray([]);
  const iter3 = fromArray([3, 4]);

  const result = await collectAll(sequenceAsync(iter1, iter2, iter3));
  assert.deepStrictEqual(result, [1, 2, 3, 4]);
});

test("sequenceAsync - handles all empty iterables", async () => {
  const result = await collectAll(sequenceAsync(fromArray([]), fromArray([])));
  assert.deepStrictEqual(result, []);
});

test("mapAsync - maps values with async function", async () => {
  const source = fromArray([1, 2, 3]);
  const mapper = async (x: number) => x * 2;

  const result = await collectAll(mapAsync(source, mapper));
  assert.deepStrictEqual(result, [2, 4, 6]);
});

test("mapAsync - maps values with Promise-returning function", async () => {
  const source = fromArray(["hello", "world"]);
  const mapper = async (s: string) => s.toUpperCase();

  const result = await collectAll(mapAsync(source, mapper));
  assert.deepStrictEqual(result, ["HELLO", "WORLD"]);
});

test("mapAsync - handles empty iterable", async () => {
  const source = fromArray([]);
  const mapper = async (x: number) => x * 2;

  const result = await collectAll(mapAsync(source, mapper));
  assert.deepStrictEqual(result, []);
});

test("mapAsync - handles async mapper with delays", async () => {
  const source = fromArray([1, 2, 3]);
  const mapper = async (x: number) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return x * 3;
  };

  const result = await collectAll(mapAsync(source, mapper));
  assert.deepStrictEqual(result, [3, 6, 9]);
});

test("mapAsync - propagates mapper errors", async () => {
  const source = fromArray([1, 2, 3]);
  const mapper = async (x: number) => {
    if (x === 2) throw new Error("Test error");
    return x * 2;
  };

  await assert.rejects(
    () => collectAll(mapAsync(source, mapper)),
    { name: "Error", message: "Test error" },
  );
});

test("Complex scenario - combining all utilities", async () => {
  // Create multiple sources
  const numbers = fromArray([1, 2, 3], 5);
  const moreNumbers = fromArray([4, 5], 10);

  // Merge them
  const merged = mergeAsync(numbers, moreNumbers);

  // Map the merged values
  const mapped = mapAsync(merged, async (x) => x * 10);

  // Sequence with another iterable
  const extra = fromArray([100, 200]);
  const sequenced = sequenceAsync(mapped, extra);

  const result = await collectAll(sequenced);

  // Should have all mapped values from merge, then the extra values
  const mappedValues = result.slice(0, -2).sort();
  const extraValues = result.slice(-2);

  assert.deepStrictEqual(mappedValues, [10, 20, 30, 40, 50]);
  assert.deepStrictEqual(extraValues, [100, 200]);
});

test("Performance - handles large datasets efficiently", async () => {
  const largeArray = Array.from({ length: 1000 }, (_, i) => i);
  const source = fromArray(largeArray);

  const startTime = Date.now();
  const result = await collectAll(mapAsync(source, async (x) => x * 2));
  const endTime = Date.now();

  assert.strictEqual(result.length, 1000);
  assert.strictEqual(result[0], 0);
  assert.strictEqual(result[999], 1998);

  // Should complete reasonably quickly (less than 1 second for this test)
  const duration = endTime - startTime;
  console.log(`Processed 1000 items in ${duration}ms`);
});

test("Edge case - iterator that throws during iteration", async () => {
  async function* errorIterator() {
    yield 1;
    yield 2;
    throw new Error("Iterator error");
  }

  await assert.rejects(
    () => collectAll(mergeAsync(errorIterator())),
    { name: "Error", message: "Iterator error" },
  );
});

test("Edge case - concurrent access to same iterator", async () => {
  const source = fromArray([1, 2, 3, 4, 5]);
  const iterator = toAsyncIterator(source);

  // Try to access the same iterator concurrently
  const promises = [
    iterator.next(),
    iterator.next(),
    iterator.next(),
  ];

  const results = await Promise.all(promises);

  // Should get three different values
  assert.strictEqual(results[0].value, 1);
  assert.strictEqual(results[1].value, 2);
  assert.strictEqual(results[2].value, 3);
  assert.strictEqual(results.every((r) => !r.done), true);
});
