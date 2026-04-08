// tests/orchestrator/worker-pool.test.ts
import { describe, it, expect } from 'vitest';
import { runPool } from '../../electron/orchestrator/worker-pool';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('runPool', () => {
  it('respects concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;

    const results = await runPool(
      [1, 2, 3, 4, 5, 6],
      3,
      async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(20);
        active--;
      },
    );

    expect(maxActive).toBe(3);
    expect(results).toHaveLength(6);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('backfills immediately when a slot opens', async () => {
    const startTimes: number[] = [];

    await runPool(
      [10, 10, 10, 50, 50],
      3,
      async (duration, index) => {
        startTimes[index] = Date.now();
        await delay(duration);
      },
    );

    // Items 3 and 4 should start roughly when items 0-2 finish (~10ms),
    // not after the entire first batch finishes (~50ms)
    const item3Wait = startTimes[3] - startTimes[0];
    expect(item3Wait).toBeLessThan(40);
  });

  it('isolates errors — one failure does not block others', async () => {
    const results = await runPool(
      ['ok', 'fail', 'ok'],
      2,
      async (item) => {
        if (item === 'fail') throw new Error('boom');
      },
    );

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect((results[1] as PromiseRejectedResult).reason.message).toBe('boom');
    expect(results[2].status).toBe('fulfilled');
  });

  it('preserves result order regardless of completion order', async () => {
    const completionOrder: number[] = [];

    const results = await runPool(
      [30, 10, 20],
      3,
      async (duration, index) => {
        await delay(duration);
        completionOrder.push(index);
      },
    );

    // Items complete in order 1, 2, 0 but results array is in original order
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(completionOrder[0]).toBe(1); // fastest finishes first
  });

  it('fires onStart and onDone callbacks', async () => {
    const started: number[] = [];
    const done: number[] = [];

    await runPool(
      ['a', 'b', 'c'],
      2,
      async () => { await delay(5); },
      {
        onStart: (_, i) => started.push(i),
        onDone: (_, i) => done.push(i),
      },
    );

    expect(started).toContain(0);
    expect(started).toContain(1);
    expect(started).toContain(2);
    expect(done).toContain(0);
    expect(done).toContain(1);
    expect(done).toContain(2);
  });

  it('handles pool size larger than item count', async () => {
    const results = await runPool(
      ['a', 'b'],
      10,
      async () => {},
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('handles single item', async () => {
    const results = await runPool(
      ['only'],
      3,
      async () => {},
    );

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('fulfilled');
  });

  it('returns empty array for empty input', async () => {
    const results = await runPool([], 3, async () => {});
    expect(results).toEqual([]);
  });
});
