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

  describe('readArtifact()', () => {
    it('readArtifact returns file contents', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs/office'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'docs/office/01-vision-brief.md'), '# Vision');
      expect(store.readArtifact('01-vision-brief.md')).toBe('# Vision');
    });

    it('readArtifact throws if file does not exist', () => {
      expect(() => store.readArtifact('missing.md')).toThrow('Artifact not found');
    });
  });

  describe('getSystemDesign()', () => {
    it('returns system design content when file exists', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.writeFileSync(path.join(officeDir, '04-system-design.md'), '# System Design\nArchitecture details here.');
      expect(store.getSystemDesign()).toBe('# System Design\nArchitecture details here.');
    });

    it('throws when system design file does not exist', () => {
      setupOfficeDir(tmpDir);
      expect(() => store.getSystemDesign()).toThrow('Artifact not found');
    });
  });

  describe('officeDir getter', () => {
    it('returns the correct path', () => {
      expect(store.officeDir).toBe(path.join(tmpDir, 'docs/office'));
    });
  });

  describe('ensureSpecsDir()', () => {
    it('creates the specs directory when it does not exist', () => {
      setupOfficeDir(tmpDir);
      store.ensureSpecsDir();
      const specsDir = path.join(tmpDir, OFFICE_SUBDIR, 'specs');
      expect(fs.existsSync(specsDir)).toBe(true);
    });

    it('does not throw when specs directory already exists', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.mkdirSync(path.join(officeDir, 'specs'));
      expect(() => store.ensureSpecsDir()).not.toThrow();
    });
  });

  describe('getSpecForPhase()', () => {
    it('returns null when specs directory does not exist', () => {
      setupOfficeDir(tmpDir);
      expect(store.getSpecForPhase('setup')).toBeNull();
    });

    it('returns null when spec file does not exist', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.mkdirSync(path.join(officeDir, 'specs'));
      expect(store.getSpecForPhase('setup')).toBeNull();
    });

    it('returns file content when spec file exists', () => {
      const officeDir = setupOfficeDir(tmpDir);
      fs.mkdirSync(path.join(officeDir, 'specs'));
      fs.writeFileSync(path.join(officeDir, 'specs', 'phase-setup.md'), '# Setup spec');
      expect(store.getSpecForPhase('setup')).toBe('# Setup spec');
    });
  });

  describe('clearFrom()', () => {
    let officeDir: string;

    beforeEach(() => {
      officeDir = setupOfficeDir(tmpDir);
    });

    function createFiles(...filenames: string[]) {
      for (const f of filenames) {
        fs.writeFileSync(path.join(officeDir, f), 'test content');
      }
    }

    it('clearFrom imagine deletes all imagine + warroom artifacts', () => {
      createFiles(
        '01-vision-brief.md', '02-prd.md', '03-market-analysis.md',
        '04-system-design.md', 'plan.md', 'tasks.yaml',
      );
      store.clearFrom('imagine');
      const remaining = fs.readdirSync(officeDir);
      expect(remaining).toEqual([]);
    });

    it('clearFrom warroom deletes only warroom artifacts', () => {
      createFiles(
        '01-vision-brief.md', '02-prd.md', '03-market-analysis.md',
        '04-system-design.md', 'plan.md', 'tasks.yaml',
      );
      store.clearFrom('warroom');
      const remaining = fs.readdirSync(officeDir).sort();
      expect(remaining).toEqual([
        '01-vision-brief.md', '02-prd.md', '03-market-analysis.md', '04-system-design.md',
      ]);
    });

    it('clearFrom build deletes nothing', () => {
      createFiles('01-vision-brief.md', 'plan.md', 'tasks.yaml');
      store.clearFrom('build');
      const remaining = fs.readdirSync(officeDir).sort();
      expect(remaining).toEqual(['01-vision-brief.md', 'plan.md', 'tasks.yaml']);
    });

    it('does not throw when files do not exist', () => {
      expect(() => store.clearFrom('imagine')).not.toThrow();
    });

    it('clearFrom warroom also deletes the specs directory', () => {
      createFiles('01-vision-brief.md', 'plan.md', 'tasks.yaml');
      const specsDir = path.join(officeDir, 'specs');
      fs.mkdirSync(specsDir);
      fs.writeFileSync(path.join(specsDir, 'phase-setup.md'), 'spec content');
      store.clearFrom('warroom');
      expect(fs.existsSync(specsDir)).toBe(false);
    });

    it('clearFrom imagine also deletes the specs directory', () => {
      createFiles('01-vision-brief.md', 'plan.md', 'tasks.yaml');
      const specsDir = path.join(officeDir, 'specs');
      fs.mkdirSync(specsDir);
      fs.writeFileSync(path.join(specsDir, 'phase-backend.md'), 'spec content');
      store.clearFrom('imagine');
      expect(fs.existsSync(specsDir)).toBe(false);
    });

    it('clearFrom build does not delete the specs directory', () => {
      createFiles('plan.md', 'tasks.yaml');
      const specsDir = path.join(officeDir, 'specs');
      fs.mkdirSync(specsDir);
      fs.writeFileSync(path.join(specsDir, 'phase-setup.md'), 'spec content');
      store.clearFrom('build');
      expect(fs.existsSync(specsDir)).toBe(true);
    });
  });
});
