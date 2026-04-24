import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SeedEngine } from '../../dev-jump/engine/seed-engine';
import { ACT_MANIFEST } from '../../dev-jump/engine/act-manifest';

describe('SeedEngine.seed', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-jump-seed-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('seeds imagine.ceo (no prerequisites, no prior chat)', () => {
    SeedEngine.seed({
      target: 'imagine.ceo',
      mode: 'real',
      projectDir,
      force: true,
    });

    // Session files written
    expect(fs.existsSync(path.join(projectDir, 'docs/office/session.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.the-office/config.json'))).toBe(true);

    // No prerequisite artifacts (there are none for CEO)
    expect(fs.existsSync(path.join(projectDir, 'docs/office/01-vision-brief.md'))).toBe(false);

    // No chat-history files (CEO has no prior agents)
    const chatDir = path.join(projectDir, '.the-office/chat-history');
    if (fs.existsSync(chatDir)) {
      expect(fs.readdirSync(chatDir)).toHaveLength(0);
    }
  });

  it('wipes existing docs/office and chat-history before seeding', () => {
    // Pre-populate with stale content
    fs.mkdirSync(path.join(projectDir, 'docs/office'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'docs/office/stale.md'), 'stale');
    fs.mkdirSync(path.join(projectDir, '.the-office/chat-history'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.the-office/chat-history/old.json'), '[]');

    SeedEngine.seed({ target: 'imagine.ceo', mode: 'real', projectDir, force: true });

    expect(fs.existsSync(path.join(projectDir, 'docs/office/stale.md'))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, '.the-office/chat-history/old.json'))).toBe(false);
  });

  it('refuses to seed into unsafe project dir', () => {
    expect(() =>
      SeedEngine.seed({
        target: 'imagine.ceo',
        mode: 'real',
        projectDir: '/tmp/not-the-safe-dir',
      }),
    ).toThrow(/Refusing to operate/);
  });
});

describe('SeedEngine.seed — imagine targets', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-jump-seed-imagine-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  const imagineTargets = [
    'imagine.ceo',
    'imagine.product-manager',
    'imagine.market-researcher',
    'imagine.ui-ux-expert',
    'imagine.chief-architect',
  ] as const;

  for (const target of imagineTargets) {
    it(`seeds ${target} with all prerequisites and no output file`, () => {
      SeedEngine.seed({ target, mode: 'real', projectDir, force: true });

      const act = ACT_MANIFEST[target];
      for (const prereq of act.prerequisites) {
        expect(
          fs.existsSync(path.join(projectDir, 'docs/office', prereq)),
          `prerequisite ${prereq} should exist`,
        ).toBe(true);
      }

      // Target output must NOT exist — that's what lets runImagine run this act.
      expect(
        fs.existsSync(path.join(projectDir, 'docs/office', act.output)),
        `output ${act.output} should NOT exist`,
      ).toBe(false);

      // session.yaml phase correct
      const sessionContent = fs.readFileSync(
        path.join(projectDir, 'docs/office/session.yaml'),
        'utf-8',
      );
      expect(sessionContent).toContain('current_phase: "imagine"');

      // Chat-history files match priorChatAgents count
      const chatDir = path.join(projectDir, '.the-office/chat-history');
      const files = fs.existsSync(chatDir) ? fs.readdirSync(chatDir) : [];
      expect(files).toHaveLength(act.priorChatAgents.length);
    });
  }
});

describe('SeedEngine.seed — warroom + build targets', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-jump-seed-wrb-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('seeds warroom.project-manager with imagine completed', () => {
    SeedEngine.seed({ target: 'warroom.project-manager', mode: 'real', projectDir, force: true });

    const session = fs.readFileSync(path.join(projectDir, 'docs/office/session.yaml'), 'utf-8');
    expect(session).toContain('current_phase: "warroom"');
    expect(session).toContain('completed_phases: ["imagine"]');

    const config = JSON.parse(fs.readFileSync(path.join(projectDir, '.the-office/config.json'), 'utf-8'));
    expect(config.currentPhase).toBe('warroom');
    expect(config.completedPhases).toEqual(['imagine']);

    // Prior imagine artifacts present
    expect(fs.existsSync(path.join(projectDir, 'docs/office/04-system-design.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'docs/office/05-ui-designs/index.md'))).toBe(true);

    // Output not present
    expect(fs.existsSync(path.join(projectDir, 'docs/office/plan.md'))).toBe(false);
  });

  it('seeds build.engineering with imagine and warroom completed', () => {
    SeedEngine.seed({ target: 'build.engineering', mode: 'real', projectDir, force: true });

    const session = fs.readFileSync(path.join(projectDir, 'docs/office/session.yaml'), 'utf-8');
    expect(session).toContain('current_phase: "build"');
    expect(session).toContain('completed_phases: ["imagine", "warroom"]');

    expect(fs.existsSync(path.join(projectDir, 'docs/office/plan.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'docs/office/tasks.yaml'))).toBe(true);
  });
});
