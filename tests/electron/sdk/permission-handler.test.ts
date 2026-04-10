import { describe, it, expect } from 'vitest';
import { PermissionHandler } from '../../../electron/sdk/permission-handler';

describe('PermissionHandler — denyPatterns', () => {
  it('denies a matching Bash command with a reason', async () => {
    const handler = new PermissionHandler(
      'auto-all',
      () => {},
      5 * 60 * 1000,
      [/^git\s+commit\b/],
    );
    const result = await handler.handleToolRequest(
      'Bash',
      { command: 'git commit -m "test"' },
      'backend-engineer',
    );
    expect(result.behavior).toBe('deny');
    expect(result.message).toBeTruthy();
  });

  it('allows a Bash command that does not match', async () => {
    const handler = new PermissionHandler(
      'auto-all',
      () => {},
      5 * 60 * 1000,
      [/^git\s+commit\b/],
    );
    const result = await handler.handleToolRequest(
      'Bash',
      { command: 'git status' },
      'backend-engineer',
    );
    expect(result.behavior).toBe('allow');
  });

  it('ignores denyPatterns for non-Bash tools', async () => {
    const handler = new PermissionHandler(
      'auto-all',
      () => {},
      5 * 60 * 1000,
      [/^git/],
    );
    const result = await handler.handleToolRequest(
      'Read',
      { path: 'README.md' },
      'backend-engineer',
    );
    expect(result.behavior).toBe('allow');
  });

  it('works with multiple deny patterns', async () => {
    const handler = new PermissionHandler(
      'auto-all',
      () => {},
      5 * 60 * 1000,
      [/^git\s+commit\b/, /^git\s+checkout\b/],
    );
    expect(
      (await handler.handleToolRequest('Bash', { command: 'git commit' }, 'backend-engineer')).behavior,
    ).toBe('deny');
    expect(
      (await handler.handleToolRequest('Bash', { command: 'git checkout main' }, 'backend-engineer')).behavior,
    ).toBe('deny');
    expect(
      (await handler.handleToolRequest('Bash', { command: 'git log' }, 'backend-engineer')).behavior,
    ).toBe('allow');
  });

  it('behaves exactly like before when no denyPatterns are passed', async () => {
    const handler = new PermissionHandler('auto-all', () => {});
    const result = await handler.handleToolRequest(
      'Bash',
      { command: 'git commit' },
      'backend-engineer',
    );
    expect(result.behavior).toBe('allow');
  });
});
