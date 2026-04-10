import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectManager } from '../../../electron/project/project-manager';

describe('ProjectManager scanStatus', () => {
  let tmpDir: string;
  let projectDir: string;
  let pm: ProjectManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-scan-test-'));
    projectDir = path.join(tmpDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    pm = new ProjectManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns undefined scanStatus for a newly created project', () => {
    pm.createProject('Test', projectDir);
    const state = pm.getProjectState(projectDir);
    expect(state.scanStatus).toBeUndefined();
  });

  it('persists scanStatus across updates', () => {
    pm.createProject('Test', projectDir);
    pm.updateProjectState(projectDir, { scanStatus: 'pending' });
    const state = pm.getProjectState(projectDir);
    expect(state.scanStatus).toBe('pending');
  });

  it('supports all four scanStatus values', () => {
    pm.createProject('Test', projectDir);
    const statuses: Array<'pending' | 'in_progress' | 'done' | 'skipped'> = [
      'pending', 'in_progress', 'done', 'skipped',
    ];
    for (const s of statuses) {
      pm.updateProjectState(projectDir, { scanStatus: s });
      expect(pm.getProjectState(projectDir).scanStatus).toBe(s);
    }
  });

  it('preserves other fields when updating scanStatus', () => {
    pm.createProject('Test', projectDir);
    pm.updateProjectState(projectDir, { mode: 'workshop' });
    pm.updateProjectState(projectDir, { scanStatus: 'done' });
    const state = pm.getProjectState(projectDir);
    expect(state.mode).toBe('workshop');
    expect(state.scanStatus).toBe('done');
  });

  it('addToRecentProjects is publicly callable', () => {
    pm.addToRecentProjects('External', projectDir, null);
    const recents = pm.getRecentProjects();
    expect(recents.some(r => r.name === 'External')).toBe(true);
  });
});
