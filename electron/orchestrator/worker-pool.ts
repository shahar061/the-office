// electron/orchestrator/worker-pool.ts

export interface PoolCallbacks<T> {
  onStart?: (item: T, index: number) => void;
  onDone?: (item: T, index: number) => void;
}

export async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
  callbacks?: PoolCallbacks<T>,
): Promise<PromiseSettledResult<void>[]> {
  if (items.length === 0) return [];

  const results: PromiseSettledResult<void>[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      const item = items[i];
      callbacks?.onStart?.(item, i);
      try {
        await fn(item, i);
        results[i] = { status: 'fulfilled', value: undefined };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
      callbacks?.onDone?.(item, i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runNext(),
  );
  await Promise.all(workers);

  return results;
}
