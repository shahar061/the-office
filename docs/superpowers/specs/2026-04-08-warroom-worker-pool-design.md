# Warroom Worker Pool & Leaner Prompts

## Problem

The warroom spec-writer phase uses chunked batching (`chunk()` + `Promise.allSettled()`), which forces the entire batch to complete before the next starts. With 5 phases and batch size 4, phase 5 runs alone after waiting for all of batch 1. In the nuni session, this straggler (TL #5) ran for 23 minutes solo, wasted time on redundant file reads, and ultimately crashed hitting the 32K output token limit.

Additionally, each spec writer receives ~70 KB of prompt context (all imagine artifacts + full plan), most of which is irrelevant to their specific phase. Agents compensate by further reading files from disk — including files already in their prompt.

## Solution

Two changes:

1. **Worker pool** — replace chunk-based batching with a concurrent pool that keeps all slots busy. When a slot frees up, the next phase starts immediately.
2. **Leaner prompts** — reduce prompt context from ~70 KB to ~19 KB by giving each spec writer only what it needs, plus an explicit directive not to explore the filesystem.

## Design

### Part 1: Worker Pool (`electron/orchestrator/worker-pool.ts`)

New generic utility:

```typescript
export interface PoolCallbacks<T> {
  onStart?: (item: T, index: number) => void;
  onDone?: (item: T, index: number) => void;
}

export async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
  callbacks?: PoolCallbacks<T>,
): Promise<PromiseSettledResult<void>[]>
```

**Behavior:**
- Maintains up to `concurrency` active promises at any time
- When any promise settles (resolve or reject), immediately pulls the next item
- Calls `callbacks.onStart` when an item enters the pool, `callbacks.onDone` when it exits
- Returns `PromiseSettledResult<void>[]` in original item order (same contract as `Promise.allSettled`)

**Implementation approach:** Semaphore pattern — maintain a counter of active slots. Each item awaits a slot, runs, then releases. Use a simple resolve-queue for slot waiters.

**This file is generic** — no warroom-specific logic. It can be reused by the build phase later.

### Part 2: Leaner Prompts

#### 2a: New `ArtifactStore.getSystemDesign()` method

```typescript
getSystemDesign(): string
```

Reads and returns only `04-system-design.md` content. This is the architecture contract that all phases implement against — types, tech stack, component boundaries. Throws if the file does not exist (same behavior as `readArtifact()`).

Added to `electron/project/artifact-store.ts`. Implementation is simply `return this.readArtifact('04-system-design.md')`.

#### 2b: Phase summary builder

Local function in `warroom.ts`:

```typescript
function buildPhaseSummary(phases: ParsedPhase[]): string
```

Returns a markdown table showing all phases with their ordering and dependencies:

```
| # | Phase | Depends On |
|---|-------|------------|
| 1 | foundation | — |
| 2 | canvas | foundation |
| 3 | ai-generation | foundation |
| 4 | export-sharing | canvas |
| 5 | polish | ai-generation, export-sharing |
```

This gives each spec writer enough context to understand where their phase fits in the dependency graph without reading the full 22 KB plan.

#### 2c: Updated spec writer prompt

**Current prompt** (~70 KB):
- Full imagine context: vision-brief + PRD + market-analysis + system-design (~47 KB)
- Full plan.md (~22 KB)
- Phase tasks (~1 KB)

**New prompt** (~19 KB):
- System design only (~17 KB)
- Phase summary table (~0.5 KB)
- Phase tasks (~1 KB)
- Anti-exploration directive (~0.2 KB)

The anti-exploration directive:

> "IMPORTANT: All context you need is provided below. Do NOT read files from disk, do NOT explore the project directory, do NOT run find/ls/cat commands. Write the spec directly based on the provided context."

### Part 3: Warroom Integration

#### 3a: ParsedPhase gains `dependsOn`

The `ParsedPhase` interface adds:

```typescript
interface ParsedPhase {
  id: string;
  name: string;
  dependsOn: string[];  // NEW — parsed from tasks.yaml depends_on field
  tasks: { id: string; description: string; assigned_agent: string; model: string }[];
}
```

The parsing block at line 147 adds: `dependsOn: p.depends_on || []`.

This field is already present in tasks.yaml (used by the build phase) but was not being parsed in the warroom. Now it feeds into both the phase summary table and future build-phase pool integration.

#### 3b: Act 4 rewrite

Replace the current `chunk()` + `Promise.allSettled()` block (lines 168-249 of `warroom.ts`) with:

```typescript
artifactStore.ensureSpecsDir();
const settings = await getSettings();
const maxConcurrency = settings.maxParallelTLs || 4;

const systemDesign = artifactStore.getSystemDesign();
const phaseSummary = buildPhaseSummary(phases);

const results = await runPool(
  phases,
  maxConcurrency,
  async (phase, index) => {
    const cloneNumber = index + 1;
    onWarTableChoreography({ step: 'tl-clone-writing', cloneId: `tl-${phase.id}`, phaseId: phase.id });

    const phaseTaskList = phase.tasks
      .map(t => `- ${t.id}: ${t.description} (agent: ${t.assigned_agent}, model: ${t.model})`)
      .join('\n');

    await runAgentSession({
      agentName: 'team-lead',
      agentLabel: `Team Lead #${cloneNumber}`,
      agentsDir,
      prompt: [
        `You are a spec-writer Team Lead. Write the TDD implementation spec for phase "${phase.name}" (${phase.id}).`,
        '',
        `Write the spec to docs/office/specs/phase-${phase.id}.md`,
        '',
        'IMPORTANT: All context you need is provided below. Do NOT read files from disk,',
        'do NOT explore the project directory, do NOT run find/ls/cat commands.',
        'Write the spec directly based on the provided context.',
        '',
        'Follow strict TDD (red-green-refactor) for every task. Each step must have:',
        '- Checkbox syntax (- [ ]) for tracking',
        '- Complete code — no placeholders',
        '- Exact file paths and test commands',
        '- Bite-sized steps (2-5 minutes each)',
        '',
        '## Phase Tasks',
        phaseTaskList,
        '',
        '## All Phases (dependency order)',
        phaseSummary,
        '',
        '## System Design',
        systemDesign,
      ].join('\n'),
      cwd: projectDir,
      env,
      excludeAskUser: true,
      expectedOutput: `docs/office/specs/phase-${phase.id}.md`,
      onEvent,
      onWaiting,
    });

    onWarTableChoreography({ step: 'tl-clone-done', cloneId: `tl-${phase.id}`, phaseId: phase.id });

    // Emit task cards
    const milestoneId = milestoneEntries.find(m =>
      m.title.toLowerCase().includes(phase.name.toLowerCase())
    )?.id || `m${index + 1}`;

    for (const t of phase.tasks) {
      onWarTableCardAdded({ id: t.id, type: 'task', title: t.description, parentId: milestoneId });
      await delay(250);
    }
  },
  {
    onStart: (phase) => {
      onWarTableChoreography({ step: 'tl-clone-spawned', cloneId: `tl-${phase.id}`, phaseId: phase.id });
    },
  },
);

// Log failures
for (let i = 0; i < results.length; i++) {
  if (results[i].status === 'rejected') {
    const phase = phases[i];
    const reason = (results[i] as PromiseRejectedResult).reason;
    const errMsg = reason instanceof Error ? reason.message : String(reason);
    console.error(`[Warroom] Spec writer failed for phase ${phase.id}:`, reason);
    onSystemMessage(`Error: spec writer for phase "${phase.name}" failed — ${errMsg}`);
  }
}
```

**Choreography events remain the same** (`tl-clone-spawned`, `tl-clone-writing`, `tl-clone-done`). The only behavioral difference: they now fire per-agent as pool slots open/close, rather than in batch bursts. The renderer already handles these events individually.

#### 3c: Remove `chunk()` helper

The `chunk()` function at the top of `warroom.ts` is no longer needed and can be deleted.

### Part 4: Tests

#### `tests/orchestrator/worker-pool.test.ts` (new)

| Test | Description |
|------|-------------|
| respects concurrency limit | 6 items, pool size 3 → verify max 3 run simultaneously using a counter |
| backfills immediately | fast item finishes → next starts without waiting for batch |
| error isolation | one item rejects → others continue, result array captures rejection |
| preserves result order | results array matches original item order regardless of completion order |
| callbacks fire correctly | `onStart` fires when item enters pool, `onDone` when it exits |
| pool size > item count | 2 items, pool size 5 → both run immediately, no errors |
| single item | 1 item, pool size 3 → runs and completes normally |
| empty array | 0 items → returns empty array immediately |

#### `tests/project/artifact-store.test.ts` (update)

Add test for `getSystemDesign()`:
- Returns `04-system-design.md` content when file exists
- Throws when file does not exist

#### Warroom prompt verification

No dedicated warroom test file exists today. Prompt structure is verified implicitly through the worker pool tests and manual testing. If a warroom test file is added in the future, it should verify:
- Prompt contains system design content
- Prompt does NOT contain vision-brief, PRD, or market-analysis content
- Prompt contains anti-exploration directive
- Prompt contains phase summary table with dependency info

## Files Changed

| File | Change |
|------|--------|
| `electron/orchestrator/worker-pool.ts` | **New** — generic concurrent pool utility (~30 lines) |
| `electron/orchestrator/warroom.ts` | Replace Act 4 chunk batching with pool, update prompt assembly, add `buildPhaseSummary()`, add `dependsOn` to `ParsedPhase`, remove `chunk()` |
| `electron/project/artifact-store.ts` | Add `getSystemDesign()` method |
| `tests/orchestrator/worker-pool.test.ts` | **New** — pool unit tests |
| `tests/project/artifact-store.test.ts` | Add `getSystemDesign()` test |

## What This Does NOT Change

- **Build phase scheduling** — remains DAG-based `Promise.allSettled()` in `build.ts`. Can adopt the pool later.
- **Imagine phase** — remains sequential (CEO → PM → Researcher → Architect). No change needed.
- **Acts 1-3 of warroom** — PM planning, review gate, and coordinator TL are unchanged.
- **Choreography event types** — no new event types. Existing `tl-clone-spawned`/`tl-clone-done` are sufficient.
- **Settings** — `maxParallelTLs` remains the concurrency control. No new settings.
