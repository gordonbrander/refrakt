import { test } from "node:test";
import assert from "node:assert/strict";
import { computed, effect, peek, signal } from "./signal.js";

test("signal - creates and updates state", () => {
  const count = signal(0);

  assert.strictEqual(count.get(), 0);

  count.set(5);
  assert.strictEqual(count.get(), 5);

  count.set(-10);
  assert.strictEqual(count.get(), -10);
});

test("signal - works with different types", () => {
  const str = signal("hello");
  assert.strictEqual(str.get(), "hello");

  const bool = signal(true);
  assert.strictEqual(bool.get(), true);

  const obj = signal({ name: "test" });
  assert.deepStrictEqual(obj.get(), { name: "test" });

  const arr = signal([1, 2, 3]);
  assert.deepStrictEqual(arr.get(), [1, 2, 3]);
});

test("computed - derives from single signal", () => {
  const count = signal(5);
  const doubled = computed(() => count.get() * 2);

  assert.strictEqual(doubled.get(), 10);

  count.set(10);
  assert.strictEqual(doubled.get(), 20);
});

test("computed - derives from multiple signals", () => {
  const a = signal(3);
  const b = signal(4);
  const sum = computed(() => a.get() + b.get());

  assert.strictEqual(sum.get(), 7);

  a.set(10);
  assert.strictEqual(sum.get(), 14);

  b.set(20);
  assert.strictEqual(sum.get(), 30);
});

test("computed - chains computations", () => {
  const base = signal(2);
  const doubled = computed(() => base.get() * 2);
  const quadrupled = computed(() => doubled.get() * 2);

  assert.strictEqual(quadrupled.get(), 8);

  base.set(5);
  assert.strictEqual(quadrupled.get(), 20);
});

test("effect - runs on signal changes", async () => {
  const count = signal(0);
  let effectRuns = 0;
  let lastValue = -1;

  const cleanup = effect(() => {
    effectRuns++;
    lastValue = count.get();
  });

  // Initial run
  assert.strictEqual(effectRuns, 1);
  assert.strictEqual(lastValue, 0);

  // Change signal
  count.set(5);

  // Wait for microtask
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  assert.strictEqual(effectRuns, 2);
  assert.strictEqual(lastValue, 5);

  // Change again
  count.set(10);
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  assert.strictEqual(effectRuns, 3);
  assert.strictEqual(lastValue, 10);

  cleanup();
});

test("effect - batches multiple signal changes", async () => {
  const a = signal(1);
  const b = signal(2);
  let effectRuns = 0;
  let lastSum = -1;

  const cleanup = effect(() => {
    effectRuns++;
    lastSum = a.get() + b.get();
  });

  // Initial run
  assert.strictEqual(effectRuns, 1);
  assert.strictEqual(lastSum, 3);

  // Change both signals synchronously
  a.set(10);
  b.set(20);

  // Effect should only run once after microtask
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  assert.strictEqual(effectRuns, 2);
  assert.strictEqual(lastSum, 30);

  cleanup();
});

test("effect - cleanup function works", async () => {
  const count = signal(0);
  let cleanupCalls = 0;

  const cleanup = effect(() => {
    count.get(); // Track the signal
    return () => {
      cleanupCalls++;
    };
  });

  assert.strictEqual(cleanupCalls, 0);

  // Trigger effect again
  count.set(1);
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  // Previous cleanup should have been called
  assert.strictEqual(cleanupCalls, 1);

  // Cleanup the effect itself
  cleanup();

  // Final cleanup should be called
  assert.strictEqual(cleanupCalls, 2);
});

test("effect - cleanup stops tracking", async () => {
  const count = signal(0);
  let effectRuns = 0;

  const cleanup = effect(() => {
    effectRuns++;
    count.get();
  });

  assert.strictEqual(effectRuns, 1);

  count.set(1);
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
  assert.strictEqual(effectRuns, 2);

  // Cleanup and verify no more runs
  cleanup();

  count.set(2);
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
  assert.strictEqual(effectRuns, 2); // Should not increase
});

test("peek - reads without tracking", async () => {
  const count = signal(0);
  let effectRuns = 0;
  let peekedValue = -1;

  const cleanup = effect(() => {
    effectRuns++;
    // Read count normally (tracked)
    count.get();
    // Peek at count (not tracked)
    peekedValue = peek(() => count.get());
  });

  assert.strictEqual(effectRuns, 1);
  assert.strictEqual(peekedValue, 0);

  count.set(5);
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  // Effect should run because of tracked read
  assert.strictEqual(effectRuns, 2);
  assert.strictEqual(peekedValue, 5);

  cleanup();
});

test("peek - prevents tracking in complex scenarios", async () => {
  const trigger = signal(0);
  const data = signal("initial");
  let effectRuns = 0;
  const results: string[] = [];

  const cleanup = effect(() => {
    effectRuns++;
    // Only track trigger, not data
    trigger.get();
    const peekedData = peek(() => data.get());
    results.push(peekedData);
  });

  assert.strictEqual(effectRuns, 1);
  assert.deepStrictEqual(results, ["initial"]);

  // Changing data should not trigger effect
  data.set("changed");
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
  assert.strictEqual(effectRuns, 1); // Should not change

  // Changing trigger should trigger effect and peek at current data
  trigger.set(1);
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
  assert.strictEqual(effectRuns, 2);
  assert.deepStrictEqual(results, ["initial", "changed"]);

  cleanup();
});

test("complex dependency graph", async () => {
  const base1 = signal(2);
  const base2 = signal(3);

  const sum = computed(() => base1.get() + base2.get());
  const product = computed(() => base1.get() * base2.get());
  const combined = computed(() => sum.get() + product.get());

  let effectRuns = 0;
  let lastResult = -1;

  const cleanup = effect(() => {
    effectRuns++;
    lastResult = combined.get();
  });

  // Initial: sum=5, product=6, combined=11
  assert.strictEqual(effectRuns, 1);
  assert.strictEqual(lastResult, 11);

  // Change base1: sum=6, product=9, combined=15
  base1.set(3);
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  assert.strictEqual(effectRuns, 2);
  assert.strictEqual(lastResult, 15);

  // Change base2: sum=7, product=12, combined=19
  base2.set(4);
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  assert.strictEqual(effectRuns, 3);
  assert.strictEqual(lastResult, 19);

  cleanup();
});

test("effect - handles errors gracefully", async () => {
  const count = signal(0);
  let effectRuns = 0;
  let errorThrown = false;

  const cleanup = effect(() => {
    effectRuns++;
    try {
      if (count.get() === 5) {
        throw new Error("Test error");
      }
    } catch (_) {
      errorThrown = true;
    }
  });

  assert.strictEqual(effectRuns, 1);

  // This should not throw, but the effect might log errors
  count.set(5);
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  assert.strictEqual(effectRuns, 2);
  assert.strictEqual(errorThrown, true);

  // Effect should still work after error
  count.set(10);
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  assert.strictEqual(effectRuns, 3);

  cleanup();
});

test("multiple effects on same signal", async () => {
  const count = signal(0);
  let effect1Runs = 0;
  let effect2Runs = 0;

  const cleanup1 = effect(() => {
    effect1Runs++;
    count.get();
  });

  const cleanup2 = effect(() => {
    effect2Runs++;
    count.get();
  });

  assert.strictEqual(effect1Runs, 1);
  assert.strictEqual(effect2Runs, 1);

  count.set(1);
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  assert.strictEqual(effect1Runs, 2);
  assert.strictEqual(effect2Runs, 2);

  cleanup1();
  cleanup2();
});

test("signal with undefined and null values", () => {
  const undefinedSignal = signal<string | undefined>(undefined);
  assert.strictEqual(undefinedSignal.get(), undefined);

  undefinedSignal.set("defined");
  assert.strictEqual(undefinedSignal.get(), "defined");

  undefinedSignal.set(undefined);
  assert.strictEqual(undefinedSignal.get(), undefined);

  const nullSignal = signal<string | null>(null);
  assert.strictEqual(nullSignal.get(), null);

  nullSignal.set("not null");
  assert.strictEqual(nullSignal.get(), "not null");

  nullSignal.set(null);
  assert.strictEqual(nullSignal.get(), null);
});
