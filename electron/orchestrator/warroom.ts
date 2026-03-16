import { ArtifactStore } from '../project/artifact-store';
import { runAgentSession } from './run-agent-session';
import type { PhaseConfig } from '../../shared/types';

export interface WarroomConfig extends PhaseConfig {
  onSystemMessage: (text: string) => void;
}

export async function runWarroom(config: WarroomConfig): Promise<void> {
  const { projectDir, agentsDir, env, onEvent, onWaiting, onSystemMessage } = config;
  const artifactStore = new ArtifactStore(projectDir);
  const context = artifactStore.getImagineContext();

  // 1. Project Manager — plan.md
  await runAgentSession({
    agentName: 'project-manager',
    agentsDir,
    prompt: [
      'You are the Project Manager leading the War Room planning phase.',
      'Based on the design documents below, create a human-readable implementation plan.',
      'Write it to docs/office/plan.md.',
      '',
      context,
    ].join('\n'),
    cwd: projectDir,
    env,
    excludeAskUser: true,
    expectedOutput: 'docs/office/plan.md',
    onEvent,
    onWaiting,
  });
  onSystemMessage('Project Manager completed plan. Team Lead creating task manifest...');

  // 2. Team Lead — tasks.yaml
  const plan = artifactStore.readArtifact('plan.md');
  await runAgentSession({
    agentName: 'team-lead',
    agentsDir,
    prompt: [
      'You are the Team Lead creating the machine-readable task manifest.',
      'Based on the plan and design documents below, create tasks.yaml with phases, dependencies, and assigned agents.',
      'Write it to docs/office/tasks.yaml.',
      '',
      '## Plan',
      plan,
      '',
      context,
    ].join('\n'),
    cwd: projectDir,
    env,
    excludeAskUser: true,
    expectedOutput: 'docs/office/tasks.yaml',
    onEvent,
    onWaiting,
  });
  onSystemMessage('Team Lead completed task manifest. War Room phase complete.');
}
