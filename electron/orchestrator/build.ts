import { ArtifactStore } from '../project/artifact-store';
import type { PermissionHandler } from '../sdk/permission-handler';
import type { AgentEvent, AgentRole, AskQuestion, BuildConfig, KanbanState, KanbanTask } from '../../shared/types';
import { resolveRole } from '../sdk/sdk-bridge';
import { runAgentSession } from './run-agent-session';
import { runDependencyGraph, type DependencyTask } from './dependency-graph';
import yaml from 'js-yaml';

export interface BuildTask extends DependencyTask {
  description: string;
  assignedAgent: string;
  model: string;
  phaseId: string;
  phaseName: string;
}

export interface BuildOrchestratorConfig {
  projectDir: string;
  agentsDir: string;
  apiKey: string;
  authEnv?: Record<string, string>;
  permissionHandler: PermissionHandler;
  buildConfig: BuildConfig;
  onEvent: (event: AgentEvent) => void;
  onKanbanUpdate: (state: KanbanState) => void;
  onWaiting: (agentRole: AgentRole, questions: AskQuestion[]) => Promise<Record<string, string>>;
  onSystemMessage: (text: string) => void;
}

/** State tracking for resume support. */
export interface BuildState {
  allTasks: BuildTask[];
  taskStatuses: Map<string, KanbanTask['status']>;
  taskErrors: Map<string, string>;
}

export function parseTasks(tasksYaml: string): BuildTask[] {
  const parsed = yaml.load(tasksYaml) as any;
  const phases = parsed.phases || parsed || [];
  const allTasks: BuildTask[] = [];

  for (const p of phases) {
    const phaseId = p.id;
    const phaseName = p.name;
    const phaseDeps = p.depends_on || [];

    for (const t of p.tasks || []) {
      // Task-level depends_on if present; otherwise fall back to phase-level
      let taskDeps: string[] = t.depends_on || [];
      if (taskDeps.length === 0 && phaseDeps.length > 0) {
        // Fallback: depend on ALL tasks from the depended-upon phases
        const depPhaseIds = new Set(phaseDeps);
        taskDeps = allTasks
          .filter(existing => depPhaseIds.has(existing.phaseId))
          .map(existing => existing.id);
      }

      allTasks.push({
        id: t.id,
        dependsOn: taskDeps,
        description: t.description,
        assignedAgent: t.assigned_agent || 'backend_engineer',
        model: t.model || 'sonnet',
        phaseId,
        phaseName,
      });
    }
  }

  return allTasks;
}

export async function runBuild(
  config: BuildOrchestratorConfig,
  resumeState?: BuildState,
): Promise<BuildState> {
  const artifactStore = new ArtifactStore(config.projectDir);

  let allTasks: BuildTask[];
  const taskStatuses = new Map<string, KanbanTask['status']>();
  const taskErrors = new Map<string, string>();

  if (resumeState) {
    // Resume: keep completed tasks, re-run failed + queued
    allTasks = resumeState.allTasks;
    for (const [id, status] of resumeState.taskStatuses) {
      taskStatuses.set(id, status === 'done' ? 'done' : 'queued');
    }
    for (const t of allTasks) {
      if (!taskStatuses.has(t.id)) taskStatuses.set(t.id, 'queued');
    }
  } else {
    // Fresh build
    const tasksYaml = artifactStore.getTasksYaml();
    if (!tasksYaml) throw new Error('tasks.yaml not found — run /warroom first');
    allTasks = parseTasks(tasksYaml);
    for (const t of allTasks) {
      taskStatuses.set(t.id, 'queued');
    }
  }

  // Only run tasks that aren't already done
  const tasksToRun = allTasks.filter(t => taskStatuses.get(t.id) !== 'done');
  // For dependency resolution, already-done tasks count as completed
  const alreadyDone = new Set(
    allTasks.filter(t => taskStatuses.get(t.id) === 'done').map(t => t.id)
  );

  // Adjust depends_on: remove references to already-completed tasks
  const adjustedTasks = tasksToRun.map(t => ({
    ...t,
    dependsOn: t.dependsOn.filter(dep => !alreadyDone.has(dep)),
  }));

  const emitKanban = () => {
    const tasks: KanbanTask[] = allTasks.map(t => ({
      id: t.id,
      description: t.description,
      status: taskStatuses.get(t.id) || 'queued',
      assignedAgent: resolveRole(t.assignedAgent),
      phaseId: t.phaseId,
      dependsOn: t.dependsOn,
      error: taskErrors.get(t.id),
    }));
    const doneCount = [...taskStatuses.values()].filter(s => s === 'done').length;
    config.onKanbanUpdate({
      projectName: '',
      currentPhase: 'build',
      completionPercent: Math.round((doneCount / allTasks.length) * 100),
      tasks,
    });
  };

  // Emit initial state
  emitKanban();

  const completedTaskOutputs = new Map<string, string>();

  const result = await runDependencyGraph({
    tasks: adjustedTasks,
    concurrency: 4,  // max parallel agent sessions
    run: async (task) => {
      await runTaskSession(task, config, artifactStore, completedTaskOutputs);
    },
    onStatusChange: (taskId, status, error) => {
      taskStatuses.set(taskId, status);
      if (error) taskErrors.set(taskId, error);
      emitKanban();
    },
  });

  if (result.failed) {
    // Emit final failure state
    config.onKanbanUpdate({
      projectName: '',
      currentPhase: 'build',
      completionPercent: Math.round((result.completed.length / allTasks.length) * 100),
      tasks: allTasks.map(t => ({
        id: t.id,
        description: t.description,
        status: taskStatuses.get(t.id) || 'queued',
        assignedAgent: resolveRole(t.assignedAgent),
        phaseId: t.phaseId,
        dependsOn: t.dependsOn,
        error: taskErrors.get(t.id),
      })),
      failed: true,
      failedTaskId: result.failed.taskId,
    });
    config.onSystemMessage(`Build failed: task "${result.failed.taskId}" — ${result.failed.error}`);
  }

  return { allTasks, taskStatuses, taskErrors };
}

async function runTaskSession(
  task: BuildTask,
  config: BuildOrchestratorConfig,
  artifactStore: ArtifactStore,
  completedOutputs: Map<string, string>,
): Promise<void> {
  const role = resolveRole(task.assignedAgent);
  const spec = artifactStore.getSpecForPhase(task.phaseId);

  // Build dependency context — what completed tasks produced
  const depContext = task.dependsOn
    .filter(depId => completedOutputs.has(depId))
    .map(depId => `- ${depId}: ${completedOutputs.get(depId)}`)
    .join('\n');

  const prompt = [
    `You are executing build task: "${task.description}" (${task.id}) in phase "${task.phaseName}".`,
    '',
    'Implement this single task using TDD (write failing test, implement, verify pass).',
    '',
    spec ? `## Phase Spec\n\n${spec}` : '',
    depContext ? `## Completed Dependencies\n\n${depContext}` : '',
    '',
    'After implementation, self-review your work:',
    '1. Re-read the task description. Does your implementation satisfy every requirement?',
    '2. Run all tests. Do they pass?',
    '3. Check for leftover TODOs, debug logs, or commented-out code.',
    'If you find issues, fix them immediately (up to 3 fix cycles).',
    '',
    'When done, output a one-line summary of what you implemented and which files you created/modified.',
  ].filter(Boolean).join('\n');

  await runAgentSession({
    agentName: task.assignedAgent.replace(/_/g, '-'),
    agentsDir: config.agentsDir,
    prompt,
    cwd: config.projectDir,
    env: config.authEnv || {},
    model: task.model,
    excludeAskUser: true,
    onEvent: config.onEvent,
    onWaiting: async () => ({}),
    onToolPermission: (toolName, input) =>
      config.permissionHandler.handleToolRequest(toolName, input, role),
  });

  // Store a summary for downstream tasks
  completedOutputs.set(task.id, `Completed: ${task.description}`);
}
