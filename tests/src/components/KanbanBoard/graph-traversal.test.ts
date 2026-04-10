import { describe, it, expect } from 'vitest';
import { getUpstreamChain, getDownstreamChain } from '../../../../src/renderer/src/components/KanbanBoard/graph-traversal';
import type { KanbanTask } from '../../../../shared/types';

const task = (id: string, dependsOn: string[] = []): KanbanTask => ({
  id,
  description: `Task ${id}`,
  status: 'queued',
  assignedAgent: 'backend-engineer',
  phaseId: 'p1',
  dependsOn,
});

describe('getUpstreamChain', () => {
  it('returns empty set for task with no deps', () => {
    const tasks = [task('a')];
    expect(getUpstreamChain(tasks, 'a')).toEqual(new Set());
  });

  it('returns direct dependencies', () => {
    const tasks = [task('a'), task('b', ['a'])];
    expect(getUpstreamChain(tasks, 'b')).toEqual(new Set(['a']));
  });

  it('returns transitive dependencies', () => {
    const tasks = [task('a'), task('b', ['a']), task('c', ['b'])];
    expect(getUpstreamChain(tasks, 'c')).toEqual(new Set(['a', 'b']));
  });

  it('handles diamond dependencies without duplication', () => {
    const tasks = [
      task('a'),
      task('b', ['a']),
      task('c', ['a']),
      task('d', ['b', 'c']),
    ];
    expect(getUpstreamChain(tasks, 'd')).toEqual(new Set(['a', 'b', 'c']));
  });

  it('returns empty set for unknown task id', () => {
    const tasks = [task('a')];
    expect(getUpstreamChain(tasks, 'zzz')).toEqual(new Set());
  });

  it('is cycle-safe', () => {
    const tasks = [task('a', ['b']), task('b', ['a'])];
    const result = getUpstreamChain(tasks, 'a');
    expect(result).toEqual(new Set(['a', 'b']));
  });
});

describe('getDownstreamChain', () => {
  it('returns empty set for task with no dependents', () => {
    const tasks = [task('a'), task('b', ['a'])];
    expect(getDownstreamChain(tasks, 'b')).toEqual(new Set());
  });

  it('returns direct dependents', () => {
    const tasks = [task('a'), task('b', ['a'])];
    expect(getDownstreamChain(tasks, 'a')).toEqual(new Set(['b']));
  });

  it('returns transitive dependents', () => {
    const tasks = [task('a'), task('b', ['a']), task('c', ['b'])];
    expect(getDownstreamChain(tasks, 'a')).toEqual(new Set(['b', 'c']));
  });

  it('handles multiple direct dependents', () => {
    const tasks = [task('a'), task('b', ['a']), task('c', ['a'])];
    expect(getDownstreamChain(tasks, 'a')).toEqual(new Set(['b', 'c']));
  });
});
