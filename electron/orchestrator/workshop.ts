import { runAgentSession } from './run-agent-session';
import { languageInstructions, currentLanguageFromEnv } from './language';
import { ProjectScanner } from '../project/project-scanner';
import { ArtifactStore } from '../project/artifact-store';
import { parseTriageOutput } from './workshop-parser';
import { resolveRole } from '../sdk/sdk-bridge';
import type { PermissionHandler } from '../sdk/permission-handler';
import type { AgentEvent, Request, RequestPlanResponse } from '../../shared/types';
import { enterGitGate, exitGitGate, type GitGateContext } from './workshop-git-gate';

export interface WorkshopConfig {
  projectDir: string;
  agentsDir: string;
  env: Record<string, string>;
  permissionHandler: PermissionHandler;
  onEvent: (event: AgentEvent) => void;
  onRequestUpdated: (request: Request) => void;
}

/** Callback wired by the IPC handler. The orchestrator calls this when a plan
 * is ready and awaits the user's response. */
export type WaitForPlanReview = (
  requestId: string,
  plan: string,
) => Promise<RequestPlanResponse>;

export interface WorkshopConfigWithReview extends WorkshopConfig {
  waitForPlanReview: WaitForPlanReview;
  gitContext: GitGateContext;
}

/**
 * Run a Workshop-mode request end-to-end:
 * 1. Triage via Team Lead (fast model, JSON output)
 * 2. Branch on triage.mode:
 *    - "direct": straight to execute
 *    - "plan": planning loop → review gate → on approve, execute with plan
 *
 * Mutates the request object and calls onRequestUpdated at each status change.
 * Returns the final request state.
 */
export async function runWorkshopRequest(
  request: Request,
  config: WorkshopConfigWithReview,
): Promise<Request> {
  const langPrefix = languageInstructions(currentLanguageFromEnv());
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
      prompt: langPrefix + buildTriagePrompt(request, fileTree, imagineContext),
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

  // ── NEW: Enter git gate ──
  const gate = await enterGitGate(request, config.gitContext);
  request.branchIsolated = gate.isolated;
  if (gate.isolated) {
    request.branchName = gate.branchName!;
    request.baseBranch = gate.baseBranch!;
  }
  config.onRequestUpdated(request);
  const stashLabel = gate.stashLabel ?? '';

  try {
    // ── Step 2: Branch on mode ──
    if (triage.mode === 'direct') {
      return await runExecution(request, triage.reasoning, fileTree, imagineContext, null, config, langPrefix);
    }

    // ── Step 3: Planning + revision loop ──
    let currentPlan: string | null = null;
    let feedback = '';
    while (true) {
      try {
        currentPlan = await runPlanningSession(
          request,
          triage.reasoning,
          fileTree,
          imagineContext,
          currentPlan,
          feedback,
          config,
          langPrefix,
        );
      } catch (err: any) {
        request.status = 'failed';
        request.error = `Planning failed: ${err?.message || err}`;
        request.completedAt = Date.now();
        config.onRequestUpdated(request);
        return request;
      }

      request.plan = currentPlan;
      request.status = 'awaiting_review';
      config.onRequestUpdated(request);

      const review = await config.waitForPlanReview(request.id, currentPlan);

      if (review.action === 'approve') {
        request.status = 'in_progress';
        config.onRequestUpdated(request);
        return await runExecution(request, triage.reasoning, fileTree, imagineContext, currentPlan, config, langPrefix);
      }

      feedback = review.feedback ?? '';
    }
  } finally {
    // ── NEW: Exit git gate — always runs ──
    if (gate.isolated) {
      const outcome = (request.status as string) === 'done' ? 'success' : 'failure';
      const exit = await exitGitGate(request, config.gitContext, outcome, stashLabel);
      request.commitSha = exit.commitSha;
      if (exit.restoreWarning) {
        request.error = request.error
          ? `${request.error}\n${exit.restoreWarning}`
          : exit.restoreWarning;
      }
      config.onRequestUpdated(request);
    }
  }
}

async function runPlanningSession(
  request: Request,
  reasoning: string,
  fileTree: string,
  imagineContext: string,
  previousPlan: string | null,
  feedback: string,
  config: WorkshopConfig,
  langPrefix: string,
): Promise<string> {
  const prompt = previousPlan
    ? buildRevisionPrompt(request, reasoning, fileTree, imagineContext, previousPlan, feedback)
    : buildPlanningPrompt(request, reasoning, fileTree, imagineContext);

  let lastMessage = '';
  await runAgentSession({
    agentName: request.assignedAgent!,
    agentsDir: config.agentsDir,
    prompt: langPrefix + prompt,
    cwd: config.projectDir,
    env: config.env,
    excludeAskUser: true,
    onEvent: (event) => {
      config.onEvent(event);
      if (event.type === 'agent:message' && event.message) {
        lastMessage = event.message;
      }
    },
    onWaiting: async () => ({}),
    onToolPermission: (toolName, input) =>
      config.permissionHandler.handleToolRequest(
        toolName,
        input,
        resolveRole(request.assignedAgent!),
      ),
  });

  const trimmed = lastMessage.trim();
  if (!trimmed) {
    throw new Error('Planning session returned an empty plan');
  }
  return trimmed;
}

async function runExecution(
  request: Request,
  reasoning: string,
  fileTree: string,
  imagineContext: string,
  approvedPlan: string | null,
  config: WorkshopConfig,
  langPrefix: string,
): Promise<Request> {
  const prompt = approvedPlan
    ? buildApprovedExecutionPrompt(request, reasoning, fileTree, imagineContext, approvedPlan)
    : buildEngineerPrompt(request, reasoning, fileTree, imagineContext);

  let lastEngineerMessage = '';
  try {
    await runAgentSession({
      agentName: request.assignedAgent!,
      agentsDir: config.agentsDir,
      prompt: langPrefix + prompt,
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
          resolveRole(request.assignedAgent!),
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
    '  "reasoning": "One sentence explaining why this agent is the right fit",',
    '  "mode": "direct"',
    '}',
    '',
    '## The mode field',
    'Decide whether the engineer should plan first or jump straight in:',
    '- "direct" — simple, localized change the engineer can execute immediately',
    '  (rename a variable, tweak a string, add a small obvious field).',
    '- "plan" — touches multiple files, ambiguous scope, or the user would',
    '  reasonably want to review the approach before code is written.',
    'When in doubt, prefer "plan" — a brief review is cheaper than a wrong rewrite.',
    '',
    'Do not do any file reading or code changes. The engineer you assign will',
    'handle the actual work. Your only job is triage.',
  ].join('\n');
}

export function buildEngineerPrompt(
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

export function buildPlanningPrompt(
  request: Request,
  reasoning: string,
  fileTree: string,
  imagineContext: string,
): string {
  return [
    `You are the ${request.assignedAgent} planning a Workshop-mode request on an existing project.`,
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
    'Write a minimal plan for how you will implement this request. Use this',
    'exact template and keep the total under 30 lines:',
    '',
    '## Summary',
    '(1–2 sentences — what you will do)',
    '',
    '## Files',
    '- path/to/file.ts — what changes',
    '- path/to/other.tsx — what changes',
    '',
    '## Approach',
    '- Step 1',
    '- Step 2',
    '- Step 3',
    '',
    'Do NOT write any code. Do NOT modify files. You may read files to',
    'understand the codebase, but your only output is the plan markdown.',
    'Respond with the plan markdown and nothing else.',
  ].join('\n');
}

export function buildRevisionPrompt(
  request: Request,
  reasoning: string,
  fileTree: string,
  imagineContext: string,
  previousPlan: string,
  feedback: string,
): string {
  return [
    buildPlanningPrompt(request, reasoning, fileTree, imagineContext),
    '',
    '## Previous plan (rejected)',
    previousPlan,
    '',
    '## User feedback',
    feedback || '(no specific feedback — rewrite from scratch)',
    '',
    'Write a revised plan that addresses the feedback. Use the same template.',
  ].join('\n');
}

export function buildApprovedExecutionPrompt(
  request: Request,
  reasoning: string,
  fileTree: string,
  imagineContext: string,
  approvedPlan: string,
): string {
  return [
    buildEngineerPrompt(request, reasoning, fileTree, imagineContext),
    '',
    '## Approved plan',
    'The user has reviewed and approved this plan. Follow it:',
    '',
    approvedPlan,
  ].join('\n');
}

/**
 * Continue a Workshop request after a persisted plan has been reviewed on
 * restart. Skips triage entirely. `response.action === 'approve'` goes
 * straight to execution; `'revise'` runs a fresh planning session (and the
 * subsequent review loop).
 */
export async function continueWorkshopAfterReview(
  request: Request,
  response: RequestPlanResponse,
  config: WorkshopConfigWithReview,
): Promise<Request> {
  if (!request.assignedAgent) {
    request.status = 'failed';
    request.error = 'Cannot resume: no assigned agent';
    request.completedAt = Date.now();
    config.onRequestUpdated(request);
    return request;
  }

  const langPrefix = languageInstructions(currentLanguageFromEnv());
  const scanner = new ProjectScanner(config.projectDir);
  const artifactStore = new ArtifactStore(config.projectDir);
  const fileTree = scanner.getFileTree();
  const imagineContext = artifactStore.hasImagineArtifacts()
    ? artifactStore.getImagineContext()
    : '';
  const reasoning = 'Resumed after app restart';

  if (response.action === 'approve' && request.plan) {
    request.status = 'in_progress';
    config.onRequestUpdated(request);
    return runExecution(request, reasoning, fileTree, imagineContext, request.plan, config, langPrefix);
  }

  // revise — loop into a fresh planning session
  let currentPlan = request.plan;
  let feedback = response.feedback ?? '';
  while (true) {
    try {
      currentPlan = await runPlanningSession(
        request,
        reasoning,
        fileTree,
        imagineContext,
        currentPlan,
        feedback,
        config,
        langPrefix,
      );
    } catch (err: any) {
      request.status = 'failed';
      request.error = `Planning failed: ${err?.message || err}`;
      request.completedAt = Date.now();
      config.onRequestUpdated(request);
      return request;
    }

    request.plan = currentPlan;
    request.status = 'awaiting_review';
    config.onRequestUpdated(request);

    const nextReview = await config.waitForPlanReview(request.id, currentPlan);

    if (nextReview.action === 'approve') {
      request.status = 'in_progress';
      config.onRequestUpdated(request);
      return runExecution(request, reasoning, fileTree, imagineContext, currentPlan, config, langPrefix);
    }
    feedback = nextReview.feedback ?? '';
  }
}
