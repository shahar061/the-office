// tests/orchestrator/dependency-graph.test.ts
import { describe, it, expect } from 'vitest';
import { runDependencyGraph, type DependencyTask } from '../../electron/orchestrator/dependency-graph';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('runDependencyGraph', () => {
  it('runs independent tasks in parallel up to concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;
    const tasks: DependencyTask[] = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'c', dependsOn: [] },
      { id: 'd', dependsOn: [] },
    ];

    const result = await runDependencyGraph({
      tasks,
      concurrency: 2,
      run: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(20);
        active--;
      },
    });

    expect(maxActive).toBe(2);
    expect(result.completed).toHaveLength(4);
    expect(result.completed).toContain('a');
    expect(result.completed).toContain('b');
    expect(result.completed).toContain('c');
    expect(result.completed).toContain('d');
    expect(result.failed).toBeNull();
  });

  it('waits for dependencies before running a task', async () => {
    const order: string[] = [];
    const tasks: DependencyTask[] = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'c', dependsOn: ['a', 'b'] },
    ];

    await runDependencyGraph({
      tasks,
      concurrency: 3,
      run: async (task) => {
        await delay(task.id === 'a' ? 30 : 10);
        order.push(task.id);
      },
    });

    expect(order.indexOf('c')).toBeGreaterThan(order.indexOf('a'));
    expect(order.indexOf('c')).toBeGreaterThan(order.indexOf('b'));
  });

  it('stops all execution on first failure', async () => {
    const started: string[] = [];
    const tasks: DependencyTask[] = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'c', dependsOn: ['a'] },
      { id: 'd', dependsOn: ['b'] },
    ];

    const result = await runDependencyGraph({
      tasks,
      concurrency: 2,
      run: async (task) => {
        started.push(task.id);
        if (task.id === 'a') {
          await delay(10);
          throw new Error('task a failed');
        }
        await delay(100);
      },
    });

    expect(result.failed).toEqual({ taskId: 'a', error: 'task a failed' });
    expect(started).not.toContain('c');
  });

  it('throws on dependency cycle', async () => {
    const tasks: DependencyTask[] = [
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ];

    await expect(
      runDependencyGraph({ tasks, concurrency: 2, run: async () => {} })
    ).rejects.toThrow(/cycle/i);
  });

  it('fires onStatusChange for each transition', async () => {
    const transitions: [string, string][] = [];
    const tasks: DependencyTask[] = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
    ];

    await runDependencyGraph({
      tasks,
      concurrency: 2,
      run: async () => { await delay(5); },
      onStatusChange: (taskId, status) => transitions.push([taskId, status]),
    });

    expect(transitions).toEqual([
      ['a', 'active'],
      ['a', 'done'],
      ['b', 'active'],
      ['b', 'done'],
    ]);
  });

  it('returns empty result for empty input', async () => {
    const result = await runDependencyGraph({
      tasks: [],
      concurrency: 2,
      run: async () => {},
    });
    expect(result.completed).toEqual([]);
    expect(result.failed).toBeNull();
  });

  it('handles single task', async () => {
    const result = await runDependencyGraph({
      tasks: [{ id: 'only', dependsOn: [] }],
      concurrency: 3,
      run: async () => {},
    });
    expect(result.completed).toEqual(['only']);
    expect(result.failed).toBeNull();
  });
});
