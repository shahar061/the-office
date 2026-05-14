// tests/orchestrator/interrupt-integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  startPhaseInterruption,
  clearPhaseInterruption,
  abortPhase,
  setCurrentAct,
  saveUserRedirect,
  loadInterruption,
  clearInterruptionFile,
  consumeUserRedirect,
} from '../../electron/orchestrator/interruption';
import { runDependencyGraph } from '../../electron/orchestrator/dependency-graph';

describe('interrupt integration — Imagine phase', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imagine-interrupt-'));
    fs.mkdirSync(path.join(tmpDir, '.the-office'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'docs', 'office'), { recursive: true });
    clearPhaseInterruption();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearPhaseInterruption();
  });

  it('writes interruption.json with the current act on abort', async () => {
    startPhaseInterruption('imagine');
    setCurrentAct('CEO Discovery', 'docs/office/01-vision-brief.md');
    await abortPhase(tmpDir);

    const data = await loadInterruption(tmpDir);
    expect(data?.phase).toBe('imagine');
    expect(data?.actName).toBe('CEO Discovery');
    expect(data?.expectedOutput).toBe('docs/office/01-vision-brief.md');
  });

  it('redirect message is consumed on the next consumeUserRedirect call for the matching act', async () => {
    startPhaseInterruption('imagine');
    setCurrentAct('CEO Discovery', 'docs/office/01-vision-brief.md');
    await abortPhase(tmpDir);

    await saveUserRedirect(tmpDir, 'Make it bolder');
    await loadInterruption(tmpDir);  // populate cache

    expect(consumeUserRedirect('CEO Discovery')).toBe('Make it bolder');
    expect(consumeUserRedirect('CEO Discovery')).toBe(null);  // already consumed
  });

  it('clearInterruptionFile removes both disk file and cached redirect', async () => {
    startPhaseInterruption('imagine');
    setCurrentAct('CEO Discovery', 'docs/office/01-vision-brief.md');
    await abortPhase(tmpDir);
    await saveUserRedirect(tmpDir, 'something');
    await loadInterruption(tmpDir);
    await clearInterruptionFile(tmpDir);

    expect(consumeUserRedirect('CEO Discovery')).toBe(null);
    expect(fs.existsSync(path.join(tmpDir, '.the-office', 'interruption.json'))).toBe(false);
  });
});

describe('interrupt integration — Build phase via runDependencyGraph', () => {
  it('aborts mid-graph, no new tasks start after abort', async () => {
    const ctrl = new AbortController();
    const started: string[] = [];

    const promise = runDependencyGraph({
      tasks: [
        { id: 'a', dependsOn: [] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['a'] },
        { id: 'd', dependsOn: ['b', 'c'] },
      ],
      concurrency: 2,
      run: async (t) => {
        started.push(t.id);
        await new Promise((r) => setTimeout(r, 20));
      },
      signal: ctrl.signal,
    });

    // Let 'a' start, then abort before 'b' and 'c' get scheduled
    await new Promise((r) => setTimeout(r, 5));
    ctrl.abort();
    const result = await promise;

    expect(started).toEqual(['a']);
    expect(result.completed.length).toBeLessThan(4);
  });

  it('a task started before abort completes; result reports it as completed', async () => {
    const ctrl = new AbortController();
    const completed: string[] = [];

    const promise = runDependencyGraph({
      tasks: [
        { id: 'a', dependsOn: [] },
        { id: 'b', dependsOn: ['a'] },
      ],
      concurrency: 1,
      run: async (t) => {
        await new Promise((r) => setTimeout(r, 15));
        completed.push(t.id);
      },
      signal: ctrl.signal,
    });

    // Abort after 'a' likely completed but before 'b' starts
    await new Promise((r) => setTimeout(r, 20));
    ctrl.abort();
    const result = await promise;

    expect(completed).toContain('a');
    expect(result.completed).toContain('a');
    expect(result.completed).not.toContain('b');
  });
});
