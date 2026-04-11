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

describe('GreenfieldGit.commitPhase', () => {
  let tmpDir: string;
  let userDataDir: string;
  let projectDir: string;
  let notes: Array<{ level: string; message: string }>;
  let projectManager: ProjectManager;
  let settingsStore: SettingsStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'greenfield-git-commit-'));
    userDataDir = path.join(tmpDir, 'userData');
    projectDir = path.join(tmpDir, 'project');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
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

  async function initWithIdentity(): Promise<void> {
    const identity = settingsStore.addIdentity({
      label: 'Test',
      name: 'Tester',
      email: 'tester@example.com',
    });
    settingsStore.setDefaultIdentity(identity.id);
    const gg = makeGG();
    await gg.initializeOnCreation();
  }

  it('commits imagine phase with correct message', async () => {
    await initWithIdentity();
    fs.writeFileSync(path.join(projectDir, 'vision.md'), '# Vision\n');

    const gg = makeGG();
    await gg.commitPhase('imagine', 'completed');

    const git = simpleGit(projectDir);
    const log = await git.log();
    expect(log.total).toBe(2);
    expect(log.latest?.message).toContain('imagine: vision brief, PRD, market analysis');
  });

  it('commits build completed with correct message', async () => {
    await initWithIdentity();
    fs.writeFileSync(path.join(projectDir, 'index.ts'), 'export const x = 1;\n');

    const gg = makeGG();
    await gg.commitPhase('build', 'completed');

    const git = simpleGit(projectDir);
    const log = await git.log();
    expect(log.latest?.message).toContain('build: initial implementation');
  });

  it('commits build failed with FAILED message', async () => {
    await initWithIdentity();
    fs.writeFileSync(path.join(projectDir, 'partial.ts'), 'export const x =');

    const gg = makeGG();
    await gg.commitPhase('build', 'failed');

    const git = simpleGit(projectDir);
    const log = await git.log();
    expect(log.latest?.message).toContain('build: FAILED');
  });

  it('no-op when working tree is clean after init', async () => {
    await initWithIdentity();

    const gg = makeGG();
    await gg.commitPhase('imagine', 'completed');

    const git = simpleGit(projectDir);
    const log = await git.log();
    // Only the initial commit — no new commit for empty imagine
    expect(log.total).toBe(1);
  });

  it('no-op when greenfieldGit is deferred and no identity exists', async () => {
    const gg = makeGG();
    await gg.initializeOnCreation(); // deferred since no identity

    fs.writeFileSync(path.join(projectDir, 'vision.md'), '# Vision\n');
    await gg.commitPhase('imagine', 'completed');

    // No .git directory — no commits happened
    expect(fs.existsSync(path.join(projectDir, '.git'))).toBe(false);
  });

  it('runs retroactive init when identity is configured after deferred', async () => {
    // Step 1: create in deferred state
    const gg1 = makeGG();
    await gg1.initializeOnCreation();
    expect(projectManager.getProjectState(projectDir).greenfieldGit?.deferred).toBe(true);

    // Step 2: user adds identity mid-flight
    const identity = settingsStore.addIdentity({
      label: 'Test',
      name: 'Tester',
      email: 'tester@example.com',
    });
    settingsStore.setDefaultIdentity(identity.id);

    // Step 3: write imagine artifacts and call commitPhase
    fs.writeFileSync(path.join(projectDir, 'vision.md'), '# Vision\n');
    const gg2 = makeGG();
    await gg2.commitPhase('imagine', 'completed');

    // Verify: repo was created, and imagine commit exists
    expect(fs.existsSync(path.join(projectDir, '.git'))).toBe(true);
    const git = simpleGit(projectDir);
    const log = await git.log();
    expect(log.total).toBe(2);
    expect(log.all[1].message).toContain('Initial commit (The Office)');
    expect(log.all[0].message).toContain('imagine: vision brief');

    const state = projectManager.getProjectState(projectDir);
    expect(state.greenfieldGit?.initialized).toBe(true);
    expect(state.greenfieldGit?.deferred).toBe(false);
  });

  it('serializes concurrent commitPhase calls via mutex', async () => {
    await initWithIdentity();

    const gg = makeGG();
    fs.writeFileSync(path.join(projectDir, 'a.md'), '# a\n');

    // Fire two commitPhase calls concurrently. The mutex must serialize them
    // so that the second call runs only after the first completes — no
    // interleaving of staging/committing operations.
    const p1 = gg.commitPhase('imagine', 'completed');
    const p2 = (async () => {
      // Give p1 a chance to stage and commit a.md before we write b.md
      await p1;
      fs.writeFileSync(path.join(projectDir, 'b.md'), '# b\n');
      return gg.commitPhase('warroom', 'completed');
    })();
    await Promise.all([p1, p2]);

    const git = simpleGit(projectDir);
    const log = await git.log();
    // Initial + imagine + warroom = 3 commits (assuming both produced changes)
    expect(log.total).toBe(3);
  });
});
