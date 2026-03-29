# Parallel Team Lead Pipeline

## Overview

Replace the single Team Lead agent in the war room phase with a two-stage pipeline: a coordinator TL that writes `tasks.yaml`, followed by parallel spec-writer TL clones that each produce a per-phase TDD implementation spec. This cuts spec-writing time proportionally to the number of phases and prevents any single agent from hitting context window limits.

## Problem

The current war room TL writes two files in one session:
1. `tasks.yaml` — lightweight task manifest
2. `05-implementation-spec.md` — detailed TDD steps with complete code for every task

For projects with many phases and tasks, the spec file becomes massive. A single agent:
- Takes a long time to write everything sequentially
- Risks hitting the context window limit as accumulated output grows
- Quality degrades toward the end as context fills up

## Solution: Two-Stage Pipeline

```
PM writes plan.md → user reviews
            ↓
┌────────────────────────────────────────┐
│  Stage 1: Coordinator TL               │
│  Reads plan.md + imagine context        │
│  Writes tasks.yaml (IDs, descriptions,  │
│  agents, model tiers, deps, criteria)   │
│  Fast. No code blocks.                  │
└──────────────────┬─────────────────────┘
                   ↓
         Parse phases from tasks.yaml
                   ↓
┌──────────┬───────┴────────┬──────────┐
│ Spec TL  │   Spec TL      │  Spec TL │  (up to maxParallelTLs)
│ phase-1  │   phase-2      │  phase-3 │
│ spec     │   spec         │  spec    │
└──────────┴────────────────┴──────────┘
Each writes: docs/office/specs/phase-{id}.md
```

### Concurrency Control

- `maxParallelTLs` setting in `AppSettings`, default: 4
- Phases are chunked into batches of `maxParallelTLs`
- Each batch runs with `Promise.allSettled`
- Next batch starts when current batch completes
- If a spec TL fails, remaining TLs in the batch continue; failure is logged but doesn't block others

### No Extra Review Gate

The user reviews plan.md (as today). There is no review gate between the coordinator TL and the parallel spec TLs. The tasks.yaml is a mechanical decomposition of the already-approved plan.

---

## Agent Definition

Single `agents/team-lead.md` file (already updated with TDD rigor, no-placeholders rules). The orchestrator controls mode via different prompts:

### Coordinator Mode

Prompt instructs the TL to:
- Read plan.md and imagine context
- Write `tasks.yaml` only
- Include `model` field per task (opus/sonnet/haiku based on complexity)
- No code blocks, no TDD steps — just the manifest
- Fast, lightweight output

### Spec-Writer Mode

Prompt instructs the TL to:
- Read plan.md (for architectural context)
- Read its specific phase's tasks from tasks.yaml
- Read imagine context (design docs)
- Write `docs/office/specs/phase-{phaseId}.md` with full TDD red-green-refactor steps
- Use checkbox syntax, complete code, no placeholders
- Run self-review before finishing

### Model Assignment in tasks.yaml

The coordinator TL assigns a model tier per task:

```yaml
tasks:
  - id: "backend-001"
    description: "Create database schema and migrations"
    assigned_agent: "backend_engineer"
    model: "sonnet"
    dependencies: ["setup-001"]
    acceptance_criteria:
      - "Migration runs successfully"
```

Heuristics for model assignment:
- **opus** — complex architectural decisions, intricate state management, novel algorithms
- **sonnet** — standard feature implementation, API endpoints, component wiring
- **haiku** — boilerplate, config files, simple tests, copy-paste-adapt tasks

---

## Choreography & Visual State

### New Choreography Steps

```
tl-reading            Coordinator TL reads plan
tl-writing            Coordinator TL writes tasks.yaml
tl-coordinator-done   Coordinator finished, triggers clone spawn
tl-clone-spawned      A spec TL clone appears (emitted per clone)
tl-clone-writing      A spec TL clone is writing (emitted per clone)
tl-clone-done         A spec TL clone finished (emitted per clone)
tl-done               All clones finished, final state
```

### Payload Changes

```typescript
interface WarTableChoreographyPayload {
  step: 'intro-walk' | 'pm-reading' | 'pm-writing' | 'pm-done'
      | 'tl-reading' | 'tl-writing' | 'tl-coordinator-done'
      | 'tl-clone-spawned' | 'tl-clone-writing' | 'tl-clone-done'
      | 'tl-done';
  cloneId?: string;     // e.g. "tl-setup", "tl-backend"
  phaseId?: string;     // which phase this clone works on
  totalClones?: number; // emitted with tl-coordinator-done
}
```

### Visual Sequence

1. TL walks to board, reads plan (`tl-reading`)
2. TL writes tasks.yaml at desk (`tl-writing`)
3. TL finishes manifest (`tl-coordinator-done`, totalClones: N)
4. N TL clones appear and walk to separate desks (`tl-clone-spawned` per clone)
5. Clones write in parallel (`tl-clone-writing` as they start)
6. Clones finish one by one (`tl-clone-done` per clone)
7. All done (`tl-done`)

War table task cards are emitted progressively as each spec TL finishes — when a spec TL for phase "backend" completes, its tasks appear on the war table immediately.

---

## Build Phase Changes

### Spec File Routing

Each build phase agent gets pointed to its specific spec:

```typescript
`Read docs/office/specs/phase-${phase.id}.md for detailed TDD implementation steps.`
```

### Model Routing

The `BuildPhase` task interface gets a `model` field. The build agent for a phase uses the model specified on its tasks.

Parse model from tasks.yaml:
```typescript
tasks: (p.tasks || []).map((t: any) => ({
  id: t.id,
  description: t.description,
  assignedAgent: t.assigned_agent,
  model: t.model || 'sonnet',  // default to sonnet
})),
```

Pass through the chain: `runBuild` → `runPhaseSession` → `runAgentSession` → `SDKBridge.runSession` → SDK `query()` options.

---

## Artifact Store Changes

### New Directory Structure

```
docs/office/
  plan.md
  tasks.yaml
  specs/
    phase-setup.md
    phase-backend.md
    phase-frontend.md
```

### New Methods

- `ensureSpecsDir()` — creates `docs/office/specs/` if it doesn't exist
- `getSpecForPhase(phaseId: string): string | null` — reads `docs/office/specs/phase-{phaseId}.md`

### Cleanup

- `clearFrom('warroom')` — also deletes the `docs/office/specs/` directory
- Remove `05-implementation-spec.md` from the flow (replaced by per-phase specs)

### Gate Checks

- `hasWarroomArtifacts()` keeps checking just `tasks.yaml` — specs are per-phase, not a gate

---

## Settings Changes

Add `maxParallelTLs` to `AppSettings`:

```typescript
interface AppSettings {
  defaultModelPreset: BuildConfig['modelPreset'];
  defaultPermissionMode: BuildConfig['permissionMode'];
  maxParallelTLs: number;  // default: 4
  windowBounds?: { ... };
}
```

The warroom orchestrator reads this setting before entering stage 2.

---

## Files Changed

| File | Change |
|------|--------|
| `electron/orchestrator/warroom.ts` | Two-stage TL pipeline: coordinator → parallel spec TLs with batched concurrency |
| `electron/orchestrator/build.ts` | Point each phase at `specs/phase-{id}.md`, parse & pass model from tasks.yaml |
| `electron/orchestrator/run-agent-session.ts` | Add optional `model` field to config, pass through to SDK |
| `electron/sdk/sdk-bridge.ts` | Pass `model` to SDK `query()` options |
| `electron/project/artifact-store.ts` | Add `getSpecForPhase()`, `ensureSpecsDir()`, clear specs on warroom reset |
| `shared/types.ts` | Extend `WarTableChoreographyPayload` with clone fields, add `maxParallelTLs` to `AppSettings` |
| `agents/team-lead.md` | Remove `05-implementation-spec.md` references, spec-writer mode now targets per-phase files |
