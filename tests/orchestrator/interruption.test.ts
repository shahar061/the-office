// tests/orchestrator/interruption.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  startPhaseInterruption,
  clearPhaseInterruption,
  abortPhase,
  setCurrentAct,
  consumeUserRedirect,
  loadInterruption,
  saveUserRedirect,
  clearInterruptionFile,
} from '../../electron/orchestrator/interruption';

describe('interruption module', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interruption-test-'));
    fs.mkdirSync(path.join(tmpDir, '.the-office'), { recursive: true });
    clearPhaseInterruption();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearPhaseInterruption();
  });

  it('startPhaseInterruption returns a non-aborted signal', () => {
    const signal = startPhaseInterruption('imagine');
    expect(signal.aborted).toBe(false);
  });

  it('abortPhase flips the signal to aborted', async () => {
    const signal = startPhaseInterruption('imagine');
    await abortPhase(tmpDir);
    expect(signal.aborted).toBe(true);
  });

  it('abortPhase writes interruption.json with the current act', async () => {
    startPhaseInterruption('imagine');
    setCurrentAct('ceo', 'docs/office/01-vision-brief.md');
    await abortPhase(tmpDir);

    const file = path.join(tmpDir, '.the-office', 'interruption.json');
    expect(fs.existsSync(file)).toBe(true);
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(data.phase).toBe('imagine');
    expect(data.actName).toBe('ceo');
    expect(data.expectedOutput).toBe('docs/office/01-vision-brief.md');
  });

  it('abortPhase is a no-op when no active controller', async () => {
    await expect(abortPhase(tmpDir)).resolves.toBeUndefined();
  });

  it('consumeUserRedirect returns the message once, then null', async () => {
    startPhaseInterruption('imagine');
    setCurrentAct('ceo', null);
    await abortPhase(tmpDir);
    await saveUserRedirect(tmpDir, 'Make it more colorful');
    await loadInterruption(tmpDir);
    expect(consumeUserRedirect('ceo')).toBe('Make it more colorful');
    expect(consumeUserRedirect('ceo')).toBe(null);
  });

  it('consumeUserRedirect returns null for a different act', async () => {
    startPhaseInterruption('imagine');
    setCurrentAct('ceo', null);
    await abortPhase(tmpDir);
    await saveUserRedirect(tmpDir, 'For CEO only');
    await loadInterruption(tmpDir);
    expect(consumeUserRedirect('pm')).toBe(null);
    expect(consumeUserRedirect('ceo')).toBe('For CEO only');
  });

  it('clearInterruptionFile removes the on-disk file', async () => {
    startPhaseInterruption('imagine');
    setCurrentAct('ceo', null);
    await abortPhase(tmpDir);
    await clearInterruptionFile(tmpDir);
    const file = path.join(tmpDir, '.the-office', 'interruption.json');
    expect(fs.existsSync(file)).toBe(false);
  });

  it('loadInterruption returns null when no file exists', async () => {
    const result = await loadInterruption(tmpDir);
    expect(result).toBe(null);
  });
});
