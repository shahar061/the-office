import { describe, it, expect } from 'vitest';
import { AGENT_ROLES, AGENT_COLORS } from '../electron/adapters/types';

describe('Core types', () => {
  it('defines 15 agent roles (14 + freelancer)', () => {
    expect(AGENT_ROLES).toHaveLength(15);
  });

  it('has a unique color for every role', () => {
    const colors = Object.values(AGENT_COLORS);
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(colors.length);
  });

  it('has a color defined for every role', () => {
    for (const role of AGENT_ROLES) {
      expect(AGENT_COLORS[role]).toBeDefined();
      expect(AGENT_COLORS[role]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});