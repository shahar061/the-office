# Warroom Worker Pool & Leaner Prompts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the warroom's chunked batch execution with a concurrent worker pool, and slim down spec-writer prompts to eliminate unnecessary file reads and reduce generation time.

**Architecture:** A generic `runPool()` utility handles concurrency (semaphore pattern). Warroom Act 4 uses it instead of `chunk()` + `Promise.allSettled()`. Spec-writer prompts are trimmed from ~70 KB to ~19 KB by injecting only the system design, phase tasks, and a dependency summary table.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Create the worker pool utility

**Files:**
- Create: `electron/orchestrator/worker-pool.ts`

- [ ] **Step 1: Create the file with types and function signature**

```typescript
// electron/orchestrator/worker-pool.ts

export interface PoolCallbacks<T> {
  onStart?: (item: T, index: number) => void;
  onDone?: (item: T, index: number) => void;
}

export async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
  callbacks?: PoolCallbacks<T>,
): Promise<PromiseSettledResult<void>[]> {
  if (items.length === 0) return [];

  const results: PromiseSettledResult<void>[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      const item = items[i];
      callbacks?.onStart?.(item, i);
      try {
        await fn(item, i);
        results[i] = { status: 'fulfilled', value: undefined };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
      callbacks?.onDone?.(item, i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runNext(),
  );
  await Promise.all(workers);

  return results;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit electron/orchestrator/worker-pool.ts 2>&1 || echo "check errors above"`

Expected: No errors (or only unrelated errors from other files). If tsc doesn't work standalone, run: `npx vitest run --passWithNoTests`

- [ ] **Step 3: Commit**

```bash
git add electron/orchestrator/worker-pool.ts
git commit -m "feat: add generic worker pool utility for concurrent task execution"
```

---

### Task 2: Write worker pool tests

**Files:**
- Create: `tests/orchestrator/worker-pool.test.ts`

- [ ] **Step 1: Write all worker pool tests**

```typescript
// tests/orchestrator/worker-pool.test.ts
import { describe, it, expect } from 'vitest';
import { runPool } from '../../electron/orchestrator/worker-pool';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('runPool', () => {
  it('respects concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;

    const results = await runPool(
      [1, 2, 3, 4, 5, 6],
      3,
      async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(20);
        active--;
      },
    );

    expect(maxActive).toBe(3);
    expect(results).toHaveLength(6);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('backfills immediately when a slot opens', async () => {
    const startTimes: number[] = [];

    await runPool(
      [10, 10, 10, 50, 50],
      3,
      async (duration, index) => {
        startTimes[index] = Date.now();
        await delay(duration);
      },
    );

    // Items 3 and 4 should start roughly when items 0-2 finish (~10ms),
    // not after the entire first batch finishes (~50ms)
    const item3Wait = startTimes[3] - startTimes[0];
    expect(item3Wait).toBeLessThan(40);
  });

  it('isolates errors — one failure does not block others', async () => {
    const results = await runPool(
      ['ok', 'fail', 'ok'],
      2,
      async (item) => {
        if (item === 'fail') throw new Error('boom');
      },
    );

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect((results[1] as PromiseRejectedResult).reason.message).toBe('boom');
    expect(results[2].status).toBe('fulfilled');
  });

  it('preserves result order regardless of completion order', async () => {
    const completionOrder: number[] = [];

    const results = await runPool(
      [30, 10, 20],
      3,
      async (duration, index) => {
        await delay(duration);
        completionOrder.push(index);
      },
    );

    // Items complete in order 1, 2, 0 but results array is in original order
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(completionOrder[0]).toBe(1); // fastest finishes first
  });

  it('fires onStart and onDone callbacks', async () => {
    const started: number[] = [];
    const done: number[] = [];

    await runPool(
      ['a', 'b', 'c'],
      2,
      async () => { await delay(5); },
      {
        onStart: (_, i) => started.push(i),
        onDone: (_, i) => done.push(i),
      },
    );

    expect(started).toContain(0);
    expect(started).toContain(1);
    expect(started).toContain(2);
    expect(done).toContain(0);
    expect(done).toContain(1);
    expect(done).toContain(2);
  });

  it('handles pool size larger than item count', async () => {
    const results = await runPool(
      ['a', 'b'],
      10,
      async () => {},
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('handles single item', async () => {
    const results = await runPool(
      ['only'],
      3,
      async () => {},
    );

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('fulfilled');
  });

  it('returns empty array for empty input', async () => {
    const results = await runPool([], 3, async () => {});
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/orchestrator/worker-pool.test.ts`

Expected: All 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/orchestrator/worker-pool.test.ts
git commit -m "test: add worker pool unit tests"
```

---

### Task 3: Add `getSystemDesign()` to ArtifactStore

**Files:**
- Modify: `electron/project/artifact-store.ts`
- Modify: `tests/project/artifact-store.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/project/artifact-store.test.ts`, inside the top-level `describe('ArtifactStore')` block, after the `readArtifact()` describe block:

```typescript
  describe('getSystemDesign()', () => {
    it('returns system design content when file exists', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.writeFileSync(path.join(officeDir, '04-system-design.md'), '# System Design\nArchitecture details here.');
      expect(store.getSystemDesign()).toBe('# System Design\nArchitecture details here.');
    });

    it('throws when system design file does not exist', () => {
      setupOfficeDir(tmpDir);
      expect(() => store.getSystemDesign()).toThrow('Artifact not found');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/project/artifact-store.test.ts`

Expected: FAIL — `store.getSystemDesign is not a function`

- [ ] **Step 3: Implement `getSystemDesign()`**

Add to `electron/project/artifact-store.ts`, after the `getImagineContext()` method (after line 40):

```typescript
  getSystemDesign(): string {
    return this.readArtifact('04-system-design.md');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/project/artifact-store.test.ts`

Expected: All tests pass, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add electron/project/artifact-store.ts tests/project/artifact-store.test.ts
git commit -m "feat: add getSystemDesign() to ArtifactStore"
```

---

### Task 4: Add `dependsOn` to ParsedPhase and build phase summary

**Files:**
- Modify: `electron/orchestrator/warroom.ts`

- [ ] **Step 1: Update `ParsedPhase` interface to include `dependsOn`**

In `electron/orchestrator/warroom.ts`, replace the `ParsedPhase` interface (lines 8-12):

```typescript
interface ParsedPhase {
  id: string;
  name: string;
  dependsOn: string[];
  tasks: { id: string; description: string; assigned_agent: string; model: string }[];
}
```

- [ ] **Step 2: Update the YAML parsing to capture `depends_on`**

In `electron/orchestrator/warroom.ts`, replace the phases mapping (lines 147-156):

```typescript
  const phases: ParsedPhase[] = (parsed.phases || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    dependsOn: p.depends_on || [],
    tasks: (p.tasks || []).map((t: any) => ({
      id: t.id,
      description: t.description,
      assigned_agent: t.assigned_agent || 'backend_engineer',
      model: t.model || 'sonnet',
    })),
  }));
```

- [ ] **Step 3: Add `buildPhaseSummary()` function**

Add before the `delay()` function at the bottom of `electron/orchestrator/warroom.ts`:

```typescript
function buildPhaseSummary(phases: ParsedPhase[]): string {
  const header = '| # | Phase | Depends On |';
  const separator = '|---|-------|------------|';
  const rows = phases.map((p, i) => {
    const deps = p.dependsOn.length > 0 ? p.dependsOn.join(', ') : '—';
    return `| ${i + 1} | ${p.name} (${p.id}) | ${deps} |`;
  });
  return [header, separator, ...rows].join('\n');
}
```

- [ ] **Step 4: Verify compilation**

Run: `npx vitest run --passWithNoTests`

Expected: No TypeScript compilation errors.

- [ ] **Step 5: Commit**

```bash
git add electron/orchestrator/warroom.ts
git commit -m "feat: add dependsOn to ParsedPhase and buildPhaseSummary helper"
```

---

### Task 5: Rewrite Act 4 — pool + leaner prompts

**Files:**
- Modify: `electron/orchestrator/warroom.ts`

This is the main integration task. It replaces the chunk-based batching with the worker pool and updates the spec-writer prompts.

- [ ] **Step 1: Add worker-pool import**

In `electron/orchestrator/warroom.ts`, add to the imports at the top of the file (after the existing imports):

```typescript
import { runPool } from './worker-pool';
```

- [ ] **Step 2: Remove the `chunk()` helper**

Delete the `chunk()` function (lines 14-20 of the current file):

```typescript
// DELETE THIS ENTIRE FUNCTION:
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
```

- [ ] **Step 3: Replace Act 4 block**

Replace everything from the `// ── Act 4` comment (line 168) through the end of the error logging loop (line 249) with:

```typescript
  // ── Act 4: Parallel spec-writer TL clones (worker pool) ──

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

      // Emit task cards for this phase
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

- [ ] **Step 4: Verify the full test suite passes**

Run: `npx vitest run`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/orchestrator/warroom.ts
git commit -m "feat: replace chunk batching with worker pool and leaner spec-writer prompts

- Use runPool() for concurrent spec-writer execution with immediate backfill
- Trim prompt from ~70KB to ~19KB (system design + phase tasks + dependency table)
- Add anti-exploration directive to prevent unnecessary file reads
- Remove chunk() helper, no longer needed"
```

---

### Task 6: Manual verification

This task is not code — it's a smoke test to verify the integration works end-to-end.

- [ ] **Step 1: Run the full test suite one more time**

Run: `npx vitest run`

Expected: All tests pass.

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`

Expected: Clean (or only pre-existing errors unrelated to our changes).

- [ ] **Step 3: Review the final warroom.ts**

Read `electron/orchestrator/warroom.ts` end-to-end and verify:
- No references to `chunk()` remain
- The `runPool` import is present
- The `buildPhaseSummary` function exists
- Act 4 uses `runPool` with `systemDesign` and `phaseSummary` (not `context` or `plan`)
- The anti-exploration directive is in the prompt
- Choreography events use `onStart` callback for `tl-clone-spawned`
