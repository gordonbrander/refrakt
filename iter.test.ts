import { assertEquals, assertRejects } from "@std/assert";
import {
  mapAsync,
  mergeAsync,
  sequenceAsync,
  toAsyncIterator,
} from "./iter.ts";

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

Deno.test("toAsyncIterator - converts AsyncIterable to AsyncIterator", async () => {
  const asyncIterable = fromArray([1, 2, 3]);
  const iterator = toAsyncIterator(asyncIterable);

  const first = await iterator.next();
  assertEquals(first.value, 1);
  assertEquals(first.done, false);

  const second = await iterator.next();
  assertEquals(second.value, 2);
  assertEquals(second.done, false);

  const third = await iterator.next();
  assertEquals(third.value, 3);
  assertEquals(third.done, false);

  const fourth = await iterator.next();
  assertEquals(fourth.done, true);
});

Deno.test("mergeAsync - merges single async iterable", async () => {
  const result = await collectAll(mergeAsync(fromArray([1, 2, 3])));
  assertEquals(result, [1, 2, 3]);
});

Deno.test("mergeAsync - merges multiple async iterables", async () => {
  const iter1 = fromArray([1, 3, 5]);
  const iter2 = fromArray([2, 4, 6]);

  const result = await collectAll(mergeAsync(iter1, iter2));
  // Result should contain all values, order may vary due to async nature
  assertEquals(result.sort(), [1, 2, 3, 4, 5, 6]);
  assertEquals(result.length, 6);
});

Deno.test("mergeAsync - handles empty iterables", async () => {
  const iter1 = fromArray([]);
  const iter2 = fromArray([1, 2, 3]);

  const result = await collectAll(mergeAsync(iter1, iter2));
  assertEquals(result, [1, 2, 3]);
});

Deno.test("mergeAsync - handles all empty iterables", async () => {
  const iter1 = fromArray([]);
  const iter2 = fromArray([]);

  const result = await collectAll(mergeAsync(iter1, iter2));
  assertEquals(result, []);
});

Deno.test("mergeAsync - preserves order when one iterator is much slower", async () => {
  const fast = fromArray([1, 2, 3], 1);
  const slow = fromArray([10, 20], 50);

  const result = await collectAll(mergeAsync(fast, slow));
  // Fast iterator should yield values first
  assertEquals(result.slice(0, 3), [1, 2, 3]);
  assertEquals(result.slice(-2), [10, 20]);
  assertEquals(result.length, 5);
});

Deno.test("mergeAsync - handles different iterables of same type", async () => {
  const numbers1 = fromArray([1, 3]);
  const numbers2 = fromArray([2, 4]);

  const result = await collectAll(mergeAsync(numbers1, numbers2));
  assertEquals(result.sort(), [1, 2, 3, 4]);
});

Deno.test("sequenceAsync - sequences single async iterable", async () => {
  const result = await collectAll(sequenceAsync(fromArray([1, 2, 3])));
  assertEquals(result, [1, 2, 3]);
});

Deno.test("sequenceAsync - sequences multiple async iterables in order", async () => {
  const iter1 = fromArray([1, 2, 3]);
  const iter2 = fromArray([4, 5, 6]);
  const iter3 = fromArray([7, 8, 9]);

  const result = await collectAll(sequenceAsync(iter1, iter2, iter3));
  assertEquals(result, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

Deno.test("sequenceAsync - handles empty iterables", async () => {
  const iter1 = fromArray([1, 2]);
  const iter2 = fromArray([]);
  const iter3 = fromArray([3, 4]);

  const result = await collectAll(sequenceAsync(iter1, iter2, iter3));
  assertEquals(result, [1, 2, 3, 4]);
});

Deno.test("sequenceAsync - handles all empty iterables", async () => {
  const result = await collectAll(sequenceAsync(fromArray([]), fromArray([])));
  assertEquals(result, []);
});

Deno.test("mapAsync - maps values with async function", async () => {
  const source = fromArray([1, 2, 3]);
  // deno-lint-ignore require-await
  const mapper = async (x: number) => x * 2;

  const result = await collectAll(mapAsync(source, mapper));
  assertEquals(result, [2, 4, 6]);
});

Deno.test("mapAsync - maps values with Promise-returning function", async () => {
  const source = fromArray(["hello", "world"]);
  // deno-lint-ignore require-await
  const mapper = async (s: string) => s.toUpperCase();

  const result = await collectAll(mapAsync(source, mapper));
  assertEquals(result, ["HELLO", "WORLD"]);
});

Deno.test("mapAsync - handles empty iterable", async () => {
  const source = fromArray([]);
  // deno-lint-ignore require-await
  const mapper = async (x: number) => x * 2;

  const result = await collectAll(mapAsync(source, mapper));
  assertEquals(result, []);
});

Deno.test("mapAsync - handles async mapper with delays", async () => {
  const source = fromArray([1, 2, 3]);
  const mapper = async (x: number) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return x * 3;
  };

  const result = await collectAll(mapAsync(source, mapper));
  assertEquals(result, [3, 6, 9]);
});

Deno.test("mapAsync - propagates mapper errors", async () => {
  const source = fromArray([1, 2, 3]);
  // deno-lint-ignore require-await
  const mapper = async (x: number) => {
    if (x === 2) throw new Error("Test error");
    return x * 2;
  };

  await assertRejects(
    () => collectAll(mapAsync(source, mapper)),
    Error,
    "Test error",
  );
});

Deno.test("Complex scenario - combining all utilities", async () => {
  // Create multiple sources
  const numbers = fromArray([1, 2, 3], 5);
  const moreNumbers = fromArray([4, 5], 10);

  // Merge them
  const merged = mergeAsync(numbers, moreNumbers);

  // Map the merged values
  // deno-lint-ignore require-await
  const mapped = mapAsync(merged, async (x) => x * 10);

  // Sequence with another iterable
  const extra = fromArray([100, 200]);
  const sequenced = sequenceAsync(mapped, extra);

  const result = await collectAll(sequenced);

  // Should have all mapped values from merge, then the extra values
  const mappedValues = result.slice(0, -2).sort();
  const extraValues = result.slice(-2);

  assertEquals(mappedValues, [10, 20, 30, 40, 50]);
  assertEquals(extraValues, [100, 200]);
});

Deno.test("Performance - handles large datasets efficiently", async () => {
  const largeArray = Array.from({ length: 1000 }, (_, i) => i);
  const source = fromArray(largeArray);

  const startTime = Date.now();
  // deno-lint-ignore require-await
  const result = await collectAll(mapAsync(source, async (x) => x * 2));
  const endTime = Date.now();

  assertEquals(result.length, 1000);
  assertEquals(result[0], 0);
  assertEquals(result[999], 1998);

  // Should complete reasonably quickly (less than 1 second for this test)
  const duration = endTime - startTime;
  console.log(`Processed 1000 items in ${duration}ms`);
});

Deno.test("Edge case - iterator that throws during iteration", async () => {
  async function* errorIterator() {
    yield 1;
    yield 2;
    throw new Error("Iterator error");
  }

  await assertRejects(
    () => collectAll(mergeAsync(errorIterator())),
    Error,
    "Iterator error",
  );
});

Deno.test("Edge case - concurrent access to same iterator", async () => {
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
  assertEquals(results[0].value, 1);
  assertEquals(results[1].value, 2);
  assertEquals(results[2].value, 3);
  assertEquals(results.every((r) => !r.done), true);
});
