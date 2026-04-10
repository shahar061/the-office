import type { KanbanTask } from '../../../../../shared/types';

/**
 * Returns the set of all task IDs that the given task transitively depends on.
 */
export function getUpstreamChain(tasks: KanbanTask[], taskId: string): Set<string> {
  const byId = new Map<string, KanbanTask>();
  for (const t of tasks) byId.set(t.id, t);

  const visited = new Set<string>();
  const queue: string[] = [];

  const start = byId.get(taskId);
  if (!start) return visited;

  for (const dep of start.dependsOn) queue.push(dep);

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const t = byId.get(id);
    if (!t) continue;
    for (const dep of t.dependsOn) {
      if (!visited.has(dep)) queue.push(dep);
    }
  }

  return visited;
}

/**
 * Returns the set of all task IDs that transitively depend on the given task.
 */
export function getDownstreamChain(tasks: KanbanTask[], taskId: string): Set<string> {
  const dependents = new Map<string, string[]>();
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(t.id);
    }
  }

  const visited = new Set<string>();
  const queue: string[] = [];

  for (const d of dependents.get(taskId) ?? []) queue.push(d);

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const d of dependents.get(id) ?? []) {
      if (!visited.has(d)) queue.push(d);
    }
  }

  return visited;
}
