import fs from 'fs';
import path from 'path';
import type { AgentSessionConfig } from '../../electron/orchestrator/run-agent-session';
import type { AgentEvent, AgentRole } from '../../shared/types';
import type { Scenario } from './types';
import { ACT_MANIFEST } from '../engine/act-manifest';

export interface ScenarioRunnerDeps {
  /** Where fixture artifacts live — used by `write-output` events. */
  fixturesDir?: string;
}

export async function runScenario(
  scenario: Scenario,
  config: AgentSessionConfig,
  deps: ScenarioRunnerDeps = {},
): Promise<void> {
  const fixturesDir = deps.fixturesDir ?? path.resolve(__dirname, '..', 'fixtures');
  const agentRole = config.agentName as AgentRole;

  for (const event of scenario.events) {
    if (event.delayMs && event.delayMs > 0) {
      await sleep(event.delayMs);
    }

    switch (event.kind) {
      case 'created':
        emit(config, {
          agentId: config.agentName,
          agentRole,
          source: 'sdk',
          type: 'agent:created',
          isTopLevel: event.isTopLevel ?? true,
          timestamp: Date.now(),
        });
        break;

      case 'tool-start':
        emit(config, {
          agentId: config.agentName,
          agentRole,
          source: 'sdk',
          type: 'agent:tool:start',
          toolName: event.toolName,
          toolId: event.toolId,
          message: event.target,
          timestamp: Date.now(),
        });
        break;

      case 'tool-done':
        emit(config, {
          agentId: config.agentName,
          agentRole,
          source: 'sdk',
          type: 'agent:tool:done',
          toolId: event.toolId,
          timestamp: Date.now(),
        });
        break;

      case 'message':
        emit(config, {
          agentId: config.agentName,
          agentRole,
          source: 'sdk',
          type: 'agent:message',
          message: event.text,
          timestamp: Date.now(),
        });
        break;

      case 'ask-question':
        if (config.onWaiting) {
          await config.onWaiting(agentRole, event.questions);
        }
        break;

      case 'ui-review-ready':
        // Noop here — the real orchestrator calls onUIReviewReady after runAgentSession returns.
        // The scenario only needs to make sure write-output has fired before closed.
        break;

      case 'write-output':
        writeOutput(scenario, fixturesDir, config.cwd);
        break;

      case 'closed':
        emit(config, {
          agentId: config.agentName,
          agentRole,
          source: 'sdk',
          type: 'agent:closed',
          timestamp: Date.now(),
        });
        break;
    }
  }
}

function emit(config: AgentSessionConfig, event: AgentEvent): void {
  config.onEvent(event);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeOutput(scenario: Scenario, fixturesDir: string, projectCwd: string): void {
  const act = ACT_MANIFEST[scenario.target];
  if (!act || act.output === '__build_complete_marker__') return;

  const src = path.join(fixturesDir, 'artifacts', act.output);
  if (!fs.existsSync(src)) {
    throw new Error(`[scenario-runner] Missing output fixture for ${scenario.target}: ${src}`);
  }

  const dst = path.join(projectCwd, 'docs', 'office', act.output);
  fs.mkdirSync(path.dirname(dst), { recursive: true });

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.cpSync(src, dst, { recursive: true });
  } else {
    fs.copyFileSync(src, dst);
  }
}
