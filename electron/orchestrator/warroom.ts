import { SDKBridge } from '../sdk/sdk-bridge';
import { loadAllAgents } from '../sdk/agent-loader';
import { ArtifactStore } from '../project/artifact-store';
import type { PermissionHandler } from '../sdk/permission-handler';
import type { AgentEvent } from '../../shared/types';

export interface WarroomConfig {
  projectDir: string;
  agentsDir: string;
  apiKey: string;
  authEnv?: Record<string, string>;
  permissionHandler: PermissionHandler;
  onEvent: (event: AgentEvent) => void;
}

export async function runWarroom(config: WarroomConfig): Promise<void> {
  const agents = loadAllAgents(config.agentsDir);
  const artifactStore = new ArtifactStore(config.projectDir);
  const context = artifactStore.getImagineContext();
  const bridge = new SDKBridge();
  bridge.on('agentEvent', (event: AgentEvent) => config.onEvent(event));

  const agentNames = Object.keys(agents).join(', ');

  const prompt = [
    'You are the Agent Organizer leading the War Room planning phase.',
    `You have access to subagents: ${agentNames}.`,
    'Based on the design documents below, produce:',
    '- docs/office/plan.md — human-readable implementation plan',
    '- docs/office/tasks.yaml — machine-readable task manifest with phases, dependencies, and assigned agents',
    '',
    'Design documents:',
    context,
  ].join('\n');

  await bridge.runSession({
    agentId: 'agent-organizer',
    agentRole: 'agent-organizer',
    prompt,
    options: {
      apiKey: config.apiKey,
      cwd: config.projectDir,
    },
  });
}
