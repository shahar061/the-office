import fs from 'fs';
import path from 'path';
import { SDKBridge } from '../sdk/sdk-bridge';
import { loadAgentDefinition } from '../sdk/agent-loader';
import type { AgentEvent, AgentRole, AskQuestion } from '../../shared/types';
import { resolveRole } from '../sdk/sdk-bridge';

export interface AgentSessionConfig {
  agentName: string;
  agentLabel?: string;
  agentsDir: string;
  prompt: string;
  cwd: string;
  env: Record<string, string>;
  model?: string;
  expectedOutput?: string;
  excludeAskUser?: boolean;
  onEvent: (event: AgentEvent) => void;
  onWaiting: (agentRole: AgentRole, questions: AskQuestion[]) => Promise<Record<string, string>>;
  onToolPermission?: (toolName: string, input: Record<string, unknown>) => Promise<{
    behavior: 'allow' | 'deny';
    updatedInput?: Record<string, unknown>;
    message?: string;
  }>;
}

export async function runAgentSession(config: AgentSessionConfig): Promise<void> {
  // 1. Load agent definition
  const agentPath = path.join(config.agentsDir, `${config.agentName}.md`);
  const [name, agentDef] = loadAgentDefinition(agentPath);
  const agentRole = resolveRole(name);

  // 2. Build tool list — merge agent's tools with AskUserQuestion
  const tools = [...(agentDef.tools || ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'])];
  if (!config.excludeAskUser && !tools.includes('AskUserQuestion')) {
    tools.push('AskUserQuestion');
  }

  // 3. Run SDK session
  const bridge = new SDKBridge();
  bridge.on('agentEvent', (event: AgentEvent) => {
    if (config.agentLabel) event.agentLabel = config.agentLabel;
    config.onEvent(event);
  });

  await bridge.runSession({
    agentId: config.agentName,
    agentRole,
    systemPrompt: agentDef.prompt,  // Agent's persona/instructions from markdown
    prompt: config.prompt,           // Orchestrator's contextual instructions
    cwd: config.cwd,
    model: config.model,
    allowedTools: tools,
    env: config.env,
    onWaiting: config.excludeAskUser ? undefined : (questions) => config.onWaiting(agentRole, questions),
    onToolPermission: config.onToolPermission,
  });

  // 4. Verify expected output
  if (config.expectedOutput) {
    const outputPath = path.join(config.cwd, config.expectedOutput);
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Expected output not found: ${config.expectedOutput}`);
    }
  }
}
