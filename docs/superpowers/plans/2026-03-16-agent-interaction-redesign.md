# Agent Interaction Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign agent interaction to use sequential per-agent SDK sessions with interactive user dialogue via `AskUserQuestion`, matching the office plugin's behavior.

**Architecture:** Replace single-session-per-phase with one `query()` session per agent role. Switch from `bypassPermissions` to `default` permission mode so `canUseTool` fires. Route `AskUserQuestion` through IPC to the renderer for user dialogue. Extract shared `runAgentSession()` to eliminate orchestrator duplication.

**Tech Stack:** Electron, React 19, TypeScript, PixiJS 8, Zustand 5, `@anthropic-ai/claude-agent-sdk` ^0.2.76, Vitest

**Spec:** `docs/superpowers/specs/2026-03-16-agent-interaction-redesign.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `shared/types.ts` | Modify | Add IPC channels, `AskQuestion`, `AgentWaitingPayload`, `PhaseConfig`, update `OfficeAPI` |
| `electron/project/artifact-store.ts` | Modify | Add `readArtifact(filename)` method |
| `electron/sdk/agent-loader.ts` | Modify | Extract `tools` from frontmatter into `AgentDefinition` |
| `electron/sdk/sdk-bridge.ts` | Modify | Switch to `permissionMode: 'default'`, add `canUseTool` with `AskUserQuestion` routing, add `onWaiting` to `SessionConfig` |
| `electron/orchestrator/run-agent-session.ts` | Create | Shared session runner: loads agent, merges tools, runs session, verifies artifacts |
| `electron/orchestrator/imagine.ts` | Modify | 4 sequential `runAgentSession()` calls with system messages |
| `electron/orchestrator/warroom.ts` | Modify | Sequential sessions with system messages |
| `electron/orchestrator/build.ts` | Modify | Use `runAgentSession()` for phase sessions (no `AskUserQuestion`) |
| `electron/main.ts` | Modify | Add `AGENT_WAITING`/`USER_RESPONSE` IPC, pending question map, wire `onWaiting`, cleanup |
| `electron/preload.ts` | Modify | Expose `respondToAgent()` and `onAgentWaiting()` |
| `src/renderer/src/stores/chat.store.ts` | Modify | Add waiting state fields |
| `src/renderer/src/components/OfficeView/OfficeView.tsx` | Modify | Pulsing bubble, option chips, dynamic placeholder, send-to-agent |
| `tests/stores/chat.store.test.ts` | Create | Tests for waiting state |
| `tests/sdk/sdk-bridge.test.ts` | Modify | Update for new permission mode |

---

## Chunk 1: Types, ArtifactStore, and SDK Bridge

### Task 1: Add New Types to shared/types.ts

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add `AskQuestion` and `AgentWaitingPayload` types**

After the `PermissionRequest` interface (line 115), add:

```typescript
// ── Agent Interaction ──

export interface AskQuestion {
  question: string;
  header: string;
  options: { label: string; description: string }[];
  multiSelect: boolean;
}

export interface AgentWaitingPayload {
  sessionId: string;
  agentRole: AgentRole;
  questions: AskQuestion[];
}
```

- [ ] **Step 2: Add new IPC channels**

In the `IPC_CHANNELS` object, add after `STATS_UPDATE`:

```typescript
  // Agent Interaction
  AGENT_WAITING: 'office:agent-waiting',
  USER_RESPONSE: 'office:user-response',
```

- [ ] **Step 3: Add `PhaseConfig` type**

After the `BuildConfig` interface (line 123), add:

```typescript
export interface PhaseConfig {
  projectDir: string;
  agentsDir: string;
  env: Record<string, string>;
  onEvent: (event: AgentEvent) => void;
  onWaiting: (agentRole: AgentRole, questions: AskQuestion[]) => Promise<Record<string, string>>;
}
```

- [ ] **Step 4: Update `OfficeAPI` interface**

Add these methods to the `OfficeAPI` interface (after `respondPermission`):

```typescript
  respondToAgent(sessionId: string, answers: Record<string, string>): Promise<void>;
  onAgentWaiting(callback: (payload: AgentWaitingPayload) => void): () => void;
```

- [ ] **Step 5: Run tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS (additive type changes).

- [ ] **Step 6: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add shared/types.ts
git commit -m "feat: add agent interaction types (AskQuestion, AgentWaitingPayload, PhaseConfig)"
```

---

### Task 2: Add `readArtifact()` to ArtifactStore

**Files:**
- Modify: `electron/project/artifact-store.ts`
- Modify: `tests/project/artifact-store.test.ts`

- [ ] **Step 1: Add `readArtifact` method**

In `ArtifactStore` class (after `getTasksYaml` method, line 38), add:

```typescript
  readArtifact(filename: string): string {
    const filePath = path.join(this.officeDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Artifact not found: ${filename}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }
```

- [ ] **Step 2: Add test for readArtifact**

Read the existing test file `tests/project/artifact-store.test.ts` to understand the test pattern, then add a test for `readArtifact`:

```typescript
  it('readArtifact returns file contents', () => {
    fs.mkdirSync(path.join(tmpDir, 'docs/office'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'docs/office/01-vision-brief.md'), '# Vision');
    expect(store.readArtifact('01-vision-brief.md')).toBe('# Vision');
  });

  it('readArtifact throws if file does not exist', () => {
    expect(() => store.readArtifact('missing.md')).toThrow('Artifact not found');
  });
```

- [ ] **Step 3: Run tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add electron/project/artifact-store.ts tests/project/artifact-store.test.ts
git commit -m "feat: add readArtifact() method to ArtifactStore"
```

---

### Task 2b: Fix AgentLoader to Extract `tools` from Frontmatter

**Files:**
- Modify: `electron/sdk/agent-loader.ts`

**Context:** The `loadAgentDefinition` function currently only extracts `description` and `prompt` from agent markdown files. The `tools` field in `AgentDefinition` is never populated from frontmatter, so `agentDef.tools` is always `undefined`. This means `runAgentSession` would always fall back to a default tool list.

- [ ] **Step 1: Update `loadAgentDefinition` to extract tools**

In `electron/sdk/agent-loader.ts`, update the return statement in `loadAgentDefinition` (line 16-19) from:

```typescript
  return [name, {
    description: (frontmatter.description as string) || name,
    prompt: body.trim(),
  }];
```

to:

```typescript
  return [name, {
    description: (frontmatter.description as string) || name,
    prompt: body.trim(),
    tools: (frontmatter.tools as string[] | undefined) || undefined,
  }];
```

- [ ] **Step 2: Run tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add electron/sdk/agent-loader.ts
git commit -m "fix: extract tools from agent frontmatter in AgentLoader"
```

---

### Task 3: Refactor SDK Bridge for `canUseTool` Support

**Files:**
- Modify: `electron/sdk/sdk-bridge.ts`
- Modify: `tests/sdk/sdk-bridge.test.ts`

**Context:** The current bridge uses `bypassPermissions` which skips `canUseTool`. We need to:
1. Add `onWaiting` and `onToolPermission` callbacks to `SessionConfig`
2. Switch to `permissionMode: 'default'`
3. Wire `canUseTool` to route `AskUserQuestion` to `onWaiting` and other tools to `onToolPermission`

- [ ] **Step 1: Update `SessionConfig` interface**

Replace the current `SessionConfig` (lines 7-18) with:

```typescript
export interface SessionConfig {
  agentId: string;
  agentRole: AgentRole;
  prompt: string;
  systemPrompt?: string;
  cwd?: string;
  agents?: Record<string, { description: string; prompt: string; tools?: string[] }>;
  allowedTools?: string[];
  env?: Record<string, string>;
  maxTurns?: number;
  // New: user interaction callback for AskUserQuestion
  onWaiting?: (questions: Array<{
    question: string;
    header: string;
    options: { label: string; description: string }[];
    multiSelect: boolean;
  }>) => Promise<Record<string, string>>;
  // New: tool permission callback for non-AskUserQuestion tools
  onToolPermission?: (toolName: string, input: Record<string, unknown>) => Promise<{
    behavior: 'allow' | 'deny';
    updatedInput?: Record<string, unknown>;
    message?: string;
  }>;
}
```

Note: removed `permissionMode` from the public interface — the bridge now always uses `default` internally.

- [ ] **Step 2: Update `runSession` to use `canUseTool`**

In the `runSession` method, replace the permission mode block (lines 207-210):

```typescript
    // Default to bypassing permissions — the app handles them via UI
    options.permissionMode = config.permissionMode || 'bypassPermissions';
    // REQUIRED when using bypassPermissions
    options.dangerouslySkipPermissions = true;
```

with:

```typescript
    // Use 'default' permission mode so canUseTool callback fires
    options.permissionMode = 'default';

    // Route tool permissions through canUseTool callback
    options.canUseTool = async (toolName: string, input: Record<string, unknown>) => {
      // AskUserQuestion → route to user interaction
      if (toolName === 'AskUserQuestion' && config.onWaiting) {
        const questions = (input as any).questions || [];
        const answers = await config.onWaiting(questions);
        return {
          behavior: 'allow' as const,
          updatedInput: { questions, answers },
        };
      }

      // Tools in agent's allowed list → auto-approve
      if (config.allowedTools?.includes(toolName)) {
        return { behavior: 'allow' as const };
      }

      // Other tools → delegate to permission callback (or auto-approve if no callback)
      if (config.onToolPermission) {
        return config.onToolPermission(toolName, input);
      }
      return { behavior: 'allow' as const };
    };
```

- [ ] **Step 3: Update existing SDK bridge tests**

Read `tests/sdk/sdk-bridge.test.ts` to understand the current test structure. The tests mock the SDK's `query()` function. Update any tests that assert on `permissionMode` or `dangerouslySkipPermissions` to expect `permissionMode: 'default'` and `canUseTool` being a function.

- [ ] **Step 4: Run tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add electron/sdk/sdk-bridge.ts tests/sdk/sdk-bridge.test.ts
git commit -m "feat: switch SDK bridge to default permission mode with canUseTool routing"
```

---

## Chunk 2: Session Runner and Orchestrator Refactors

### Task 4: Create Shared `runAgentSession()`

**Files:**
- Create: `electron/orchestrator/run-agent-session.ts`

- [ ] **Step 1: Create the session runner**

Create `electron/orchestrator/run-agent-session.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { SDKBridge } from '../sdk/sdk-bridge';
import { loadAgentDefinition } from '../sdk/agent-loader';
import type { AgentEvent, AgentRole, AskQuestion } from '../../shared/types';
import { resolveRole } from '../sdk/sdk-bridge';

export interface AgentSessionConfig {
  agentName: string;
  agentsDir: string;
  prompt: string;
  cwd: string;
  env: Record<string, string>;
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
  bridge.on('agentEvent', (event: AgentEvent) => config.onEvent(event));

  await bridge.runSession({
    agentId: config.agentName,
    agentRole,
    systemPrompt: agentDef.prompt,  // Agent's persona/instructions from markdown
    prompt: config.prompt,           // Orchestrator's contextual instructions
    cwd: config.cwd,
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
```

- [ ] **Step 2: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add electron/orchestrator/run-agent-session.ts
git commit -m "feat: add shared runAgentSession() session runner"
```

---

### Task 5: Refactor Imagine Orchestrator

**Files:**
- Modify: `electron/orchestrator/imagine.ts`

- [ ] **Step 1: Rewrite imagine.ts**

Replace the entire file with:

```typescript
import { ArtifactStore } from '../project/artifact-store';
import { runAgentSession } from './run-agent-session';
import type { AgentEvent, PhaseConfig, ChatMessage } from '../../shared/types';

export interface ImagineConfig extends PhaseConfig {
  // PhaseConfig provides: projectDir, agentsDir, env, onEvent, onWaiting
  onSystemMessage: (text: string) => void;
}

export async function runImagine(userIdea: string, config: ImagineConfig): Promise<void> {
  const { projectDir, agentsDir, env, onEvent, onWaiting, onSystemMessage } = config;
  const artifactStore = new ArtifactStore(projectDir);

  // 1. CEO — Discovery
  await runAgentSession({
    agentName: 'ceo',
    agentsDir,
    prompt: [
      'You are the CEO leading the Discovery phase.',
      'Ask the user clarifying questions to understand their idea deeply.',
      'Use AskUserQuestion to ask structured questions with options when possible.',
      'When you have enough understanding, write the vision brief to docs/office/01-vision-brief.md.',
      '',
      `The user's idea: ${userIdea}`,
    ].join('\n'),
    cwd: projectDir,
    env,
    expectedOutput: 'docs/office/01-vision-brief.md',
    onEvent,
    onWaiting,
  });
  onSystemMessage('CEO completed Discovery phase. Product Manager starting Definition...');

  // 2. PM — Definition
  const visionBrief = artifactStore.readArtifact('01-vision-brief.md');
  await runAgentSession({
    agentName: 'product-manager',
    agentsDir,
    prompt: [
      'You are the Product Manager leading the Definition phase.',
      'Based on the vision brief below, ask the user questions to refine requirements.',
      'Use AskUserQuestion for structured questions when possible.',
      'Produce a detailed PRD and write it to docs/office/02-prd.md.',
      '',
      '## Vision Brief',
      visionBrief,
    ].join('\n'),
    cwd: projectDir,
    env,
    expectedOutput: 'docs/office/02-prd.md',
    onEvent,
    onWaiting,
  });
  onSystemMessage('Product Manager completed Definition. Market Researcher starting Validation...');

  // 3. Market Researcher — Validation
  const prd = artifactStore.readArtifact('02-prd.md');
  await runAgentSession({
    agentName: 'market-researcher',
    agentsDir,
    prompt: [
      'You are the Market Researcher leading the Validation phase.',
      'Research the market landscape, competitors, and opportunities.',
      'Use WebSearch to gather real data.',
      'Write your analysis to docs/office/03-market-analysis.md.',
      '',
      '## Vision Brief',
      visionBrief,
      '',
      '## PRD',
      prd,
    ].join('\n'),
    cwd: projectDir,
    env,
    excludeAskUser: true,  // Researcher works autonomously
    expectedOutput: 'docs/office/03-market-analysis.md',
    onEvent,
    onWaiting,
  });
  onSystemMessage('Market Researcher completed Validation. Chief Architect starting Architecture...');

  // 4. Chief Architect — Architecture
  const allDocs = artifactStore.getImagineContext();
  await runAgentSession({
    agentName: 'chief-architect',
    agentsDir,
    prompt: [
      'You are the Chief Architect leading the Architecture phase.',
      'Based on the design documents below, ask the user about tech stack preferences.',
      'Use AskUserQuestion for structured questions when possible.',
      'Design the system architecture and write it to docs/office/04-system-design.md.',
      '',
      allDocs,
    ].join('\n'),
    cwd: projectDir,
    env,
    expectedOutput: 'docs/office/04-system-design.md',
    onEvent,
    onWaiting,
  });
  onSystemMessage('Chief Architect completed Architecture. Imagine phase complete.');
}
```

- [ ] **Step 2: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add electron/orchestrator/imagine.ts
git commit -m "feat: refactor imagine to 4 sequential agent sessions with user dialogue"
```

---

### Task 6: Refactor Warroom Orchestrator

**Files:**
- Modify: `electron/orchestrator/warroom.ts`

- [ ] **Step 1: Rewrite warroom.ts**

Replace the entire file with:

```typescript
import { ArtifactStore } from '../project/artifact-store';
import { runAgentSession } from './run-agent-session';
import type { PhaseConfig } from '../../shared/types';

export interface WarroomConfig extends PhaseConfig {
  onSystemMessage: (text: string) => void;
}

export async function runWarroom(config: WarroomConfig): Promise<void> {
  const { projectDir, agentsDir, env, onEvent, onWaiting, onSystemMessage } = config;
  const artifactStore = new ArtifactStore(projectDir);
  const context = artifactStore.getImagineContext();

  // 1. Project Manager — plan.md
  await runAgentSession({
    agentName: 'project-manager',
    agentsDir,
    prompt: [
      'You are the Project Manager leading the War Room planning phase.',
      'Based on the design documents below, create a human-readable implementation plan.',
      'Write it to docs/office/plan.md.',
      '',
      context,
    ].join('\n'),
    cwd: projectDir,
    env,
    excludeAskUser: true,
    expectedOutput: 'docs/office/plan.md',
    onEvent,
    onWaiting,
  });
  onSystemMessage('Project Manager completed plan. Team Lead creating task manifest...');

  // 2. Team Lead — tasks.yaml
  const plan = artifactStore.readArtifact('plan.md');
  await runAgentSession({
    agentName: 'team-lead',
    agentsDir,
    prompt: [
      'You are the Team Lead creating the machine-readable task manifest.',
      'Based on the plan and design documents below, create tasks.yaml with phases, dependencies, and assigned agents.',
      'Write it to docs/office/tasks.yaml.',
      '',
      '## Plan',
      plan,
      '',
      context,
    ].join('\n'),
    cwd: projectDir,
    env,
    excludeAskUser: true,
    expectedOutput: 'docs/office/tasks.yaml',
    onEvent,
    onWaiting,
  });
  onSystemMessage('Team Lead completed task manifest. War Room phase complete.');
}
```

- [ ] **Step 2: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add electron/orchestrator/warroom.ts
git commit -m "feat: refactor warroom to sequential agent sessions"
```

---

### Task 7: Refactor Build Orchestrator

**Files:**
- Modify: `electron/orchestrator/build.ts`

- [ ] **Step 1: Update build.ts to use `runAgentSession`**

The parallel phase logic stays the same. Replace `runPhaseSession` to use `runAgentSession`:

Replace the `runPhaseSession` function (lines 63-97) with:

```typescript
async function runPhaseSession(
  phase: BuildPhase,
  config: BuildOrchestratorConfig,
): Promise<void> {
  const primaryRole = phase.tasks.length > 0
    ? resolveRole(phase.tasks[0].assignedAgent)
    : 'backend-engineer' as const;

  const taskList = phase.tasks
    .map(t => `- ${t.id}: ${t.description} (assigned: ${t.assignedAgent})`)
    .join('\n');

  await runAgentSession({
    agentName: phase.tasks[0]?.assignedAgent || 'backend-engineer',
    agentsDir: config.agentsDir,
    prompt: [
      `You are executing build phase: ${phase.name} (${phase.id}).`,
      'Implement the following tasks sequentially using TDD:',
      taskList,
      '',
      'For each task: write failing test → implement → verify pass → commit.',
      'Read the spec files in spec/ for implementation details.',
    ].join('\n'),
    cwd: config.projectDir,
    env: config.authEnv || {},
    excludeAskUser: true,  // Build agents work autonomously
    onEvent: config.onEvent,
    onWaiting: async () => ({}),  // No-op — AskUserQuestion excluded
    onToolPermission: (toolName, input) =>
      config.permissionHandler.handleToolRequest(toolName, input, primaryRole),
  });
}
```

Update `BuildOrchestratorConfig` to include the new fields. Replace the existing interface (lines 16-25 of `build.ts`) with:

```typescript
export interface BuildOrchestratorConfig {
  projectDir: string;
  agentsDir: string;
  apiKey: string;
  authEnv?: Record<string, string>;
  permissionHandler: PermissionHandler;
  buildConfig: BuildConfig;
  onEvent: (event: AgentEvent) => void;
  onKanbanUpdate: (state: KanbanState) => void;
  onWaiting: (agentRole: AgentRole, questions: AskQuestion[]) => Promise<Record<string, string>>;
  onSystemMessage: (text: string) => void;
}
```

Remove the `agents` parameter from `runPhaseSession` since `runAgentSession` loads agents internally.

Update the call site in `runBuild` (line 52) from:
```typescript
      ready.map(phase => runPhaseSession(phase, agents, config))
```
to:
```typescript
      ready.map(phase => runPhaseSession(phase, config))
```

**Import changes for build.ts:**
- Remove: `import { loadAllAgents } from '../sdk/agent-loader';` (no longer needed)
- Remove: `import { SDKBridge } from '../sdk/sdk-bridge';` (used internally by `runAgentSession`)
- Keep: `import { resolveRole } from '../sdk/sdk-bridge';` (still used by `emitKanbanUpdate`)
- Add: `import { runAgentSession } from './run-agent-session';`
- Remove: `const agents = loadAllAgents(config.agentsDir);` line (40) — `runAgentSession` loads agents internally

- [ ] **Step 2: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 3: Run all tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add electron/orchestrator/build.ts
git commit -m "feat: refactor build to use runAgentSession (no AskUserQuestion)"
```

---

## Chunk 3: IPC Wiring (main.ts and preload.ts)

### Task 8: Wire Agent Waiting IPC in main.ts

**Files:**
- Modify: `electron/main.ts`

**Context:** This is the critical wiring task. When an agent calls `AskUserQuestion`, the SDK bridge calls `onWaiting` which was passed through the orchestrator. `main.ts` needs to:
1. Store a pending promise keyed by session ID
2. Send the questions to the renderer via `AGENT_WAITING` IPC
3. Listen for `USER_RESPONSE` IPC and resolve the pending promise
4. Clean up on abort/close

- [ ] **Step 1: Add imports and pending question state**

At the top of `main.ts`, update imports to include new types:

```typescript
import type {
  AgentEvent,
  AgentRole,
  AgentWaitingPayload,
  AskQuestion,
  AppSettings,
  BuildConfig,
  ChatMessage,
  PhaseInfo,
  PermissionRequest,
  SessionStats,
} from '../shared/types';
```

After the `sessionStats` declaration (line 42), add:

```typescript
// Pending AskUserQuestion promises, keyed by session ID
interface PendingQuestion {
  resolve: (answers: Record<string, string>) => void;
  reject: (error: Error) => void;
}
const pendingQuestions = new Map<string, PendingQuestion>();
let nextSessionId = 0;
```

- [ ] **Step 2: Create the `handleAgentWaiting` function**

After the `onAgentEvent` function, add:

```typescript
function handleAgentWaiting(agentRole: AgentRole, questions: AskQuestion[]): Promise<Record<string, string>> {
  return new Promise<Record<string, string>>((resolve, reject) => {
    const sessionId = `session-${++nextSessionId}`;
    pendingQuestions.set(sessionId, { resolve, reject });

    const payload: AgentWaitingPayload = { sessionId, agentRole, questions };
    send(IPC_CHANNELS.AGENT_WAITING, payload);
  });
}
```

This matches the `PhaseConfig.onWaiting` signature: `(agentRole: AgentRole, questions: AskQuestion[]) => Promise<Record<string, string>>`. Each `runAgentSession` call wraps this to pass its own `agentRole` automatically.

- [ ] **Step 3: Create the `onSystemMessage` helper**

After `handleAgentWaiting`, add:

```typescript
function onSystemMessage(text: string): void {
  sendChat({ role: 'system', text });
}
```

- [ ] **Step 4: Add `USER_RESPONSE` IPC handler**

In `setupIPC()`, replace the placeholder `SEND_MESSAGE` handler (lines 285-288):

```typescript
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, _message: string) => {
    // User messages are added to the chat store locally by the renderer.
    // This handler exists for future use (routing messages to active SDK sessions).
  });
```

with:

```typescript
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, _message: string) => {
    // User messages are added to the chat store locally by the renderer.
  });

  ipcMain.handle(IPC_CHANNELS.USER_RESPONSE, async (_event, sessionId: string, answers: Record<string, string>) => {
    const pending = pendingQuestions.get(sessionId);
    if (pending) {
      pendingQuestions.delete(sessionId);
      pending.resolve(answers);
    }
  });
```

- [ ] **Step 5: Update `START_IMAGINE` handler**

Replace the `runImagine` call (lines 204-211) with:

```typescript
      await runImagine(userIdea, {
        projectDir: currentProjectDir,
        agentsDir,
        env: authManager.getAuthEnv() || {},
        onEvent: onAgentEvent,
        onWaiting: handleAgentWaiting,
        onSystemMessage,
      });
```

`handleAgentWaiting` (from Step 2) matches the `PhaseConfig.onWaiting` signature. Inside `runAgentSession`, the call is wrapped to pass the `agentRole` automatically:
```typescript
onWaiting: (questions) => config.onWaiting(agentRole, questions)
```
This was already set up in Task 4.

- [ ] **Step 6: Update `START_WARROOM` handler similarly**

Replace the `runWarroom` call (lines 236-243) with:

```typescript
      await runWarroom({
        projectDir: currentProjectDir,
        agentsDir,
        env: authManager.getAuthEnv() || {},
        onEvent: onAgentEvent,
        onWaiting: handleAgentWaiting,
        onSystemMessage,
      });
```

- [ ] **Step 7: Update `START_BUILD` handler similarly**

Replace the `runBuild` call (lines 264-273) with:

```typescript
      await runBuild({
        projectDir: currentProjectDir,
        agentsDir,
        apiKey: authManager.getApiKey() || '',
        authEnv: authManager.getAuthEnv(),
        permissionHandler: permissionHandler!,
        buildConfig: config,
        onEvent: onAgentEvent,
        onKanbanUpdate: (state) => send(IPC_CHANNELS.KANBAN_UPDATE, state),
        onWaiting: handleAgentWaiting,
        onSystemMessage,
      });
```

Note: `build.ts` still needs its own config shape (`BuildOrchestratorConfig`) since it has extra fields like `buildConfig` and `onKanbanUpdate`. It extends `PhaseConfig` with those.

- [ ] **Step 8: Add cleanup in `window-all-closed`**

In the `window-all-closed` handler (line 371), before `app.quit()`, add:

```typescript
  // Reject any pending AskUserQuestion promises
  for (const [id, pending] of pendingQuestions) {
    pending.reject(new Error('App closing'));
  }
  pendingQuestions.clear();
```

Also add a helper to reject all pending questions, and call it in the `catch` blocks of START_IMAGINE, START_WARROOM, and START_BUILD handlers:

```typescript
function rejectPendingQuestions(reason: string): void {
  for (const [id, pending] of pendingQuestions) {
    pending.reject(new Error(reason));
  }
  pendingQuestions.clear();
}
```

In each phase handler's `catch` block (e.g., the imagine handler at line 213), add `rejectPendingQuestions('Session failed');` before `phaseMachine.markFailed()`.

This ensures that if a session errors while an `AskUserQuestion` promise is pending, the promise is properly rejected rather than leaking.
```

- [ ] **Step 9: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 10: Run all tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 11: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add electron/main.ts shared/types.ts electron/orchestrator/run-agent-session.ts electron/orchestrator/imagine.ts electron/orchestrator/warroom.ts
git commit -m "feat: wire agent waiting IPC with pending question management"
```

---

### Task 9: Update Preload Bridge

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add new API methods**

In `electron/preload.ts`, add these imports to the type import list (line 4):

```typescript
  AgentWaitingPayload,
```

After the `respondPermission` line (line 44), add:

```typescript
  // Agent Interaction
  respondToAgent: (sessionId: string, answers: Record<string, string>) =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_RESPONSE, sessionId, answers),
  onAgentWaiting: (cb: (payload: AgentWaitingPayload) => void) =>
    onEvent(IPC_CHANNELS.AGENT_WAITING, cb),
```

- [ ] **Step 2: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add electron/preload.ts
git commit -m "feat: expose respondToAgent and onAgentWaiting in preload bridge"
```

---

## Chunk 4: Renderer UI (Chat Store + OfficeView)

### Task 10: Add Waiting State to Chat Store

**Files:**
- Modify: `src/renderer/src/stores/chat.store.ts`
- Create: `tests/stores/chat.store.test.ts`

- [ ] **Step 1: Write tests for waiting state**

Create `tests/stores/chat.store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../src/renderer/src/stores/chat.store';

describe('ChatStore waiting state', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      waitingForResponse: false,
      waitingAgentRole: null,
      waitingSessionId: null,
      waitingQuestions: [],
    });
  });

  it('setWaiting sets waiting state from payload', () => {
    useChatStore.getState().setWaiting({
      sessionId: 'session-1',
      agentRole: 'ceo',
      questions: [{ question: 'What?', header: 'Q', options: [], multiSelect: false }],
    });
    const state = useChatStore.getState();
    expect(state.waitingForResponse).toBe(true);
    expect(state.waitingAgentRole).toBe('ceo');
    expect(state.waitingSessionId).toBe('session-1');
    expect(state.waitingQuestions).toHaveLength(1);
  });

  it('setWaiting(null) clears waiting state', () => {
    useChatStore.getState().setWaiting({
      sessionId: 'session-1',
      agentRole: 'ceo',
      questions: [],
    });
    useChatStore.getState().setWaiting(null);
    const state = useChatStore.getState();
    expect(state.waitingForResponse).toBe(false);
    expect(state.waitingAgentRole).toBeNull();
    expect(state.waitingSessionId).toBeNull();
    expect(state.waitingQuestions).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run tests/stores/chat.store.test.ts`
Expected: FAIL — `setWaiting` not defined.

- [ ] **Step 3: Update chat store**

Replace the entire `src/renderer/src/stores/chat.store.ts`:

```typescript
import { create } from 'zustand';
import type { ChatMessage, AgentRole, AgentWaitingPayload, AskQuestion } from '@shared/types';

interface ChatStore {
  messages: ChatMessage[];
  waitingForResponse: boolean;
  waitingAgentRole: AgentRole | null;
  waitingSessionId: string | null;
  waitingQuestions: AskQuestion[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  setWaiting: (payload: AgentWaitingPayload | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  waitingForResponse: false,
  waitingAgentRole: null,
  waitingSessionId: null,
  waitingQuestions: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),
  setWaiting: (payload) =>
    payload
      ? set({
          waitingForResponse: true,
          waitingAgentRole: payload.agentRole,
          waitingSessionId: payload.sessionId,
          waitingQuestions: payload.questions,
        })
      : set({
          waitingForResponse: false,
          waitingAgentRole: null,
          waitingSessionId: null,
          waitingQuestions: [],
        }),
}));
```

- [ ] **Step 4: Run tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add src/renderer/src/stores/chat.store.ts tests/stores/chat.store.test.ts
git commit -m "feat: add waiting state to chat store for agent dialogue"
```

---

### Task 11: Update OfficeView for Waiting UI

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

**Context:** This task adds:
1. Pulsing border animation on the waiting bubble (CSS keyframes via `<style>` tag)
2. "Awaiting your response" label
3. Option chips for structured questions
4. Dynamic input placeholder
5. Wire send to `respondToAgent` when waiting

- [ ] **Step 1: Add `<style>` tag for pulsing animation**

At the very beginning of the `OfficeView` component's return JSX (inside the `<div style={styles.root}>`), add a `<style>` element:

```tsx
      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-left-color: var(--accent-color); }
          50% { border-left-color: rgba(255,255,255,0.1); }
        }
        .bubble-waiting {
          animation: pulse-border 1.5s ease-in-out infinite;
        }
      `}</style>
```

- [ ] **Step 2: Add the `onAgentWaiting` listener in the component**

In `OfficeView`, after the existing `useEffect` for auto-scroll, add:

```typescript
  const { waitingForResponse, waitingAgentRole, waitingSessionId, waitingQuestions, setWaiting } = useChatStore();

  // Listen for agent waiting events
  useEffect(() => {
    const unsub = window.office.onAgentWaiting((payload) => {
      setWaiting(payload);
    });
    return unsub;
  }, []);
```

- [ ] **Step 3: Update `renderMessage` to handle waiting state**

In the `renderMessage` function, after the closing `</div>` of `messageTimestamp`, add a conditional for the waiting state:

The last message in the list should get the pulsing class if `waitingForResponse` is true. Modify `renderMessage` to accept an `isLast` parameter, or check it at the call site.

Simpler approach: in the `.map()` call, pass the index and check if it's the last message:

There are **two** `{messages.map(renderMessage)}` call sites in OfficeView.tsx — one in the expanded layout and one in the collapsed layout. Update **both** to:

```tsx
                  {messages.map((msg, i) => renderMessage(msg, i === messages.length - 1))}
```

Update `renderMessage` signature:

```typescript
  function renderMessage(msg: ChatMessage, isLast: boolean = false) {
```

Add `isLast && waitingForResponse` check to the bubble style:

```typescript
    const isWaiting = isLast && waitingForResponse;

    return (
      <div
        key={msg.id}
        className={isWaiting ? 'bubble-waiting' : undefined}
        style={{
          ...styles.messageBubble(msg.role, accentColor),
          ...(isWaiting ? { '--accent-color': accentColor } as React.CSSProperties : {}),
        }}
      >
        <span style={styles.messageSender(senderColor)}>
          {senderLabel}
        </span>
        <span style={styles.messageText}>{msg.text}</span>
        <div style={styles.messageTimestamp}>{formatTime(msg.timestamp)}</div>
        {isWaiting && (
          <>
            <div style={{ fontSize: '10px', color: '#666', fontStyle: 'italic', marginTop: '6px' }}>
              Awaiting your response
            </div>
            {waitingQuestions.length > 0 && waitingQuestions[0].options.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {waitingQuestions[0].options.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => {
                      setInputValue(opt.label);
                      inputRef.current?.focus();
                    }}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      background: '#2a2a4a',
                      border: '1px solid #444',
                      borderRadius: '12px',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }
```

- [ ] **Step 4: Update the input placeholder**

Change the `inputPlaceholder` logic to account for waiting state:

```typescript
  const inputPlaceholder = waitingForResponse && waitingAgentRole
    ? `Responding to ${agentDisplayName(waitingAgentRole)}...`
    : isIdle
      ? 'What would you like to build?'
      : 'Type a message...';
```

- [ ] **Step 5: Update `handleSend` to route responses**

Update the `handleSend` function to route responses to agents when waiting:

```typescript
  async function handleSend() {
    const text = inputValue.trim();
    if (!text) return;

    setInputValue('');

    // Add user message to store
    addMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now(),
    });

    // If waiting for agent response, send to agent
    if (waitingForResponse && waitingSessionId) {
      // Build answers map from the first question (single-question flow for v1)
      const answers: Record<string, string> = {};
      if (waitingQuestions.length > 0) {
        answers[waitingQuestions[0].question] = text;
      }
      await window.office.respondToAgent(waitingSessionId, answers);
      setWaiting(null);
      return;
    }

    // Normal flow
    if (isIdle) {
      await window.office.startImagine(text);
    } else {
      await window.office.sendMessage(text);
    }
  }
```

- [ ] **Step 6: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 7: Run all tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 8: Manual visual test**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite dev`

Verify:
- Start a project and enter an idea
- The CEO agent should start and ask structured questions
- The latest message bubble should have a pulsing border
- Option chips should appear below the question
- Clicking a chip fills the input
- Input placeholder shows "Responding to CEO..."
- Sending a response clears the waiting state
- System messages appear between agent transitions

- [ ] **Step 9: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: add waiting UI with pulsing bubble, option chips, and agent response routing"
```
