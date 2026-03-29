# Parallel Team Lead Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single Team Lead agent with a two-stage pipeline — coordinator TL writes tasks.yaml, then parallel spec-writer TL clones each produce a per-phase TDD implementation spec.

**Architecture:** Stage 1 runs a single TL to create the task manifest (tasks.yaml with model tiers). Stage 2 parses phases from tasks.yaml, then spawns up to `maxParallelTLs` concurrent TL agents, each writing `docs/office/specs/phase-{id}.md`. The war table choreography is extended with clone-specific events.

**Tech Stack:** TypeScript, Electron, Vitest, js-yaml, @anthropic-ai/claude-agent-sdk

---

## File Structure

### Types (shared)
- Modify: `shared/types.ts` — extend `WarTableChoreographyPayload` with clone fields, add `maxParallelTLs` to `AppSettings`

### Artifact Store
- Modify: `electron/project/artifact-store.ts` — add `ensureSpecsDir()`, `getSpecForPhase()`, clear specs on warroom reset
- Modify: `tests/project/artifact-store.test.ts` — tests for new methods

### SDK Bridge
- Modify: `electron/sdk/sdk-bridge.ts` — accept and pass `model` option to SDK `query()`
- Modify: `electron/orchestrator/run-agent-session.ts` — add optional `model` field, pass through to SDK bridge

### Warroom Orchestrator
- Modify: `electron/orchestrator/warroom.ts` — two-stage TL pipeline with batched concurrency

### Build Phase
- Modify: `electron/orchestrator/build.ts` — parse `model` from tasks.yaml, point each phase at its spec file, pass model through

### Agent Definition
- Modify: `agents/team-lead.md` — remove `05-implementation-spec.md` references, spec output is now per-phase

---

## Phase 1: Types & Settings

### Task 1: Extend WarTableChoreographyPayload and AppSettings

**Files:**
- Modify: `shared/types.ts:186-188` (WarTableChoreographyPayload)
- Modify: `shared/types.ts:234-238` (AppSettings)

- [ ] **Step 1: Update WarTableChoreographyPayload**

In `shared/types.ts`, replace the current `WarTableChoreographyPayload`:

```typescript
export interface WarTableChoreographyPayload {
  step: 'intro-walk' | 'pm-reading' | 'pm-writing' | 'pm-done'
      | 'tl-reading' | 'tl-writing' | 'tl-coordinator-done'
      | 'tl-clone-spawned' | 'tl-clone-writing' | 'tl-clone-done'
      | 'tl-done';
  cloneId?: string;
  phaseId?: string;
  totalClones?: number;
}
```

- [ ] **Step 2: Update AppSettings**

In the same file, add `maxParallelTLs` to `AppSettings`:

```typescript
export interface AppSettings {
  defaultModelPreset: BuildConfig['modelPreset'];
  defaultPermissionMode: BuildConfig['permissionMode'];
  maxParallelTLs: number;
  windowBounds?: { x: number; y: number; width: number; height: number };
}
```

- [ ] **Step 3: Verify the project compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `WarTableChoreographyPayload` or `AppSettings`. (There may be pre-existing errors unrelated to this change — that's OK.)

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "feat: extend WarTableChoreographyPayload with clone fields, add maxParallelTLs setting"
```

---

## Phase 2: Artifact Store

### Task 2: Add ensureSpecsDir and getSpecForPhase methods

**Files:**
- Modify: `electron/project/artifact-store.ts`
- Modify: `tests/project/artifact-store.test.ts`

- [ ] **Step 1: Write failing test for ensureSpecsDir**

Add to `tests/project/artifact-store.test.ts`:

```typescript
describe('ensureSpecsDir()', () => {
  it('creates the specs directory when it does not exist', () => {
    setupOfficeDir(tmpDir);
    store.ensureSpecsDir();
    const specsDir = path.join(tmpDir, OFFICE_SUBDIR, 'specs');
    expect(fs.existsSync(specsDir)).toBe(true);
  });

  it('does not throw when specs directory already exists', () => {
    const officeDir = setupOfficeDir(tmpDir);
    fs.mkdirSync(path.join(officeDir, 'specs'));
    expect(() => store.ensureSpecsDir()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

Run: `npx vitest run tests/project/artifact-store.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `store.ensureSpecsDir is not a function`

- [ ] **Step 3: Implement ensureSpecsDir**

In `electron/project/artifact-store.ts`, add this method to the `ArtifactStore` class:

```typescript
ensureSpecsDir(): void {
  const specsDir = path.join(this.officeDir, 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

Run: `npx vitest run tests/project/artifact-store.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Write failing test for getSpecForPhase**

Add to `tests/project/artifact-store.test.ts`:

```typescript
describe('getSpecForPhase()', () => {
  it('returns null when specs directory does not exist', () => {
    setupOfficeDir(tmpDir);
    expect(store.getSpecForPhase('setup')).toBeNull();
  });

  it('returns null when spec file does not exist', () => {
    const officeDir = setupOfficeDir(tmpDir);
    fs.mkdirSync(path.join(officeDir, 'specs'));
    expect(store.getSpecForPhase('setup')).toBeNull();
  });

  it('returns file content when spec file exists', () => {
    const officeDir = setupOfficeDir(tmpDir);
    fs.mkdirSync(path.join(officeDir, 'specs'));
    fs.writeFileSync(path.join(officeDir, 'specs', 'phase-setup.md'), '# Setup spec');
    expect(store.getSpecForPhase('setup')).toBe('# Setup spec');
  });
});
```

- [ ] **Step 6: Run test to verify it fails (RED)**

Run: `npx vitest run tests/project/artifact-store.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `store.getSpecForPhase is not a function`

- [ ] **Step 7: Implement getSpecForPhase**

In `electron/project/artifact-store.ts`, add this method to the `ArtifactStore` class:

```typescript
getSpecForPhase(phaseId: string): string | null {
  const filePath = path.join(this.officeDir, 'specs', `phase-${phaseId}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}
```

- [ ] **Step 8: Run test to verify it passes (GREEN)**

Run: `npx vitest run tests/project/artifact-store.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add electron/project/artifact-store.ts tests/project/artifact-store.test.ts
git commit -m "feat: add ensureSpecsDir and getSpecForPhase to ArtifactStore"
```

### Task 3: Update clearFrom to delete specs directory

**Files:**
- Modify: `electron/project/artifact-store.ts`
- Modify: `tests/project/artifact-store.test.ts`

- [ ] **Step 1: Write failing test**

Add to the existing `clearFrom()` describe block in `tests/project/artifact-store.test.ts`:

```typescript
it('clearFrom warroom also deletes the specs directory', () => {
  createFiles('01-vision-brief.md', 'plan.md', 'tasks.yaml');
  const specsDir = path.join(officeDir, 'specs');
  fs.mkdirSync(specsDir);
  fs.writeFileSync(path.join(specsDir, 'phase-setup.md'), 'spec content');
  store.clearFrom('warroom');
  expect(fs.existsSync(specsDir)).toBe(false);
});

it('clearFrom imagine also deletes the specs directory', () => {
  createFiles('01-vision-brief.md', 'plan.md', 'tasks.yaml');
  const specsDir = path.join(officeDir, 'specs');
  fs.mkdirSync(specsDir);
  fs.writeFileSync(path.join(specsDir, 'phase-backend.md'), 'spec content');
  store.clearFrom('imagine');
  expect(fs.existsSync(specsDir)).toBe(false);
});

it('clearFrom build does not delete the specs directory', () => {
  createFiles('plan.md', 'tasks.yaml');
  const specsDir = path.join(officeDir, 'specs');
  fs.mkdirSync(specsDir);
  fs.writeFileSync(path.join(specsDir, 'phase-setup.md'), 'spec content');
  store.clearFrom('build');
  expect(fs.existsSync(specsDir)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails (RED)**

Run: `npx vitest run tests/project/artifact-store.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: FAIL — specs directory still exists after `clearFrom('warroom')`

- [ ] **Step 3: Update clearFrom implementation**

In `electron/project/artifact-store.ts`, modify the `clearFrom` method. Add after the file deletion loop:

```typescript
clearFrom(phase: Phase): void {
  const idx = PHASE_ORDER.indexOf(phase);
  const phasesToClear = PHASE_ORDER.slice(idx);

  for (const p of phasesToClear) {
    const artifacts = PHASE_ARTIFACTS[p];
    if (!artifacts) continue;
    for (const filename of artifacts) {
      const filePath = path.join(this.officeDir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  // Clear specs directory if warroom or earlier is being cleared
  if (phasesToClear.includes('warroom')) {
    const specsDir = path.join(this.officeDir, 'specs');
    if (fs.existsSync(specsDir)) {
      fs.rmSync(specsDir, { recursive: true, force: true });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

Run: `npx vitest run tests/project/artifact-store.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/project/artifact-store.ts tests/project/artifact-store.test.ts
git commit -m "feat: clearFrom deletes specs directory when clearing warroom"
```

---

## Phase 3: Model Passthrough (SDK → Build)

### Task 4: Add model field to SessionConfig and SDKBridge

**Files:**
- Modify: `electron/sdk/sdk-bridge.ts:7-30` (SessionConfig interface and runSession)

- [ ] **Step 1: Add model to SessionConfig**

In `electron/sdk/sdk-bridge.ts`, add the `model` field to `SessionConfig`:

```typescript
export interface SessionConfig {
  agentId: string;
  agentRole: AgentRole;
  prompt: string;
  systemPrompt?: string;
  cwd?: string;
  model?: string;
  agents?: Record<string, { description: string; prompt: string; tools?: string[] }>;
  allowedTools?: string[];
  env?: Record<string, string>;
  maxTurns?: number;
  onWaiting?: (questions: Array<{
    question: string;
    header: string;
    options: { label: string; description: string }[];
    multiSelect: boolean;
  }>) => Promise<Record<string, string>>;
  onToolPermission?: (toolName: string, input: Record<string, unknown>) => Promise<{
    behavior: 'allow' | 'deny';
    updatedInput?: Record<string, unknown>;
    message?: string;
  }>;
}
```

- [ ] **Step 2: Pass model to SDK query options**

In `SDKBridge.runSession()`, add after the `maxTurns` line:

```typescript
if (config.model) options.model = config.model;
```

So the options block becomes:

```typescript
const options: Record<string, unknown> = {};
if (config.systemPrompt) options.systemPrompt = config.systemPrompt;
if (config.cwd) options.cwd = config.cwd;
if (config.agents) options.agents = config.agents;
if (config.allowedTools) options.allowedTools = config.allowedTools;
if (config.maxTurns) options.maxTurns = config.maxTurns;
if (config.model) options.model = config.model;
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add electron/sdk/sdk-bridge.ts
git commit -m "feat: add model field to SessionConfig, pass through to SDK query"
```

### Task 5: Add model field to AgentSessionConfig

**Files:**
- Modify: `electron/orchestrator/run-agent-session.ts`

- [ ] **Step 1: Add model to AgentSessionConfig and pass through**

In `electron/orchestrator/run-agent-session.ts`, add `model` to the config interface and pass it to `bridge.runSession()`:

```typescript
export interface AgentSessionConfig {
  agentName: string;
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
```

Then in `runAgentSession`, pass it to the bridge:

```typescript
await bridge.runSession({
  agentId: config.agentName,
  agentRole,
  systemPrompt: agentDef.prompt,
  prompt: config.prompt,
  cwd: config.cwd,
  model: config.model,
  allowedTools: tools,
  env: config.env,
  onWaiting: config.excludeAskUser ? undefined : (questions) => config.onWaiting(agentRole, questions),
  onToolPermission: config.onToolPermission,
});
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add electron/orchestrator/run-agent-session.ts
git commit -m "feat: add model field to AgentSessionConfig, pass through to SDKBridge"
```

---

## Phase 4: Warroom Orchestrator — Two-Stage TL Pipeline

### Task 6: Rewrite warroom TL section with coordinator + parallel spec writers

**Files:**
- Modify: `electron/orchestrator/warroom.ts`

- [ ] **Step 1: Add settings import and helper function**

At the top of `warroom.ts`, add the `yaml` import and a batch helper:

```typescript
import { ArtifactStore } from '../project/artifact-store';
import { runAgentSession } from './run-agent-session';
import type { PhaseConfig, WarTableCard, WarTableVisualState, WarTableChoreographyPayload, WarTableReviewResponse, AppSettings } from '../../shared/types';
import yaml from 'js-yaml';

interface ParsedPhase {
  id: string;
  name: string;
  tasks: { id: string; description: string; assigned_agent: string; model: string }[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
```

- [ ] **Step 2: Add getSettings to WarroomConfig**

Update the `WarroomConfig` interface:

```typescript
export interface WarroomConfig extends PhaseConfig {
  onSystemMessage: (text: string) => void;
  onWarTableState: (state: WarTableVisualState) => void;
  onWarTableCardAdded: (card: WarTableCard) => void;
  onWarTableChoreography: (payload: WarTableChoreographyPayload) => void;
  onReviewReady: (content: string, artifact: 'plan' | 'tasks') => Promise<WarTableReviewResponse>;
  waitForIntro: () => Promise<void>;
  getSettings: () => Promise<AppSettings>;
}
```

- [ ] **Step 3: Rewrite the TL section of runWarroom**

Replace everything from `// ── Act 3: Team Lead breaks down tasks ──` through the end of `runWarroom` (before the `delay` helper) with the two-stage pipeline:

```typescript
  // ── Act 3: Coordinator TL writes tasks.yaml ──

  onWarTableState('expanding');
  onWarTableChoreography({ step: 'tl-reading' });
  onSystemMessage('Team Lead is analyzing the plan and creating task manifest...');

  const feedbackClause = reviewResponse.feedback
    ? `\n\nThe user reviewed the plan and has this feedback — incorporate it into your task breakdown:\n${reviewResponse.feedback}`
    : '';

  await runAgentSession({
    agentName: 'team-lead',
    agentsDir,
    prompt: [
      'You are the Team Lead creating the machine-readable task manifest.',
      'Based on the plan and design documents below, create ONLY tasks.yaml.',
      'Do NOT write an implementation spec — that will be handled separately per phase.',
      '',
      'For each task, include a `model` field with one of: "opus", "sonnet", "haiku".',
      'Use opus for complex architectural tasks, sonnet for standard implementation, haiku for boilerplate/config.',
      '',
      'Write it to docs/office/tasks.yaml.',
      feedbackClause,
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

  onWarTableChoreography({ step: 'tl-writing' });
  onSystemMessage('Task manifest ready. Parsing phases...');

  // Parse milestones from plan for war table cards
  const milestoneEntries = artifactStore.parsePlanMilestones();

  // Parse phases from tasks.yaml
  const tasksYaml = artifactStore.getTasksYaml();
  if (!tasksYaml) throw new Error('tasks.yaml not found after coordinator TL');
  const parsed = yaml.load(tasksYaml) as any;
  const phases: ParsedPhase[] = (parsed.phases || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    tasks: (p.tasks || []).map((t: any) => ({
      id: t.id,
      description: t.description,
      assigned_agent: t.assigned_agent || 'backend_engineer',
      model: t.model || 'sonnet',
    })),
  }));

  onWarTableChoreography({ step: 'tl-coordinator-done', totalClones: phases.length });
  onSystemMessage(`Spawning ${phases.length} spec writers...`);

  // ── Act 4: Parallel spec-writer TL clones ──

  artifactStore.ensureSpecsDir();
  const settings = await getSettings();
  const maxConcurrency = settings.maxParallelTLs || 4;
  const batches = chunk(phases, maxConcurrency);

  for (const batch of batches) {
    // Emit spawn events for this batch
    for (const phase of batch) {
      const cloneId = `tl-${phase.id}`;
      onWarTableChoreography({ step: 'tl-clone-spawned', cloneId, phaseId: phase.id });
    }

    // Run batch in parallel
    const results = await Promise.allSettled(
      batch.map(async (phase) => {
        const cloneId = `tl-${phase.id}`;
        onWarTableChoreography({ step: 'tl-clone-writing', cloneId, phaseId: phase.id });

        const phaseTaskList = phase.tasks
          .map(t => `- ${t.id}: ${t.description} (agent: ${t.assigned_agent}, model: ${t.model})`)
          .join('\n');

        await runAgentSession({
          agentName: 'team-lead',
          agentsDir,
          prompt: [
            `You are a spec-writer Team Lead. Write the TDD implementation spec for phase "${phase.name}" (${phase.id}).`,
            '',
            `Write the spec to docs/office/specs/phase-${phase.id}.md`,
            '',
            'Follow strict TDD (red-green-refactor) for every task. Each step must have:',
            '- Checkbox syntax (- [ ]) for tracking',
            '- Complete code — no placeholders',
            '- Exact file paths and test commands',
            '- Bite-sized steps (2-5 minutes each)',
            '',
            `## Phase Tasks`,
            phaseTaskList,
            '',
            '## Plan',
            plan,
            '',
            context,
          ].join('\n'),
          cwd: projectDir,
          env,
          excludeAskUser: true,
          expectedOutput: `docs/office/specs/phase-${phase.id}.md`,
          onEvent,
          onWaiting,
        });

        onWarTableChoreography({ step: 'tl-clone-done', cloneId, phaseId: phase.id });

        // Emit task cards for this phase
        const taskEntries = phase.tasks;
        const milestoneId = milestoneEntries.find(m =>
          m.title.toLowerCase().includes(phase.name.toLowerCase())
        )?.id || `m${phases.indexOf(phase) + 1}`;

        for (const t of taskEntries) {
          onWarTableCardAdded({ id: t.id, type: 'task', title: t.description, parentId: milestoneId });
          await delay(250);
        }
      })
    );

    // Log failures but don't block other batches
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const phase = batch[i];
        console.error(`[Warroom] Spec writer failed for phase ${phase.id}:`, (results[i] as PromiseRejectedResult).reason);
        onSystemMessage(`Warning: spec writer for phase "${phase.name}" failed.`);
      }
    }
  }

  onWarTableChoreography({ step: 'tl-done' });
  onWarTableState('complete');
  onSystemMessage('All specs complete. Review the war table or continue to Build.');
```

- [ ] **Step 4: Remove old task card emission**

The old code that parsed tasks and emitted cards after the single TL run should be fully replaced by the code above. Verify the full `runWarroom` function no longer references `parseTaskEntries()`.

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors. (May need to update callers that pass `WarroomConfig` to include `getSettings`.)

- [ ] **Step 6: Commit**

```bash
git add electron/orchestrator/warroom.ts
git commit -m "feat: two-stage TL pipeline — coordinator + parallel spec writers"
```

---

## Phase 5: Build Phase Updates

### Task 7: Update build phase to use per-phase specs and model routing

**Files:**
- Modify: `electron/orchestrator/build.ts`

- [ ] **Step 1: Update BuildPhase task interface**

Add `model` to the task type in `BuildPhase`:

```typescript
export interface BuildPhase {
  id: string;
  name: string;
  dependsOn: string[];
  tasks: { id: string; description: string; assignedAgent: string; model: string }[];
}
```

- [ ] **Step 2: Parse model from tasks.yaml**

In `runBuild`, update the phase parsing to include `model`:

```typescript
const phases: BuildPhase[] = (parsed.phases || parsed || []).map((p: any) => ({
  id: p.id,
  name: p.name,
  dependsOn: p.depends_on || [],
  tasks: (p.tasks || []).map((t: any) => ({
    id: t.id,
    description: t.description,
    assignedAgent: t.assigned_agent,
    model: t.model || 'sonnet',
  })),
}));
```

- [ ] **Step 3: Update runPhaseSession to use spec file and model**

Replace the `runPhaseSession` function:

```typescript
async function runPhaseSession(
  phase: BuildPhase,
  config: BuildOrchestratorConfig,
): Promise<void> {
  const primaryRole = phase.tasks.length > 0
    ? resolveRole(phase.tasks[0].assignedAgent)
    : 'backend-engineer' as const;

  const primaryModel = phase.tasks[0]?.model || 'sonnet';

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
      `Read docs/office/specs/phase-${phase.id}.md for detailed TDD implementation steps.`,
      'Follow each step exactly — write failing test, verify failure, implement, verify pass, commit.',
    ].join('\n'),
    cwd: config.projectDir,
    env: config.authEnv || {},
    model: primaryModel,
    excludeAskUser: true,
    onEvent: config.onEvent,
    onWaiting: async () => ({}),
    onToolPermission: (toolName, input) =>
      config.permissionHandler.handleToolRequest(toolName, input, primaryRole),
  });
}
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add electron/orchestrator/build.ts
git commit -m "feat: build phase uses per-phase specs and model routing from tasks.yaml"
```

---

## Phase 6: Agent Definition Update

### Task 8: Update team-lead.md to remove 05-implementation-spec references

**Files:**
- Modify: `agents/team-lead.md`

- [ ] **Step 1: Update the agent definition**

In `agents/team-lead.md`, make these changes:

1. Update the description frontmatter:

```yaml
description: |
  Pragmatic Team Lead who breaks down architecture into bite-sized Claude-tasks during /plan. Creates tasks.yaml and per-phase TDD implementation specs.
```

2. Replace the "Output Files" section:

```markdown
## Output Files

Your output depends on which mode the orchestrator runs you in:

### Coordinator Mode (tasks.yaml only)
When told to create ONLY tasks.yaml, write just the manifest — no implementation specs.

### Spec-Writer Mode (per-phase spec)
When told to write a spec for a specific phase, write it to the path specified in your instructions (e.g., `docs/office/specs/phase-{id}.md`).
```

3. In the "05-implementation-spec.md" section, replace the header and file path references:

Change "## 05-implementation-spec.md — The Core Output" to "## Per-Phase Implementation Spec — The Core Output"

Replace:
```
**You MUST also write `docs/office/05-implementation-spec.md` using the Write tool.**
```
With:
```
**Write the spec to the path specified in your orchestrator instructions (e.g., `docs/office/specs/phase-{id}.md`).**
```

4. Remove the "Spec Writing Strategy" section entirely — each spec TL only handles one phase, so token limits are much less of a concern.

- [ ] **Step 2: Verify the markdown renders correctly**

Read the file and confirm no broken formatting.

- [ ] **Step 3: Commit**

```bash
git add agents/team-lead.md
git commit -m "feat: update team-lead agent for coordinator/spec-writer modes"
```

---

## Phase 7: Wire getSettings into Warroom Callers

### Task 9: Update phase-handlers.ts to pass getSettings and add maxParallelTLs default

**Files:**
- Modify: `electron/ipc/phase-handlers.ts:149-177` (handleStartWarroom → runWarroom config)
- Modify: `electron/ipc/phase-handlers.ts:408-413` (GET_SETTINGS handler)

- [ ] **Step 1: Add getSettings to the runWarroom config**

In `electron/ipc/phase-handlers.ts`, in the `handleStartWarroom` function, add `getSettings` to the config object passed to `runWarroom()`. After the `waitForIntro` property (line 176), add:

```typescript
      getSettings: async (): Promise<AppSettings> => {
        return {
          defaultModelPreset: 'default',
          defaultPermissionMode: 'auto-safe',
          maxParallelTLs: 4,
        };
      },
```

The full `runWarroom()` call becomes:

```typescript
    await runWarroom({
      projectDir: currentProjectDir!,
      agentsDir,
      env: authManager.getAuthEnv() || {},
      onEvent: onAgentEvent,
      onWaiting: handleAgentWaiting,
      onSystemMessage,
      onWarTableState: (state: WarTableVisualState) => {
        send(IPC_CHANNELS.WAR_TABLE_STATE, state);
      },
      onWarTableCardAdded: (card: WarTableCard) => {
        send(IPC_CHANNELS.WAR_TABLE_CARD_ADDED, card);
      },
      onWarTableChoreography: (payload: WarTableChoreographyPayload) => {
        send(IPC_CHANNELS.WAR_TABLE_CHOREOGRAPHY, payload);
      },
      onReviewReady: (content: string, artifact: 'plan' | 'tasks') => {
        return new Promise<WarTableReviewResponse>((resolve) => {
          setPendingReview({ resolve });
          const payload: WarTableReviewPayload = { content, artifact };
          send(IPC_CHANNELS.WAR_TABLE_REVIEW_READY, payload);
        });
      },
      waitForIntro: () => {
        return new Promise<void>((resolve) => {
          setPendingIntro({ resolve });
        });
      },
      getSettings: async (): Promise<AppSettings> => ({
        defaultModelPreset: 'default',
        defaultPermissionMode: 'auto-safe',
        maxParallelTLs: 4,
      }),
    });
```

- [ ] **Step 2: Add maxParallelTLs to the GET_SETTINGS handler**

In the same file, update the `GET_SETTINGS` handler (line 408) to include the default:

```typescript
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async (): Promise<AppSettings> => {
    return {
      defaultModelPreset: 'default',
      defaultPermissionMode: 'auto-safe',
      maxParallelTLs: 4,
    };
  });
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 4: Run all existing tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All tests pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/phase-handlers.ts
git commit -m "feat: wire getSettings into warroom config, default maxParallelTLs to 4"
```
