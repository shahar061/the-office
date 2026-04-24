import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { writeSessionYaml } from '../../dev-jump/engine/session-yaml-writer';

describe('writeSessionYaml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-jump-session-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes session.yaml for imagine target', () => {
    writeSessionYaml(tmpDir, { currentPhase: 'imagine', completedPhases: [] });

    const content = fs.readFileSync(path.join(tmpDir, 'docs/office/session.yaml'), 'utf-8');
    expect(content).toContain('current_phase: "imagine"');
    expect(content).toContain('completed_phases: []');
  });

  it('writes session.yaml for warroom target (imagine completed)', () => {
    writeSessionYaml(tmpDir, { currentPhase: 'warroom', completedPhases: ['imagine'] });

    const content = fs.readFileSync(path.join(tmpDir, 'docs/office/session.yaml'), 'utf-8');
    expect(content).toContain('current_phase: "warroom"');
    expect(content).toContain('completed_phases: ["imagine"]');
  });

  it('writes session.yaml for build target', () => {
    writeSessionYaml(tmpDir, { currentPhase: 'build', completedPhases: ['imagine', 'warroom'] });

    const content = fs.readFileSync(path.join(tmpDir, 'docs/office/session.yaml'), 'utf-8');
    expect(content).toContain('current_phase: "build"');
    expect(content).toContain('completed_phases: ["imagine", "warroom"]');
  });

  it('creates the docs/office directory if missing', () => {
    writeSessionYaml(tmpDir, { currentPhase: 'imagine', completedPhases: [] });
    expect(fs.existsSync(path.join(tmpDir, 'docs/office/session.yaml'))).toBe(true);
  });
});
