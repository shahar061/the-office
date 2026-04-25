import { ArtifactStore } from '../project/artifact-store';
import type { PermissionHandler } from '../sdk/permission-handler';
import type { AgentEvent, AgentRole, AskQuestion, BuildConfig, KanbanState, KanbanTask } from '../../shared/types';
import { resolveRole } from '../sdk/sdk-bridge';
import { runAgentSession } from './run-agent-session';
import { languageInstructions, currentLanguageFromEnv } from './language';
import { runDependencyGraph, type DependencyTask } from './dependency-graph';
import yaml from 'js-yaml';

const RUN_MD_PROMPT = [
  'The build has just completed. The project has been built and the code is on disk.',
  '',
  'Your job: read the project files and write a concise RUN.md at',
  'docs/office/RUN.md explaining how to run this app.',
  '',
  'Use the Bash and Read tools to:',
  '1. List the project root to see what was created (ls, glob for package.json,',
  '   pyproject.toml, Cargo.toml, etc.)',
  '2. Read the relevant config file(s) to determine the run command',
  '3. Identify any prerequisites (Node version, Python version, system packages)',
  '4. Check for environment variables that need to be set (look for .env.example,',
  '   README.md, or config files)',
  '',
  'Then write docs/office/RUN.md in exactly this format:',
  '',
  '# How to Run',
  '',
  '## Prerequisites',
  '- [List each prerequisite on its own line]',
  '',
  '## Install',
  '[The install command in a code block]',
  '',
  '## Run',
  '[The run command in a code block — this is what the "Run" button will copy',
  'to the clipboard, so make it a single copy-pasteable command]',
  '',
  '## Notes',
  '[Anything the user needs to know: default port, required env vars,',
  'how to access the app, caveats]',
  '',
  'Be concise. The file should fit on one screen. If you cannot determine',
  'the run command for any reason, write "## Run\\n\\n(could not determine',
  'automatically — see the project\'s README)".',
  '',
  'Return: {"status": "complete", "document": "RUN.md"}',
].join('\n');

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
  onActStart?: (actName: string) => void;
  onActComplete?: (actName: string) => void;
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
  const langPrefix = languageInstructions(currentLanguageFromEnv());

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
      await runTaskSession(task, config, artifactStore, completedTaskOutputs, langPrefix);
    },
    onStatusChange: (taskId, status, error) => {
      if (status === 'active') config.onActStart?.(taskId);
      if (status === 'done' || status === 'failed') config.onActComplete?.(taskId);
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

  // Post-build: generate RUN.md via devops agent (non-fatal if it fails)
  if (!result.failed) {
    config.onSystemMessage('Generating RUN.md...');
    try {
      await runAgentSession({
        agentName: 'devops',
        agentsDir: config.agentsDir,
        prompt: langPrefix + RUN_MD_PROMPT,
        cwd: config.projectDir,
        env: config.authEnv || {},
        excludeAskUser: true,
        expectedOutput: 'docs/office/RUN.md',
        onEvent: config.onEvent,
        onWaiting: async () => ({}),
        onToolPermission: (toolName, input) =>
          config.permissionHandler.handleToolRequest(toolName, input, resolveRole('devops')),
      });
      config.onSystemMessage('RUN.md generated.');
    } catch (err: any) {
      console.warn('[Build] Failed to generate RUN.md:', err?.message || err);
      config.onSystemMessage('Could not generate RUN.md automatically (non-fatal).');
    }
  }

  return { allTasks, taskStatuses, taskErrors };
}

async function runTaskSession(
  task: BuildTask,
  config: BuildOrchestratorConfig,
  artifactStore: ArtifactStore,
  completedOutputs: Map<string, string>,
  langPrefix: string,
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
    prompt: langPrefix + prompt,
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
