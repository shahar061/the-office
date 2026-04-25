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
  // Callers pass project-relative paths that already include docs/office/...
  // (e.g. 'docs/office/tasks.yaml'). Don't prepend docs/office again — that
  // produced docs/office/docs/office/tasks.yaml and tripped the orchestrator's
  // existence check on the canonical path.
  const dst = path.join(projectCwd, filename);
  fs.mkdirSync(path.dirname(dst), { recursive: true });

  // Prefer real fixture content over an inert placeholder when one exists.
  // Lets the orchestrator parse a populated tasks.yaml (so spec writers and
  // Build can actually advance) instead of stalling on `tasks: []`.
  const fixtureCandidate = path.resolve(__dirname, '..', 'fixtures', 'artifacts', path.basename(filename));
  if (fs.existsSync(fixtureCandidate)) {
    fs.copyFileSync(fixtureCandidate, dst);
    return;
  }

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
