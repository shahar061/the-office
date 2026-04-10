import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { beforeEach, afterEach } from 'vitest';
import { simpleGit } from 'simple-git';
import { parseUnifiedDiff, applyTruncation, computeRequestDiff } from '../../../electron/project/git-diff';

describe('parseUnifiedDiff', () => {
  it('returns empty array for empty input', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });

  it('parses a single modified file with one hunk', () => {
    const text = `diff --git a/src/app.ts b/src/app.ts
index 1234567..abcdefa 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
 const z = 4;
`;
    const files = parseUnifiedDiff(text);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/app.ts');
    expect(files[0].oldPath).toBe(null);
    expect(files[0].status).toBe('modified');
    expect(files[0].hunks.length).toBeGreaterThan(0);
    const adds = files[0].hunks.filter((h) => h.type === 'add');
    const removes = files[0].hunks.filter((h) => h.type === 'remove');
    expect(adds).toHaveLength(1);
    expect(adds[0].content).toBe('const y = 3;');
    expect(removes).toHaveLength(1);
    expect(removes[0].content).toBe('const y = 2;');
  });

  it('parses multiple files', () => {
    const text = `diff --git a/a.ts b/a.ts
index 111..222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old a
+new a
diff --git a/b.ts b/b.ts
index 333..444 100644
--- a/b.ts
+++ b/b.ts
@@ -1 +1 @@
-old b
+new b
`;
    const files = parseUnifiedDiff(text);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('a.ts');
    expect(files[1].path).toBe('b.ts');
  });

  it('parses an added file', () => {
    const text = `diff --git a/new.ts b/new.ts
new file mode 100644
index 0000000..abcdefa
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,2 @@
+line one
+line two
`;
    const files = parseUnifiedDiff(text);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('added');
    expect(files[0].path).toBe('new.ts');
  });

  it('parses a removed file', () => {
    const text = `diff --git a/old.ts b/old.ts
deleted file mode 100644
index abcdefa..0000000
--- a/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-line one
-line two
`;
    const files = parseUnifiedDiff(text);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('removed');
    expect(files[0].path).toBe('old.ts');
  });

  it('parses a renamed file', () => {
    const text = `diff --git a/old/path.ts b/new/path.ts
similarity index 100%
rename from old/path.ts
rename to new/path.ts
`;
    const files = parseUnifiedDiff(text);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('renamed');
    expect(files[0].path).toBe('new/path.ts');
    expect(files[0].oldPath).toBe('old/path.ts');
  });

  it('parses a binary file marker', () => {
    const text = `diff --git a/logo.png b/logo.png
index 1111..2222 100644
Binary files a/logo.png and b/logo.png differ
`;
    const files = parseUnifiedDiff(text);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('binary');
    expect(files[0].hunks).toHaveLength(0);
  });

  it('tracks line numbers across hunks', () => {
    const text = `diff --git a/a.ts b/a.ts
index 111..222 100644
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
 one
-two
+TWO
 three
@@ -10,2 +10,2 @@
-ten
+TEN
 eleven
`;
    const files = parseUnifiedDiff(text);
    const adds = files[0].hunks.filter((h) => h.type === 'add');
    expect(adds[0].newLine).toBe(2);
    expect(adds[1].newLine).toBe(10);
  });

  it('does not crash on malformed input', () => {
    const text = `diff --git a/broken.ts b/broken.ts
this is not a valid diff at all
`;
    const files = parseUnifiedDiff(text);
    expect(files).toHaveLength(1);
    expect(files[0].hunks).toEqual([]);
  });
});

describe('applyTruncation', () => {
  it('leaves files under the cap unchanged', () => {
    const files = [{
      path: 'a.ts',
      oldPath: null,
      status: 'modified' as const,
      insertions: 5,
      deletions: 3,
      hunks: [
        { type: 'add' as const, content: 'x' },
        { type: 'remove' as const, content: 'y' },
      ],
      truncated: false,
    }];
    const result = applyTruncation(files, 100);
    expect(result[0].truncated).toBe(false);
    expect(result[0].hunks.length).toBe(2);
  });

  it('clears hunks and marks truncated for files over the cap', () => {
    const files = [{
      path: 'big.ts',
      oldPath: null,
      status: 'modified' as const,
      insertions: 300,
      deletions: 250,
      hunks: [
        { type: 'add' as const, content: 'x' },
      ],
      truncated: false,
    }];
    const result = applyTruncation(files, 500);
    expect(result[0].truncated).toBe(true);
    expect(result[0].hunks).toEqual([]);
  });

  it('handles a mix of over and under the cap', () => {
    const files = [
      {
        path: 'small.ts',
        oldPath: null,
        status: 'modified' as const,
        insertions: 10,
        deletions: 5,
        hunks: [{ type: 'add' as const, content: 'a' }],
        truncated: false,
      },
      {
        path: 'big.ts',
        oldPath: null,
        status: 'modified' as const,
        insertions: 600,
        deletions: 100,
        hunks: [{ type: 'add' as const, content: 'b' }],
        truncated: false,
      },
    ];
    const result = applyTruncation(files, 500);
    expect(result[0].truncated).toBe(false);
    expect(result[0].hunks.length).toBe(1);
    expect(result[1].truncated).toBe(true);
    expect(result[1].hunks).toEqual([]);
  });
});

describe('computeRequestDiff', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-diff-compute-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function setupRepo(): Promise<ReturnType<typeof simpleGit>> {
    const g = simpleGit(tmpDir);
    await g.init();
    await g.addConfig('user.email', 'test@example.com');
    await g.addConfig('user.name', 'Test');
    await g.raw(['checkout', '-b', 'main']);
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# test\n');
    await g.add('.');
    await g.commit('initial');
    return g;
  }

  it('computes diff for a two-file modification', async () => {
    const g = await setupRepo();
    await g.raw(['checkout', '-b', 'feature']);
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'export const b = 2;\n');
    await g.add('.');
    await g.commit('add two files');

    const result = await computeRequestDiff(g, 'main', 'feature');
    expect(result.totalFilesChanged).toBe(2);
    expect(result.totalInsertions).toBeGreaterThan(0);
    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.path).sort()).toEqual(['a.ts', 'b.ts']);
    expect(result.files[0].status).toBe('added');
  });

  it('detects a rename', async () => {
    const g = await setupRepo();
    fs.writeFileSync(path.join(tmpDir, 'original.ts'), 'export const x = 1;\n');
    await g.add('.');
    await g.commit('add original');

    await g.raw(['checkout', '-b', 'feature']);
    await g.mv('original.ts', 'renamed.ts');
    await g.commit('rename');

    const result = await computeRequestDiff(g, 'main', 'feature');
    const renamed = result.files.find((f) => f.status === 'renamed');
    expect(renamed).toBeTruthy();
    expect(renamed?.path).toBe('renamed.ts');
    expect(renamed?.oldPath).toBe('original.ts');
  });

  it('detects a binary file', async () => {
    const g = await setupRepo();
    await g.raw(['checkout', '-b', 'feature']);
    // Non-text bytes — git will treat as binary
    fs.writeFileSync(path.join(tmpDir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]));
    await g.add('.');
    await g.commit('add binary');

    const result = await computeRequestDiff(g, 'main', 'feature');
    const binary = result.files.find((f) => f.path === 'logo.png');
    expect(binary).toBeTruthy();
    expect(binary?.status).toBe('binary');
    expect(binary?.hunks).toHaveLength(0);
  });

  it('truncates files over 500 changed lines', async () => {
    const g = await setupRepo();
    await g.raw(['checkout', '-b', 'feature']);
    const big = Array.from({ length: 600 }, (_, i) => `line ${i}`).join('\n') + '\n';
    fs.writeFileSync(path.join(tmpDir, 'big.txt'), big);
    await g.add('.');
    await g.commit('add big file');

    const result = await computeRequestDiff(g, 'main', 'feature');
    const bigFile = result.files.find((f) => f.path === 'big.txt');
    expect(bigFile?.truncated).toBe(true);
    expect(bigFile?.hunks).toEqual([]);
  });

  it('returns empty result for identical branches', async () => {
    const g = await setupRepo();
    await g.raw(['checkout', '-b', 'feature']);
    // No changes

    const result = await computeRequestDiff(g, 'main', 'feature');
    expect(result.totalFilesChanged).toBe(0);
    expect(result.files).toHaveLength(0);
  });
});
