import { describe, it, expect } from 'vitest';
import { loadAgentDefinition, loadAllAgents } from '../../electron/sdk/agent-loader';
import path from 'path';

describe('agent-loader', () => {
  const agentsDir = path.join(__dirname, '../../agents');

  it('parses a single agent .md file into name + definition', () => {
    const [name, def] = loadAgentDefinition(path.join(agentsDir, 'ceo.md'));
    expect(name).toBe('ceo');
    expect(def.description).toBeTruthy();
    expect(def.prompt).toBeTruthy();
    expect(def.prompt).not.toContain('---');
  });

  it('loads all 14 agents from directory', () => {
    const agents = loadAllAgents(agentsDir);
    const names = Object.keys(agents);
    expect(names.length).toBe(14);
    expect(names).toContain('ceo');
    expect(names).toContain('backend-engineer');
  });
});
