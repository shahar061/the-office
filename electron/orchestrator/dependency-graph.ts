// electron/orchestrator/dependency-graph.ts

export interface DependencyTask {
  id: string;
  dependsOn: string[];
}

export interface DependencyGraphConfig<T extends DependencyTask> {
  tasks: T[];
  concurrency: number;
  run: (task: T) => Promise<void>;
  onStatusChange?: (taskId: string, status: 'active' | 'review' | 'done' | 'failed', error?: string) => void;
}

export interface DependencyGraphResult {
  completed: string[];
  failed: { taskId: string; error: string } | null;
}

export async function runDependencyGraph<T extends DependencyTask>(
  config: DependencyGraphConfig<T>,
): Promise<DependencyGraphResult> {
  const { tasks, concurrency, run, onStatusChange } = config;

  // Validate: detect cycles via topological sort
  validateNoCycles(tasks);

  const completed = new Set<string>();
  const inFlight = new Set<string>();
  let failedTask: { taskId: string; error: string } | null = null;
  let aborted = false;

  // Promise coordination
  let resolveGraph: (result: DependencyGraphResult) => void;
  const graphPromise = new Promise<DependencyGraphResult>((resolve) => {
    resolveGraph = resolve;
  });

  function getReadyTasks(): T[] {
    if (aborted) return [];
    return tasks.filter(t =>
      !completed.has(t.id) &&
      !inFlight.has(t.id) &&
      t.dependsOn.every(dep => completed.has(dep))
    );
  }

  function checkCompletion(): void {
    if (aborted) return;
    if (completed.size === tasks.length) {
      resolveGraph({ completed: [...completed], failed: null });
    }
  }

  async function launchTask(task: T): Promise<void> {
    inFlight.add(task.id);
    onStatusChange?.(task.id, 'active');

    try {
      await run(task);
      if (aborted) return;

      inFlight.delete(task.id);
      completed.add(task.id);
      onStatusChange?.(task.id, 'done');

      // Launch newly-ready tasks
      scheduleReady();
      checkCompletion();
    } catch (err) {
      if (aborted) return;
      aborted = true;

      const errorMsg = err instanceof Error ? err.message : String(err);
      failedTask = { taskId: task.id, error: errorMsg };
      inFlight.delete(task.id);
      onStatusChange?.(task.id, 'failed', errorMsg);

      // Don't wait for in-flight tasks — resolve immediately with failure
      resolveGraph({ completed: [...completed], failed: failedTask });
    }
  }

  function scheduleReady(): void {
    const slotsAvailable = concurrency - inFlight.size;
    const ready = getReadyTasks().slice(0, slotsAvailable);
    for (const task of ready) {
      launchTask(task);
    }
  }

  if (tasks.length === 0) {
    return { completed: [], failed: null };
  }

  scheduleReady();

  // If no tasks were ready (all have unresolvable deps), detect deadlock
  if (inFlight.size === 0 && completed.size < tasks.length) {
    throw new Error('Dependency deadlock: no tasks are ready to run');
  }

  return graphPromise;
}

function validateNoCycles(tasks: DependencyTask[]): void {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  function dfs(id: string): void {
    if (inStack.has(id)) throw new Error(`Dependency cycle detected involving task: ${id}`);
    if (visited.has(id)) return;

    inStack.add(id);
    visited.add(id);

    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependsOn) {
        dfs(dep);
      }
    }

    inStack.delete(id);
  }

  for (const task of tasks) {
    dfs(task.id);
  }
}
