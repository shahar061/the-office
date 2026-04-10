import { describe, it, expect } from 'vitest';
import { buildPlanningPrompt, buildRevisionPrompt, buildApprovedExecutionPrompt } from '../../../electron/orchestrator/workshop';
import type { Request } from '../../../shared/types';

const makeRequest = (partial: Partial<Request> = {}): Request => ({
  id: 'req-001',
  title: 'Add dark mode',
  description: 'Add a dark mode toggle to settings',
  status: 'in_progress',
  createdAt: 1,
  startedAt: 2,
  completedAt: null,
  assignedAgent: 'frontend-engineer',
  result: null,
  error: null,
  plan: null,
  branchName: null,
  baseBranch: null,
  commitSha: null,
  branchIsolated: false,
  mergedAt: null,
  ...partial,
});

describe('buildPlanningPrompt', () => {
  it('includes the request description and agent role', () => {
    const p = buildPlanningPrompt(makeRequest(), 'UI work', 'src/\n  app.tsx', '');
    expect(p).toContain('Add a dark mode toggle to settings');
    expect(p).toContain('frontend-engineer');
  });

  it('instructs the agent not to write code yet', () => {
    const p = buildPlanningPrompt(makeRequest(), 'UI work', '', '');
    expect(p.toLowerCase()).toContain('do not');
    expect(p.toLowerCase()).toContain('code');
  });

  it('includes the plan template markers', () => {
    const p = buildPlanningPrompt(makeRequest(), 'UI work', '', '');
    expect(p).toContain('## Summary');
    expect(p).toContain('## Files');
    expect(p).toContain('## Approach');
  });
});

describe('buildRevisionPrompt', () => {
  it('includes the previous plan and user feedback', () => {
    const p = buildRevisionPrompt(
      makeRequest(),
      'UI work',
      '',
      '',
      '## Summary\nfirst try',
      'be more specific about files',
    );
    expect(p).toContain('first try');
    expect(p).toContain('be more specific about files');
  });

  it('still includes the template markers', () => {
    const p = buildRevisionPrompt(
      makeRequest(),
      'UI work',
      '',
      '',
      'old plan',
      'feedback',
    );
    expect(p).toContain('## Summary');
    expect(p).toContain('## Files');
    expect(p).toContain('## Approach');
  });
});

describe('buildApprovedExecutionPrompt', () => {
  it('includes the approved plan in the prompt', () => {
    const p = buildApprovedExecutionPrompt(
      makeRequest(),
      'UI work',
      '',
      '',
      '## Summary\napproved plan text',
    );
    expect(p).toContain('approved plan text');
    expect(p.toLowerCase()).toContain('approved');
  });
});
