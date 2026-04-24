import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ACT_MANIFEST } from '../../dev-jump/engine/act-manifest';
import { ALL_JUMP_TARGETS } from '../../dev-jump/engine/types';

const FIXTURES = path.resolve(__dirname, '../../dev-jump/fixtures');

describe('ACT_MANIFEST integrity', () => {
  // Only check targets that have been populated; Task 15 adds the rest.
  const populatedTargets = ALL_JUMP_TARGETS.filter((t) => ACT_MANIFEST[t] && ACT_MANIFEST[t].target);

  it('has at least all imagine targets populated', () => {
    for (const t of [
      'imagine.ceo',
      'imagine.product-manager',
      'imagine.market-researcher',
      'imagine.ui-ux-expert',
      'imagine.chief-architect',
    ]) {
      expect(populatedTargets).toContain(t);
    }
  });

  for (const target of populatedTargets) {
    const act = ACT_MANIFEST[target];

    it(`${target}: every prerequisite has a fixture file`, () => {
      for (const prereq of act.prerequisites) {
        const fixturePath = path.join(FIXTURES, 'artifacts', prereq);
        expect(
          fs.existsSync(fixturePath),
          `Missing fixture for prerequisite: ${fixturePath}`,
        ).toBe(true);
      }
    });

    it(`${target}: output is not also a prerequisite (no self-dependency)`, () => {
      expect(act.prerequisites).not.toContain(act.output);
    });

    it(`${target}: every prior chat agent has a fixture JSON`, () => {
      for (const { phase, agentRole } of act.priorChatAgents) {
        const fixturePath = path.join(FIXTURES, 'chat', `${phase}_${agentRole}_1.json`);
        expect(
          fs.existsSync(fixturePath),
          `Missing fixture chat file: ${fixturePath}`,
        ).toBe(true);
      }
    });
  }
});
