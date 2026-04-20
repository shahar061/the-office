import { describe, it, expect } from 'vitest';
import { toolVerb } from '../activityVerb';

describe('toolVerb', () => {
  it('maps read-style tools to "reading"', () => {
    expect(toolVerb('Read')).toBe('reading');
    expect(toolVerb('Grep')).toBe('reading');
    expect(toolVerb('Glob')).toBe('reading');
    expect(toolVerb('WebFetch')).toBe('reading');
    expect(toolVerb('WebSearch')).toBe('reading');
  });
  it('maps write/edit to "writing"', () => {
    expect(toolVerb('Write')).toBe('writing');
    expect(toolVerb('Edit')).toBe('writing');
  });
  it('maps Bash to "running"', () => {
    expect(toolVerb('Bash')).toBe('running');
  });
  it('maps Agent to "delegating"', () => {
    expect(toolVerb('Agent')).toBe('delegating');
  });
  it('falls back to "running" for unknown tools', () => {
    expect(toolVerb('FooBar')).toBe('running');
    expect(toolVerb('')).toBe('running');
  });
});
