import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ArtifactStore } from '../../electron/project/artifact-store';

const OFFICE_SUBDIR = 'docs/office';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-store-test-'));
}

function setupOfficeDir(projectDir: string): string {
  const officeDir = path.join(projectDir, OFFICE_SUBDIR);
  fs.mkdirSync(officeDir, { recursive: true });
  return officeDir;
}

describe('ArtifactStore', () => {
  let tmpDir: string;
  let store: ArtifactStore;

  beforeEach(() => {
    tmpDir = createTempDir();
    store = new ArtifactStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('hasImagineArtifacts()', () => {
    it('returns false when office dir does not exist', () => {
      expect(store.hasImagineArtifacts()).toBe(false);
    });

    it('returns false when only one imagine artifact is present', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.writeFileSync(path.join(officeDir, '01-vision-brief.md'), 'vision content');
      expect(store.hasImagineArtifacts()).toBe(false);
    });

    it('returns false when only the other imagine artifact is present', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.writeFileSync(path.join(officeDir, '04-system-design.md'), 'design content');
      expect(store.hasImagineArtifacts()).toBe(false);
    });

    it('returns true when both imagine artifacts are present', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.writeFileSync(path.join(officeDir, '01-vision-brief.md'), 'vision content');
      fs.writeFileSync(path.join(officeDir, '04-system-design.md'), 'design content');
      expect(store.hasImagineArtifacts()).toBe(true);
    });
  });

  describe('hasWarroomArtifacts()', () => {
    it('returns false when tasks.yaml is missing', () => {
      setupOfficeDir(tmpDir);
      expect(store.hasWarroomArtifacts()).toBe(false);
    });

    it('returns true when tasks.yaml is present', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.writeFileSync(path.join(officeDir, 'tasks.yaml'), 'tasks: []');
      expect(store.hasWarroomArtifacts()).toBe(true);
    });
  });

  describe('getImagineContext()', () => {
    it('returns empty string when no imagine docs exist', () => {
      setupOfficeDir(tmpDir);
      expect(store.getImagineContext()).toBe('');
    });

    it('returns content for present files only', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.writeFileSync(path.join(officeDir, '01-vision-brief.md'), 'This is the vision.');
      fs.writeFileSync(path.join(officeDir, '03-market-analysis.md'), 'Market data here.');

      const context = store.getImagineContext();
      expect(context).toContain('## 01-vision-brief.md');
      expect(context).toContain('This is the vision.');
      expect(context).toContain('## 03-market-analysis.md');
      expect(context).toContain('Market data here.');
      expect(context).not.toContain('02-prd.md');
      expect(context).not.toContain('04-system-design.md');
    });

    it('joins multiple files with separator', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.writeFileSync(path.join(officeDir, '01-vision-brief.md'), 'Vision');
      fs.writeFileSync(path.join(officeDir, '02-prd.md'), 'PRD');

      const context = store.getImagineContext();
      expect(context).toContain('\n\n---\n\n');
    });

    it('reads all four imagine docs when present', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.writeFileSync(path.join(officeDir, '01-vision-brief.md'), 'Vision');
      fs.writeFileSync(path.join(officeDir, '02-prd.md'), 'PRD');
      fs.writeFileSync(path.join(officeDir, '03-market-analysis.md'), 'Market');
      fs.writeFileSync(path.join(officeDir, '04-system-design.md'), 'Design');

      const context = store.getImagineContext();
      expect(context).toContain('## 01-vision-brief.md');
      expect(context).toContain('## 02-prd.md');
      expect(context).toContain('## 03-market-analysis.md');
      expect(context).toContain('## 04-system-design.md');
    });
  });

  describe('getTasksYaml()', () => {
    it('returns null when tasks.yaml does not exist', () => {
      setupOfficeDir(tmpDir);
      expect(store.getTasksYaml()).toBeNull();
    });

    it('returns null when office dir does not exist at all', () => {
      expect(store.getTasksYaml()).toBeNull();
    });

    it('returns file content when tasks.yaml exists', () => {
      const officeDir = setupOfficeDir(tmpDir);
      const yamlContent = 'tasks:\n  - id: 1\n    name: First task\n';
      fs.writeFileSync(path.join(officeDir, 'tasks.yaml'), yamlContent);
      expect(store.getTasksYaml()).toBe(yamlContent);
    });
  });

  describe('officeDir getter', () => {
    it('returns the correct path', () => {
      expect(store.officeDir).toBe(path.join(tmpDir, 'docs/office'));
    });
  });
});
