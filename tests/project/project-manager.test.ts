import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectManager } from '../../electron/project/project-manager';

describe('ProjectManager', () => {
  let tmpDir: string;
  let appDataDir: string;
  let manager: ProjectManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-pm-'));
    appDataDir = path.join(tmpDir, 'appdata');
    fs.mkdirSync(appDataDir, { recursive: true });
    manager = new ProjectManager(appDataDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts with no recent projects', () => {
    expect(manager.getRecentProjects()).toHaveLength(0);
  });

  describe('createProject', () => {
    it('creates the project directory', () => {
      const projectPath = path.join(tmpDir, 'my-project');
      manager.createProject('My Project', projectPath);
      expect(fs.existsSync(projectPath)).toBe(true);
    });

    it('creates .the-office/config.json with initial state', () => {
      const projectPath = path.join(tmpDir, 'my-project');
      manager.createProject('My Project', projectPath);

      const configPath = path.join(projectPath, '.the-office', 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const state = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(state.name).toBe('My Project');
      expect(state.path).toBe(projectPath);
      expect(state.currentPhase).toBe('idle');
      expect(state.completedPhases).toEqual([]);
      expect(state.interrupted).toBe(false);
    });

    it('adds project to recent list', () => {
      const projectPath = path.join(tmpDir, 'my-project');
      manager.createProject('My Project', projectPath);

      const recent = manager.getRecentProjects();
      expect(recent).toHaveLength(1);
      expect(recent[0].name).toBe('My Project');
      expect(recent[0].path).toBe(projectPath);
    });

    it('creates nested directories that do not exist', () => {
      const projectPath = path.join(tmpDir, 'nested', 'deep', 'project');
      manager.createProject('Deep Project', projectPath);
      expect(fs.existsSync(projectPath)).toBe(true);
    });
  });

  describe('openProject', () => {
    it('opens an existing project', () => {
      const projectPath = path.join(tmpDir, 'existing-project');
      manager.createProject('Existing Project', projectPath);

      const manager2 = new ProjectManager(appDataDir);
      expect(() => manager2.openProject(projectPath)).not.toThrow();
    });

    it('rejects a nonexistent directory', () => {
      const projectPath = path.join(tmpDir, 'does-not-exist');
      expect(() => manager.openProject(projectPath)).toThrow();
    });

    it('adds opened project to recent list', () => {
      const projectPath = path.join(tmpDir, 'open-project');
      manager.createProject('Open Project', projectPath);

      const manager2 = new ProjectManager(appDataDir);
      manager2.openProject(projectPath);

      const recent = manager2.getRecentProjects();
      const found = recent.find(p => p.path === projectPath);
      expect(found).toBeDefined();
    });
  });

  describe('getRecentProjects', () => {
    it('returns projects sorted by lastOpened (most recent first)', async () => {
      const pathA = path.join(tmpDir, 'project-a');
      const pathB = path.join(tmpDir, 'project-b');
      const pathC = path.join(tmpDir, 'project-c');

      manager.createProject('Project A', pathA);
      // Small delay to ensure distinct timestamps
      await new Promise(r => setTimeout(r, 5));
      manager.createProject('Project B', pathB);
      await new Promise(r => setTimeout(r, 5));
      manager.createProject('Project C', pathC);

      const recent = manager.getRecentProjects();
      expect(recent).toHaveLength(3);
      expect(recent[0].name).toBe('Project C');
      expect(recent[1].name).toBe('Project B');
      expect(recent[2].name).toBe('Project A');
    });

    it('updates lastOpened when project is reopened', async () => {
      const pathA = path.join(tmpDir, 'project-a');
      const pathB = path.join(tmpDir, 'project-b');

      manager.createProject('Project A', pathA);
      await new Promise(r => setTimeout(r, 5));
      manager.createProject('Project B', pathB);
      await new Promise(r => setTimeout(r, 5));
      // Reopen A — it should now be most recent
      manager.openProject(pathA);

      const recent = manager.getRecentProjects();
      expect(recent[0].path).toBe(pathA);
      expect(recent[1].path).toBe(pathB);
    });
  });

  describe('getProjectState', () => {
    it('reads project state from config.json', () => {
      const projectPath = path.join(tmpDir, 'state-project');
      manager.createProject('State Project', projectPath);

      const state = manager.getProjectState(projectPath);
      expect(state.name).toBe('State Project');
      expect(state.path).toBe(projectPath);
      expect(state.currentPhase).toBe('idle');
      expect(state.completedPhases).toEqual([]);
      expect(state.interrupted).toBe(false);
    });

    it('returns defaults when config.json does not exist', () => {
      const projectPath = path.join(tmpDir, 'no-config-project');
      fs.mkdirSync(projectPath, { recursive: true });

      const state = manager.getProjectState(projectPath);
      expect(state.currentPhase).toBe('idle');
      expect(state.completedPhases).toEqual([]);
      expect(state.interrupted).toBe(false);
    });
  });

  describe('updateProjectState', () => {
    it('merges partial updates into existing state', () => {
      const projectPath = path.join(tmpDir, 'update-project');
      manager.createProject('Update Project', projectPath);

      manager.updateProjectState(projectPath, {
        currentPhase: 'imagine',
        completedPhases: ['idle'],
      });

      const state = manager.getProjectState(projectPath);
      expect(state.currentPhase).toBe('imagine');
      expect(state.completedPhases).toEqual(['idle']);
      expect(state.name).toBe('Update Project');
      expect(state.interrupted).toBe(false);
    });

    it('persists updates so a new instance reads them', () => {
      const projectPath = path.join(tmpDir, 'persist-project');
      manager.createProject('Persist Project', projectPath);

      manager.updateProjectState(projectPath, {
        currentPhase: 'build',
        interrupted: true,
      });

      const manager2 = new ProjectManager(appDataDir);
      const state = manager2.getProjectState(projectPath);
      expect(state.currentPhase).toBe('build');
      expect(state.interrupted).toBe(true);
    });
  });

  describe('persistence across instances', () => {
    it('recent projects persist across manager instances', () => {
      const projectPath = path.join(tmpDir, 'persist-recent');
      manager.createProject('Persist Recent', projectPath);

      const manager2 = new ProjectManager(appDataDir);
      const recent = manager2.getRecentProjects();
      expect(recent).toHaveLength(1);
      expect(recent[0].name).toBe('Persist Recent');
    });
  });
});
