/** A promise or value */
export type Awaitable<T> = Promise<T> | T;

export const toAsyncIterator = <T>(
  iterable: AsyncIterable<T>,
): AsyncIterator<T, unknown, unknown> => {
  return iterable[Symbol.asyncIterator]();
};

type KeyedResult<K, T> = {
  key: K;
  result: IteratorResult<T>;
};

const _getNextKeyedResult = async <K, T>(
  iterator: AsyncIterator<T>,
  key: K,
): Promise<KeyedResult<K, T>> => {
  const result = await iterator.next();
  return { key, result };
};

/**
 * Merge multiple async iterables, returning a single async iterable
 * that yields values in an interleaved order, as fast as they become available.
 */
export async function* mergeAsync<T>(...iterables: AsyncIterable<T>[]) {
  // Create iterator objects from all input iterables
  const iterators = iterables.map(toAsyncIterator);

  // Map to track pending promises: index -> promise
  const pending: Map<number, Promise<KeyedResult<number, T>>> = new Map();

  // Initialize by fetching the first value from each iterator
  iterators.forEach((iterator, index) => {
    pending.set(index, _getNextKeyedResult(iterator, index));
  });

  // Continue until all iterators are exhausted
  while (pending.size > 0) {
    // Race all pending promises - yield whichever resolves first
    const { key, result } = await Promise.race(pending.values());

    // Remove the resolved promise
    pending.delete(key);

    if (!result.done) {
      // Yield the value to the consumer
      yield result.value;

      // Immediately queue the next value from this iterator
      pending.set(
        key,
        _getNextKeyedResult(iterators[key], key),
      );
    }
    // If done, iterator is exhausted and won't be added back
  }
}

/**
 * Sequence multiple async iterables.
 * Values are yielded in sequence, with all values from the first iterable
 * yielded before any values from the second iterable, and so on.
 */
export async function* sequenceAsync<T>(
  ...iterables: AsyncIterable<T>[]
): AsyncGenerator<T, void, void> {
  for await (const iterable of iterables) {
    for await (const value of iterable) {
      yield value;
    }
  }
}

/** Transform each value in an async iterable */
export async function* mapAsync<T, U>(
  iterable: AsyncIterable<T>,
  transform: (value: T) => Awaitable<U>,
): AsyncGenerator<U, void, void> {
  for await (const value of iterable) {
    yield await transform(value);
  }
}
