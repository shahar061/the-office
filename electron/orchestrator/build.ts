import { SDKBridge } from '../sdk/sdk-bridge';
import { loadAllAgents } from '../sdk/agent-loader';
import { ArtifactStore } from '../project/artifact-store';
import type { PermissionHandler } from '../sdk/permission-handler';
import type { AgentEvent, BuildConfig, KanbanState, KanbanTask } from '../../shared/types';
import { resolveRole } from '../sdk/sdk-bridge';
import yaml from 'js-yaml';

export interface BuildPhase {
  id: string;
  name: string;
  dependsOn: string[];
  tasks: { id: string; description: string; assignedAgent: string }[];
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
}

export async function runBuild(config: BuildOrchestratorConfig): Promise<void> {
  const artifactStore = new ArtifactStore(config.projectDir);
  const tasksYaml = artifactStore.getTasksYaml();
  if (!tasksYaml) throw new Error('tasks.yaml not found — run /warroom first');

  const parsed = yaml.load(tasksYaml) as any;
  const phases: BuildPhase[] = (parsed.phases || parsed || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    dependsOn: p.depends_on || [],
    tasks: p.tasks || [],
  }));

  const agents = loadAllAgents(config.agentsDir);
  const completed = new Set<string>();
  const failed = new Set<string>();

  while (completed.size + failed.size < phases.length) {
    const ready = phases.filter(p =>
      !completed.has(p.id) && !failed.has(p.id) &&
      p.dependsOn.every(dep => completed.has(dep))
    );
    if (ready.length === 0) break;

    const results = await Promise.allSettled(
      ready.map(phase => runPhaseSession(phase, agents, config))
    );

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') completed.add(ready[i].id);
      else failed.add(ready[i].id);
      emitKanbanUpdate(phases, completed, failed, config);
    }
  }
}

async function runPhaseSession(
  phase: BuildPhase,
  agents: Record<string, any>,
  config: BuildOrchestratorConfig,
): Promise<void> {
  const bridge = new SDKBridge();
  bridge.on('agentEvent', (event: AgentEvent) => config.onEvent(event));

  const taskList = phase.tasks
    .map(t => `- ${t.id}: ${t.description} (assigned: ${t.assignedAgent})`)
    .join('\n');

  const prompt = [
    `You are executing build phase: ${phase.name} (${phase.id}).`,
    'Implement the following tasks sequentially using TDD:',
    taskList,
    '',
    'For each task: write failing test → implement → verify pass → commit.',
    'Read the spec files in spec/ for implementation details.',
  ].join('\n');

  // Derive agent role from the first task's assignedAgent, or fall back to backend-engineer
  const primaryRole = phase.tasks.length > 0
    ? resolveRole(phase.tasks[0].assignedAgent)
    : 'backend-engineer' as const;

  await bridge.runSession({
    agentId: phase.id,
    agentRole: primaryRole,
    prompt,
    cwd: config.projectDir,
    agents,
    env: config.authEnv,
  });
}

function emitKanbanUpdate(
  phases: BuildPhase[],
  completed: Set<string>,
  failed: Set<string>,
  config: BuildOrchestratorConfig,
): void {
  const tasks: KanbanTask[] = phases.flatMap(phase =>
    phase.tasks.map(t => ({
      id: t.id,
      description: t.description,
      status: failed.has(phase.id) ? 'failed' as const
        : completed.has(phase.id) ? 'done' as const : 'queued' as const,
      assignedAgent: resolveRole(t.assignedAgent),
      phaseId: phase.id,
    }))
  );

  config.onKanbanUpdate({
    projectName: '',
    currentPhase: 'build',
    completionPercent: Math.round((completed.size / phases.length) * 100),
    tasks,
  });
}
