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
  if (process.env.OFFICE_MOCK_AGENTS === '1') {
    const { mockRunAgentSession } = await import('../../dev-jump/mock/mock-run-agent-session');
    return mockRunAgentSession(config);
  }

  // 1. Load agent definition
  const agentPath = path.join(config.agentsDir, `${config.agentName}.md`);
  const [name, agentDef] = loadAgentDefinition(agentPath);
  const agentRole = resolveRole(name);

  // 2. Build tool list — merge agent's tools with AskUserQuestion
  const tools = [...(agentDef.tools || ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'])];
  if (!config.excludeAskUser && !tools.includes('AskUserQuestion')) {
    tools.push('AskUserQuestion');
  }

  // 3. Run SDK session (with retry if expected output is missing)
  const maxAttempts = config.expectedOutput ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const bridge = new SDKBridge();
    bridge.on('agentEvent', (event: AgentEvent) => {
      if (config.agentLabel) event.agentLabel = config.agentLabel;
      config.onEvent(event);
    });

    // Prepend a brief working-directory reminder so agents don't hallucinate paths.
    const cwdReminder = `IMPORTANT: Your working directory is ${config.cwd}. `
      + `Always use relative paths (e.g. "docs/office/file.md") when calling Write, Read, or Edit tools. `
      + `Never guess absolute paths.\n\n`;

    const prompt = attempt === 1
      ? cwdReminder + config.prompt
      : cwdReminder
        + `RETRY: Your previous session ended without producing the required file: ${config.expectedOutput}.\n`
        + `You MUST use the Write tool to create this file before finishing.\n\n`
        + config.prompt;

    await bridge.runSession({
      agentId: config.agentName,
      agentRole,
      systemPrompt: agentDef.prompt,
      prompt,
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
      if (fs.existsSync(outputPath)) {
        return; // Success
      }

      if (attempt < maxAttempts) {
        console.warn(`[AgentSession] Expected output missing after attempt ${attempt}, retrying...`);
        // Emit a visible message so the user knows what's happening
        config.onEvent({
          agentId: config.agentName,
          agentRole,
          source: 'sdk',
          type: 'agent:message',
          timestamp: Date.now(),
          message: `File ${config.expectedOutput} was not created. Retrying...`,
        });
      } else {
        throw new Error(
          `Agent finished but did not produce the expected file: ${config.expectedOutput}. `
          + 'This can happen when the API rate-limits the session or the agent runs out of context. '
          + 'Try again in a minute.'
        );
      }
    }
  }
}
