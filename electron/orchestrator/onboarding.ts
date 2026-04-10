import fs from 'fs';
import path from 'path';
import { runAgentSession } from './run-agent-session';
import { ProjectScanner } from '../project/project-scanner';
import type { PermissionHandler } from '../sdk/permission-handler';
import type { AgentEvent, ProjectState } from '../../shared/types';

export interface OnboardingConfig {
  projectDir: string;
  agentsDir: string;
  env: Record<string, string>;
  permissionHandler: PermissionHandler;
  onEvent: (event: AgentEvent) => void;
  onStatusChange: (status: ProjectState['scanStatus']) => void;
}

/**
 * Run a one-time Chief Architect scan of an existing codebase.
 * Produces docs/office/PROJECT_CONTEXT.md and docs/office/CONVENTIONS.md.
 *
 * Updates scanStatus as it progresses via onStatusChange.
 * Non-fatal on failure — resets status to 'pending' for retry.
 */
export async function runOnboardingScan(
  config: OnboardingConfig,
): Promise<{ success: boolean; error?: string }> {
  config.onStatusChange('in_progress');

  const scanner = new ProjectScanner(config.projectDir);
  const fileTree = scanner.getFileTree(500);

  try {
    await runAgentSession({
      agentName: 'chief-architect',
      agentsDir: config.agentsDir,
      prompt: buildScanPrompt(fileTree),
      cwd: config.projectDir,
      env: config.env,
      model: 'sonnet',
      excludeAskUser: true,
      expectedOutput: 'docs/office/PROJECT_CONTEXT.md',
      onEvent: config.onEvent,
      onWaiting: async () => ({}),
      onToolPermission: (toolName, input) =>
        config.permissionHandler.handleToolRequest(toolName, input, 'chief-architect'),
    });
  } catch (err: any) {
    console.warn('[Onboarding] Scan failed:', err?.message || err);
    config.onStatusChange('pending');
    return { success: false, error: err?.message || String(err) };
  }

  // Verify at minimum PROJECT_CONTEXT.md exists (the expectedOutput)
  const projectContextPath = path.join(
    config.projectDir,
    'docs',
    'office',
    'PROJECT_CONTEXT.md',
  );
  if (!fs.existsSync(projectContextPath)) {
    console.warn('[Onboarding] Scan completed but PROJECT_CONTEXT.md missing');
    config.onStatusChange('pending');
    return { success: false, error: 'Scan completed without producing PROJECT_CONTEXT.md' };
  }

  // CONVENTIONS.md is preferred but not required
  const conventionsPath = path.join(
    config.projectDir,
    'docs',
    'office',
    'CONVENTIONS.md',
  );
  if (!fs.existsSync(conventionsPath)) {
    console.warn('[Onboarding] Scan completed but CONVENTIONS.md missing (non-fatal)');
  }

  config.onStatusChange('done');
  return { success: true };
}

function buildScanPrompt(fileTree: string): string {
  return [
    'You are the Chief Architect. A user has opened an existing codebase in',
    'Workshop mode. Your job is to scan this codebase and produce two context',
    'files that future agents will use when fulfilling user requests.',
    '',
    '## Step 1: Understand the stack',
    '',
    'Use the file tree below to identify the tech stack. Read the relevant',
    'config file:',
    '- If package.json exists → read it (tech: Node/TS, framework, dependencies)',
    '- If pyproject.toml or requirements.txt exists → read it (Python stack)',
    '- If Cargo.toml exists → read it (Rust)',
    '- If go.mod exists → read it (Go)',
    '- If pom.xml or build.gradle exists → read it (Java/Kotlin)',
    '',
    '## Step 2: Read the README if present',
    '',
    'If README.md exists, read it. It often describes what the app does and',
    'how to run it.',
    '',
    '## Step 3: Identify main entry points and architecture',
    '',
    'From the file tree, identify:',
    '- Main entry file (index.ts, main.py, App.tsx, etc.)',
    '- Source directory layout',
    '- Test directory layout',
    '- Any obvious architectural split (frontend/backend, client/server, monorepo)',
    '',
    'Read 2-3 representative source files if needed to understand patterns.',
    '',
    '## Step 4: Identify build/test/run commands',
    '',
    'From config files + README + any scripts you find, identify:',
    '- Install command',
    '- Build command',
    '- Test command (and test framework)',
    '- Run command',
    '',
    '## Step 5: Write docs/office/PROJECT_CONTEXT.md',
    '',
    'Use exactly this structure:',
    '',
    '```markdown',
    '# Project Context',
    '',
    '## What this app does',
    '[1-2 sentences describing the product from a user perspective]',
    '',
    '## Tech stack',
    '- Language: [TypeScript, Python, etc.]',
    '- Framework: [React, Django, etc.]',
    '- Key libraries: [react-router, prisma, fastapi, etc.]',
    '- Database: [Postgres, SQLite, none]',
    '',
    '## Architecture',
    '[2-3 sentences on overall architecture: monolith, client-server, etc.]',
    '',
    '## Main directories',
    '- `src/` — [what\'s in it]',
    '- `api/` — [what\'s in it]',
    '',
    '## Entry points',
    '- Main app: [path to main file]',
    '- Tests: [path to test directory]',
    '```',
    '',
    '## Step 6: Write docs/office/CONVENTIONS.md',
    '',
    'Use exactly this structure:',
    '',
    '```markdown',
    '# Conventions',
    '',
    '## Code style',
    '[Observed patterns: functional vs OO, naming conventions, file layout]',
    '',
    '## Testing',
    '- Test framework: [vitest, pytest, etc.]',
    '- Test command: [npm test, pytest, etc.]',
    '- Pattern: [co-located `.test.ts`, separate `tests/` dir, etc.]',
    '',
    '## Build & run',
    '- Install: [npm install]',
    '- Build: [npm run build]',
    '- Run: [npm start / npm run dev]',
    '- Lint: [npm run lint, if present]',
    '',
    '## Dependencies',
    '[How are dependencies added — package.json, requirements.txt, etc.]',
    '',
    '## Git conventions',
    '[Observed commit message style, branch naming if visible]',
    '```',
    '',
    '## Guardrails',
    '',
    '- Read AT MOST 10 files. This is a scan, not a deep audit.',
    '- Do not read node_modules/, .git/, dist/, build/, or any generated code.',
    "- If you can't determine something (e.g., no tests exist), say so explicitly",
    '  in the file rather than guessing.',
    '- Be concise. Each file should fit on one screen (~40 lines max).',
    '- BOTH files are required. Write PROJECT_CONTEXT.md first, then CONVENTIONS.md.',
    '',
    '## Project file tree',
    '',
    fileTree || '(empty directory)',
  ].join('\n');
}
