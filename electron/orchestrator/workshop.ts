import { runAgentSession } from './run-agent-session';
import { ProjectScanner } from '../project/project-scanner';
import { ArtifactStore } from '../project/artifact-store';
import { parseTriageOutput } from './workshop-parser';
import { resolveRole } from '../sdk/sdk-bridge';
import type { PermissionHandler } from '../sdk/permission-handler';
import type { AgentEvent, Request } from '../../shared/types';

export interface WorkshopConfig {
  projectDir: string;
  agentsDir: string;
  env: Record<string, string>;
  permissionHandler: PermissionHandler;
  onEvent: (event: AgentEvent) => void;
  onRequestUpdated: (request: Request) => void;
}

/**
 * Run a Workshop-mode request end-to-end:
 * 1. Triage via Team Lead (fast model, JSON output)
 * 2. Execute via assigned engineer (default model)
 *
 * Mutates the request object and calls onRequestUpdated at each status change.
 * Returns the final request state.
 */
export async function runWorkshopRequest(
  request: Request,
  config: WorkshopConfig,
): Promise<Request> {
  const scanner = new ProjectScanner(config.projectDir);
  const artifactStore = new ArtifactStore(config.projectDir);
  const fileTree = scanner.getFileTree();
  const imagineContext = artifactStore.hasImagineArtifacts()
    ? artifactStore.getImagineContext()
    : '';

  // ── Step 1: Triage via Team Lead ──

  let triageOutput = '';
  try {
    await runAgentSession({
      agentName: 'team-lead',
      agentsDir: config.agentsDir,
      prompt: buildTriagePrompt(request, fileTree, imagineContext),
      cwd: config.projectDir,
      env: config.env,
      model: 'haiku',
      excludeAskUser: true,
      onEvent: (event) => {
        config.onEvent(event);
        if (event.type === 'agent:message' && event.message) {
          triageOutput += event.message + '\n';
        }
      },
      onWaiting: async () => ({}),
      onToolPermission: (toolName, input) =>
        config.permissionHandler.handleToolRequest(toolName, input, 'team-lead'),
    });
  } catch (err: any) {
    request.status = 'failed';
    request.error = `Triage failed: ${err?.message || err}`;
    request.completedAt = Date.now();
    config.onRequestUpdated(request);
    return request;
  }

  const triage = parseTriageOutput(triageOutput, request.description);
  request.title = triage.title;
  request.assignedAgent = triage.assignedAgent;
  request.status = 'in_progress';
  request.startedAt = Date.now();
  config.onRequestUpdated(request);

  // ── Step 2: Execute via engineer ──

  let lastEngineerMessage = '';
  try {
    await runAgentSession({
      agentName: triage.assignedAgent,
      agentsDir: config.agentsDir,
      prompt: buildEngineerPrompt(request, triage.reasoning, fileTree, imagineContext),
      cwd: config.projectDir,
      env: config.env,
      excludeAskUser: true,
      onEvent: (event) => {
        config.onEvent(event);
        if (event.type === 'agent:message' && event.message) {
          lastEngineerMessage = event.message;
        }
      },
      onWaiting: async () => ({}),
      onToolPermission: (toolName, input) =>
        config.permissionHandler.handleToolRequest(
          toolName,
          input,
          resolveRole(triage.assignedAgent),
        ),
    });
    request.status = 'done';
    request.result = lastEngineerMessage || null;
  } catch (err: any) {
    request.status = 'failed';
    request.error = err?.message || String(err);
  }
  request.completedAt = Date.now();
  config.onRequestUpdated(request);

  return request;
}

function buildTriagePrompt(
  request: Request,
  fileTree: string,
  imagineContext: string,
): string {
  return [
    'You are the Team Lead in Workshop mode. A user has submitted a request to',
    'modify an existing project. Your job is to triage this request: produce a',
    'concise title, pick the right engineer agent, and explain your reasoning.',
    '',
    '## The request',
    request.description,
    '',
    '## Available engineer agents',
    '- backend-engineer — API, database, server logic',
    '- frontend-engineer — UI components, client state, React/Vue/etc.',
    '- mobile-developer — mobile screens, app navigation, platform integrations',
    '- data-engineer — data pipelines, analytics, ETL',
    '- automation-developer — tests, CI/CD, scripts',
    '- devops — infrastructure, deployment, configuration',
    '',
    '## Project context',
    fileTree || '(empty project)',
    '',
    imagineContext ? imagineContext : '',
    '',
    '## Your job',
    'Output a single JSON block (and nothing else) with this exact shape:',
    '{',
    '  "title": "A concise 3-7 word title summarizing the request",',
    '  "assignedAgent": "backend-engineer",',
    '  "reasoning": "One sentence explaining why this agent is the right fit"',
    '}',
    '',
    'Do not do any file reading or code changes. The engineer you assign will',
    'handle the actual work. Your only job is triage.',
  ].join('\n');
}

function buildEngineerPrompt(
  request: Request,
  reasoning: string,
  fileTree: string,
  imagineContext: string,
): string {
  return [
    `You are the ${request.assignedAgent} executing a Workshop-mode request on an existing project.`,
    '',
    '## The request',
    `Title: ${request.title}`,
    `Description: ${request.description}`,
    '',
    '## Why you were picked',
    reasoning,
    '',
    '## Project context',
    fileTree || '(empty project)',
    '',
    imagineContext ? imagineContext : '',
    '',
    '## Your job',
    '1. Explore the project structure to understand the relevant code',
    '2. Make the changes the request asks for',
    '3. Run any tests if they exist',
    '4. Output a one-line summary of what you changed (what files, what behavior)',
    '',
    "Follow the project's existing conventions. Don't introduce new frameworks",
    'or dependencies unless the request explicitly asks for them.',
  ].join('\n');
}
