import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { simpleGit } from 'simple-git';
import { GreenfieldGit } from '../../../electron/project/greenfield-git';
import { ProjectManager } from '../../../electron/project/project-manager';
import { SettingsStore } from '../../../electron/project/settings-store';

describe('GreenfieldGit.initializeOnCreation', () => {
  let tmpDir: string;
  let userDataDir: string;
  let projectDir: string;
  let notes: Array<{ level: string; message: string }>;
  let projectManager: ProjectManager;
  let settingsStore: SettingsStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'greenfield-git-init-'));
    userDataDir = path.join(tmpDir, 'userData');
    projectDir = path.join(tmpDir, 'project');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    // Create minimal project state
    fs.mkdirSync(path.join(projectDir, '.the-office'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.the-office', 'config.json'),
      JSON.stringify({
        name: 'test',
        path: projectDir,
        currentPhase: 'idle',
        completedPhases: [],
        interrupted: false,
        introSeen: true,
        buildIntroSeen: false,
        mode: 'greenfield',
      }),
    );
    projectManager = new ProjectManager(userDataDir);
    settingsStore = new SettingsStore(userDataDir, projectManager);
    notes = [];
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeGG(): GreenfieldGit {
    return new GreenfieldGit(
      projectDir,
      projectManager,
      settingsStore,
      (note) => notes.push(note),
    );
  }

  it('sets deferred=true when no identity is configured', async () => {
    const gg = makeGG();
    await gg.initializeOnCreation();

    const state = projectManager.getProjectState(projectDir);
    expect(state.greenfieldGit?.initialized).toBe(false);
    expect(state.greenfieldGit?.deferred).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.git'))).toBe(false);
  });

  it('initializes git with identity, writes .gitignore, creates initial commit', async () => {
    const identity = settingsStore.addIdentity({
      label: 'Test',
      name: 'Tester',
      email: 'tester@example.com',
    });
    settingsStore.setDefaultIdentity(identity.id);

    const gg = makeGG();
    await gg.initializeOnCreation();

    const state = projectManager.getProjectState(projectDir);
    expect(state.greenfieldGit?.initialized).toBe(true);
    expect(state.greenfieldGit?.deferred).toBe(false);
    expect(state.greenfieldGit?.includeOfficeState).toBe(false);
    expect(state.greenfieldGit?.lastIterationN).toBe(0);

    expect(fs.existsSync(path.join(projectDir, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.gitignore'))).toBe(true);

    const gitignoreContent = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
    expect(gitignoreContent).toContain('.the-office/');

    const git = simpleGit(projectDir);
    const log = await git.log();
    expect(log.total).toBe(1);
    expect(log.latest?.message).toContain('Initial commit (The Office)');
    expect(log.latest?.author_name).toBe('Tester');
    expect(log.latest?.author_email).toBe('tester@example.com');
  });

  it('excludes .the-office/ from .gitignore when includeOfficeStateInRepo is true', async () => {
    const identity = settingsStore.addIdentity({
      label: 'Test',
      name: 'Tester',
      email: 'tester@example.com',
    });
    settingsStore.setDefaultIdentity(identity.id);
    settingsStore.update({ gitPreferences: { includeOfficeStateInRepo: true } });

    const gg = makeGG();
    await gg.initializeOnCreation();

    const gitignoreContent = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
    expect(gitignoreContent).not.toContain('.the-office/');

    const state = projectManager.getProjectState(projectDir);
    expect(state.greenfieldGit?.includeOfficeState).toBe(true);
  });

  it('is idempotent — calling twice is safe', async () => {
    const identity = settingsStore.addIdentity({
      label: 'Test',
      name: 'Tester',
      email: 'tester@example.com',
    });
    settingsStore.setDefaultIdentity(identity.id);

    const gg = makeGG();
    await gg.initializeOnCreation();
    await gg.initializeOnCreation(); // second call should be a no-op

    const git = simpleGit(projectDir);
    const log = await git.log();
    expect(log.total).toBe(1);
  });
});
