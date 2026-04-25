import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { writeModeFlag, readModeFlag, applyModeFlagToEnv } from '../../dev-jump/mock/mode-flag';

describe('mode-flag', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-jump-flag-'));
    delete process.env.OFFICE_MOCK_AGENTS;
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    delete process.env.OFFICE_MOCK_AGENTS;
  });

  it('defaults to real when no flag file present', () => {
    expect(readModeFlag(projectDir)).toBe('real');
  });

  it('writes and reads mock flag', () => {
    writeModeFlag(projectDir, 'mock');
    expect(readModeFlag(projectDir)).toBe('mock');
    expect(fs.existsSync(path.join(projectDir, '.the-office/mock-mode.flag'))).toBe(true);
  });

  it('writing real mode removes the flag', () => {
    writeModeFlag(projectDir, 'mock');
    writeModeFlag(projectDir, 'real');
    expect(fs.existsSync(path.join(projectDir, '.the-office/mock-mode.flag'))).toBe(false);
  });

  it('applyModeFlagToEnv sets OFFICE_MOCK_AGENTS to "1" for mock', () => {
    writeModeFlag(projectDir, 'mock');
    applyModeFlagToEnv(projectDir);
    expect(process.env.OFFICE_MOCK_AGENTS).toBe('1');
  });

  it('applyModeFlagToEnv sets OFFICE_MOCK_AGENTS to "0" for real', () => {
    applyModeFlagToEnv(projectDir);
    expect(process.env.OFFICE_MOCK_AGENTS).toBe('0');
  });
});
