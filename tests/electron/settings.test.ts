import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/mock-user-data'),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

import { loadSettingsFromPath, saveSettingsToPath, slugify, detectTerminals } from '../../electron/settings';
import type { TerminalConfig } from '../../shared/types';

describe('slugify', () => {
  it('converts app names to slugs', () => {
    expect(slugify('iTerm.app')).toBe('iterm');
    expect(slugify('Terminal.app')).toBe('terminal');
    expect(slugify('Warp.app')).toBe('warp');
    expect(slugify('My Custom Terminal.app')).toBe('my-custom-terminal');
  });
});

describe('detectTerminals', () => {
  it('excludes already-configured terminals', () => {
    const current: TerminalConfig[] = [
      { id: 'terminal', name: 'Terminal', path: '/System/Applications/Utilities/Terminal.app', isBuiltIn: true },
    ];
    const found = detectTerminals(current);
    expect(found.every(t => t.id !== 'terminal')).toBe(true);
    for (const t of found) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.path).toMatch(/^\/Applications\//);
      expect(t.isBuiltIn).toBe(false);
    }
  });
});

describe('settings persistence', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-settings-'));
    settingsPath = path.join(tmpDir, 'settings.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns default settings when file does not exist', () => {
    const data = loadSettingsFromPath(settingsPath);
    expect(data.terminals).toHaveLength(1);
    expect(data.terminals[0].id).toBe('terminal');
    expect(data.terminals[0].name).toBe('Terminal');
    expect(data.terminals[0].isBuiltIn).toBe(true);
    expect(data.defaultTerminalId).toBe('terminal');
  });

  it('reads settings from disk', () => {
    const saved = {
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/System/Applications/Utilities/Terminal.app', isBuiltIn: true },
        { id: 'iterm', name: 'iTerm', path: '/Applications/iTerm.app', isBuiltIn: false },
      ],
      defaultTerminalId: 'iterm',
    };
    fs.writeFileSync(settingsPath, JSON.stringify(saved));
    const data = loadSettingsFromPath(settingsPath);
    expect(data.terminals).toHaveLength(2);
    expect(data.defaultTerminalId).toBe('iterm');
  });

  it('writes settings to disk', () => {
    const settings = {
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/System/Applications/Utilities/Terminal.app', isBuiltIn: true },
      ],
      defaultTerminalId: 'terminal',
    };
    saveSettingsToPath(settingsPath, settings);
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(raw.defaultTerminalId).toBe('terminal');
  });

  it('returns defaults for corrupted JSON', () => {
    fs.writeFileSync(settingsPath, 'not-json!!!');
    const data = loadSettingsFromPath(settingsPath);
    expect(data.terminals).toHaveLength(1);
    expect(data.terminals[0].id).toBe('terminal');
  });
});
