// electron/orchestrator/interruption.ts
import fs from 'fs/promises';
import path from 'path';
import type { Phase } from '../../shared/types';

const INTERRUPTION_FILENAME = path.join('.the-office', 'interruption.json');

export interface PersistedInterruption {
  phase: Phase;
  actName: string;
  expectedOutput: string | null;
  userRedirect: string | null;
  timestamp: number;
}

interface ActiveState {
  phase: Phase;
  controller: AbortController;
  actName: string;
  expectedOutput: string | null;
}

// In-memory state for the currently-running phase. There is at most one
// active phase per project (existing project invariant).
let active: ActiveState | null = null;
// In-memory snapshot of the persisted file's userRedirect, populated by
// loadInterruption() so orchestrators can consume it without re-reading disk.
let cachedRedirect: { actName: string; text: string } | null = null;

export function startPhaseInterruption(phase: Phase): AbortSignal {
  cachedRedirect = null;
  active = {
    phase,
    controller: new AbortController(),
    actName: '',
    expectedOutput: null,
  };
  return active.controller.signal;
}

export function clearPhaseInterruption(): void {
  active = null;
  cachedRedirect = null;
}

export function setCurrentAct(actName: string, expectedOutput: string | null): void {
  if (!active) return;
  active.actName = actName;
  active.expectedOutput = expectedOutput;
}

export async function abortPhase(projectDir: string): Promise<void> {
  if (!active) return;
  const snapshot = active;
  active.controller.abort();

  const persisted: PersistedInterruption = {
    phase: snapshot.phase,
    actName: snapshot.actName,
    expectedOutput: snapshot.expectedOutput,
    userRedirect: null,
    timestamp: Date.now(),
  };
  await writeInterruptionFile(projectDir, persisted);
}

export function consumeUserRedirect(actName: string): string | null {
  if (!cachedRedirect) return null;
  if (cachedRedirect.actName !== actName) return null;
  const text = cachedRedirect.text;
  cachedRedirect = null;
  return text;
}

export async function loadInterruption(projectDir: string): Promise<PersistedInterruption | null> {
  const file = path.join(projectDir, INTERRUPTION_FILENAME);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const data = JSON.parse(raw) as PersistedInterruption;
    cachedRedirect = data.userRedirect
      ? { actName: data.actName, text: data.userRedirect }
      : null;
    return data;
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveUserRedirect(projectDir: string, text: string): Promise<void> {
  const current = await loadInterruption(projectDir);
  if (!current) {
    throw new Error('saveUserRedirect called with no existing interruption.json');
  }
  const updated: PersistedInterruption = { ...current, userRedirect: text };
  await writeInterruptionFile(projectDir, updated);
}

export async function clearInterruptionFile(projectDir: string): Promise<void> {
  const file = path.join(projectDir, INTERRUPTION_FILENAME);
  try {
    await fs.unlink(file);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
  cachedRedirect = null;
}

async function writeInterruptionFile(projectDir: string, data: PersistedInterruption): Promise<void> {
  const file = path.join(projectDir, INTERRUPTION_FILENAME);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}
