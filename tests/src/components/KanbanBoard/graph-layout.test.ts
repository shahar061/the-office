import { describe, it, expect } from 'vitest';
import { computeLayout } from '../../../../src/renderer/src/components/KanbanBoard/graph-layout';
import type { KanbanTask } from '../../../../shared/types';

const task = (id: string, phaseId: string, dependsOn: string[] = []): KanbanTask => ({
  id,
  description: `Task ${id}`,
  status: 'queued',
  assignedAgent: 'backend-engineer',
  phaseId,
  dependsOn,
});

describe('computeLayout', () => {
  it('returns empty layout for empty input', () => {
    const result = computeLayout([]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.phases).toEqual([]);
  });

  it('groups tasks by phase in first-encountered order', () => {
    const tasks: KanbanTask[] = [
      task('a', 'foundation'),
      task('b', 'generation'),
      task('c', 'foundation'),
    ];
    const result = computeLayout(tasks);
    expect(result.phases.map(p => p.id)).toEqual(['foundation', 'generation']);
  });

  it('places tasks in columns by phase and rows by order within phase', () => {
    const tasks: KanbanTask[] = [
      task('a', 'foundation'),
      task('b', 'foundation'),
      task('c', 'generation'),
    ];
    const result = computeLayout(tasks);
    const nodeA = result.nodes.find(n => n.id === 'a')!;
    const nodeB = result.nodes.find(n => n.id === 'b')!;
    const nodeC = result.nodes.find(n => n.id === 'c')!;
    expect(nodeA.x).toBe(nodeB.x);
    expect(nodeA.y).not.toBe(nodeB.y);
    expect(nodeC.x).toBeGreaterThan(nodeA.x);
  });

  it('emits one edge per dependency', () => {
    const tasks: KanbanTask[] = [
      task('a', 'foundation'),
      task('b', 'generation', ['a']),
      task('c', 'solving', ['a', 'b']),
    ];
    const result = computeLayout(tasks);
    expect(result.edges).toHaveLength(3);
    expect(result.edges).toContainEqual({ from: 'a', to: 'b' });
    expect(result.edges).toContainEqual({ from: 'a', to: 'c' });
    expect(result.edges).toContainEqual({ from: 'b', to: 'c' });
  });

  it('computes bounds covering all nodes', () => {
    const tasks: KanbanTask[] = [
      task('a', 'foundation'),
      task('b', 'generation'),
    ];
    const result = computeLayout(tasks);
    expect(result.bounds.minX).toBeLessThanOrEqual(result.nodes[0].x);
    expect(result.bounds.maxX).toBeGreaterThanOrEqual(result.nodes[1].x + result.nodes[1].width);
  });

  it('nodes have fixed dimensions', () => {
    const tasks: KanbanTask[] = [task('a', 'foundation')];
    const result = computeLayout(tasks);
    expect(result.nodes[0].width).toBe(180);
    expect(result.nodes[0].height).toBe(48);
  });

  it('attaches the task object to each node', () => {
    const t = task('a', 'foundation');
    const result = computeLayout([t]);
    expect(result.nodes[0].task).toBe(t);
  });
});
