// electron/orchestrator/imagine.ts
import { SDKBridge } from '../sdk/sdk-bridge';
import { loadAllAgents } from '../sdk/agent-loader';
import type { PermissionHandler } from '../sdk/permission-handler';
import type { AgentEvent } from '../../shared/types';

export interface ImagineConfig {
  projectDir: string;
  agentsDir: string;
  apiKey: string;
  authEnv?: Record<string, string>;
  permissionHandler: PermissionHandler;
  onEvent: (event: AgentEvent) => void;
}

export async function runImagine(userIdea: string, config: ImagineConfig): Promise<void> {
  const agents = loadAllAgents(config.agentsDir);
  const bridge = new SDKBridge();
  bridge.on('agentEvent', (event: AgentEvent) => config.onEvent(event));

  const prompt = [
    'You are the CEO of a virtual startup team. The user wants to build something.',
    'Guide them through the /imagine phase: Discovery → Definition → Validation → Architecture.',
    'You have access to subagents: product-manager, market-researcher, chief-architect.',
    'Dispatch them as needed to produce these artifacts in docs/office/:',
    '- 01-vision-brief.md',
    '- 02-prd.md',
    '- 03-market-analysis.md',
    '- 04-system-design.md',
    '',
    `The user's idea: ${userIdea}`,
  ].join('\n');

  await bridge.runSession({
    agentId: 'ceo',
    agentRole: 'ceo',
    prompt,
    options: {
      apiKey: config.apiKey,
      cwd: config.projectDir,
      agents,
      permissionHandler: config.permissionHandler,
    },
  });
}
