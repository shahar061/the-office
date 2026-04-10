import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { simpleGit } from 'simple-git';
import { buildGitEnv, writeRepoIdentity } from '../../../electron/project/git-identity-apply';

describe('buildGitEnv', () => {
  it('returns empty object for null identity', () => {
    expect(buildGitEnv(null)).toEqual({});
  });

  it('returns all four env vars for a valid identity', () => {
    const env = buildGitEnv({
      id: 'x',
      label: 'Work',
      name: 'Jane Doe',
      email: 'jane@acme.com',
    });
    expect(env).toEqual({
      GIT_AUTHOR_NAME: 'Jane Doe',
      GIT_AUTHOR_EMAIL: 'jane@acme.com',
      GIT_COMMITTER_NAME: 'Jane Doe',
      GIT_COMMITTER_EMAIL: 'jane@acme.com',
    });
  });
});

describe('writeRepoIdentity', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-identity-apply-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes user.name and user.email to a real repo', async () => {
    const g = simpleGit(tmpDir);
    await g.init();
    await writeRepoIdentity(g, {
      id: 'x',
      label: 'Work',
      name: 'Jane Doe',
      email: 'jane@acme.com',
    });
    const name = (await g.raw(['config', '--local', '--get', 'user.name'])).trim();
    const email = (await g.raw(['config', '--local', '--get', 'user.email'])).trim();
    expect(name).toBe('Jane Doe');
    expect(email).toBe('jane@acme.com');
  });

  it('is a no-op for null identity', async () => {
    const g = simpleGit(tmpDir);
    await g.init();
    await writeRepoIdentity(g, null);
    // Should not throw; nothing should be set by us
    // Note: user may already have global config, so we don't assert emptiness
  });

  it('swallows errors from non-git directory', async () => {
    const g = simpleGit(tmpDir); // never inited
    await expect(
      writeRepoIdentity(g, {
        id: 'x',
        label: 'Work',
        name: 'Jane',
        email: 'j@x.com',
      }),
    ).resolves.toBeUndefined();
  });

  it('subsequent commit in the repo uses the new author', async () => {
    const g = simpleGit(tmpDir);
    await g.init();
    await g.raw(['checkout', '-b', 'main']);

    const identity = {
      id: 'x',
      label: 'Work',
      name: 'Jane Doe',
      email: 'jane@acme.com',
    };

    await writeRepoIdentity(g, identity);

    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# test\n');
    await g.add('.');

    // Create a new git instance with env vars for the commit
    const env = buildGitEnv(identity);
    const gWithEnv = simpleGit(tmpDir).env(env);
    await gWithEnv.commit('initial');

    const log = await g.log();
    expect(log.latest?.author_name).toBe('Jane Doe');
    expect(log.latest?.author_email).toBe('jane@acme.com');
  });
});
