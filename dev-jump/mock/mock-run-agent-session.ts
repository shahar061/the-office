import fs from 'fs';
import path from 'path';
import type { AgentSessionConfig } from '../../electron/orchestrator/run-agent-session';
import type { AgentRole } from '../../shared/types';
import { SCENARIOS } from './scenarios-registry';
import { runScenario } from './scenario-runner';
import type { Scenario, MockEvent } from './types';

export async function mockRunAgentSession(config: AgentSessionConfig): Promise<void> {
  const role = config.agentName as AgentRole;
  const scenario = SCENARIOS[role];

  if (scenario) {
    await runScenario(scenario, config);
    return;
  }

  console.warn(`[dev-jump] No mock scenario for ${role}, using skeleton.`);
  const skeleton: Scenario = {
    target: 'imagine.ceo',  // arbitrary — write-output uses config.expectedOutput path
    events: buildSkeletonEvents(config.expectedOutput),
  };

  // Skeleton writes the expectedOutput placeholder directly.
  if (config.expectedOutput) {
    writePlaceholder(config.cwd, config.expectedOutput, role);
  }
  await runScenario({ target: scenario?.target ?? 'imagine.ceo', events: skeleton.events }, config);
}

function buildSkeletonEvents(_expectedOutput?: string): MockEvent[] {
  return [
    { kind: 'created' },
    { kind: 'message', text: '(mocked agent placeholder — no scenario authored)', delayMs: 500 },
    { kind: 'closed', delayMs: 1500 },
  ];
}

function writePlaceholder(projectCwd: string, filename: string, role: AgentRole): void {
  const dst = path.join(projectCwd, 'docs', 'office', filename);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (filename.endsWith('.md')) {
    fs.writeFileSync(dst, `<!-- mock placeholder from ${role} -->\n`, 'utf-8');
  } else if (filename.endsWith('.yaml')) {
    fs.writeFileSync(dst, `# mock placeholder from ${role}\ntasks: []\n`, 'utf-8');
  } else if (filename.endsWith('index.md')) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, `<!-- mock placeholder from ${role} -->\n# UI Designs\n\n## Design Direction\n(placeholder)\n`, 'utf-8');
  } else {
    fs.writeFileSync(dst, '', 'utf-8');
  }
}
