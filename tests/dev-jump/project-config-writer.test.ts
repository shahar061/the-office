import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { writeProjectConfig } from '../../dev-jump/engine/project-config-writer';

describe('writeProjectConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-jump-config-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes config.json with the given phase state', () => {
    writeProjectConfig(tmpDir, 'office-dev-project', {
      currentPhase: 'imagine',
      completedPhases: [],
    });

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.the-office/config.json'), 'utf-8'),
    );
    expect(content).toMatchObject({
      name: 'office-dev-project',
      path: tmpDir,
      currentPhase: 'imagine',
      completedPhases: [],
      interrupted: false,
      introSeen: true,
      buildIntroSeen: true,
      mode: 'greenfield',
    });
  });

  it('creates the .the-office directory if missing', () => {
    writeProjectConfig(tmpDir, 'test', { currentPhase: 'warroom', completedPhases: ['imagine'] });
    expect(fs.existsSync(path.join(tmpDir, '.the-office/config.json'))).toBe(true);
  });
});
