import { describe, it, expect } from 'vitest';
import { parseTriageOutput } from '../../../electron/orchestrator/workshop-parser';

describe('parseTriageOutput', () => {
  it('parses a clean JSON response', () => {
    const raw = `{
  "title": "Add dark mode toggle",
  "assignedAgent": "frontend-engineer",
  "reasoning": "UI change, adds a toggle component"
}`;
    const result = parseTriageOutput(raw, 'fallback');
    expect(result.title).toBe('Add dark mode toggle');
    expect(result.assignedAgent).toBe('frontend-engineer');
    expect(result.reasoning).toBe('UI change, adds a toggle component');
  });

  it('extracts JSON from surrounding prose', () => {
    const raw = `Let me think about this.
Here's my triage:
{
  "title": "Fix login bug",
  "assignedAgent": "backend-engineer",
  "reasoning": "Auth logic"
}
That should do it.`;
    const result = parseTriageOutput(raw, 'fallback');
    expect(result.title).toBe('Fix login bug');
    expect(result.assignedAgent).toBe('backend-engineer');
  });

  it('handles nested JSON with brace counting', () => {
    const raw = `{
  "title": "Config change",
  "assignedAgent": "devops",
  "reasoning": "Update {build} config"
}`;
    const result = parseTriageOutput(raw, 'fallback');
    expect(result.title).toBe('Config change');
  });

  it('falls back when no JSON block is found', () => {
    const raw = 'I cannot determine the right agent for this request.';
    const result = parseTriageOutput(raw, 'add a button to the settings page');
    expect(result.title).toBe('add a button to the settings page');
    expect(result.assignedAgent).toBe('backend-engineer');
    expect(result.reasoning).toBe('fallback — triage failed');
  });

  it('truncates fallback title to 60 chars', () => {
    const longDescription = 'a'.repeat(200);
    const result = parseTriageOutput('not json', longDescription);
    expect(result.title.length).toBeLessThanOrEqual(60);
  });

  it('falls back when JSON is malformed', () => {
    const raw = `{ "title": "missing closing`;
    const result = parseTriageOutput(raw, 'fallback description');
    expect(result.assignedAgent).toBe('backend-engineer');
  });

  it('falls back when assignedAgent is unknown', () => {
    const raw = `{
  "title": "ok",
  "assignedAgent": "wizard",
  "reasoning": "magic"
}`;
    const result = parseTriageOutput(raw, 'fallback');
    expect(result.assignedAgent).toBe('backend-engineer');
  });

  it('falls back when title is missing', () => {
    const raw = `{
  "assignedAgent": "frontend-engineer",
  "reasoning": "UI"
}`;
    const result = parseTriageOutput(raw, 'fallback description');
    expect(result.title).toContain('fallback');
  });

  it('accepts all known engineer roles', () => {
    const roles = [
      'backend-engineer',
      'frontend-engineer',
      'mobile-developer',
      'data-engineer',
      'automation-developer',
      'devops',
    ];
    for (const role of roles) {
      const raw = `{"title":"x","assignedAgent":"${role}","reasoning":"y"}`;
      const result = parseTriageOutput(raw, 'fallback');
      expect(result.assignedAgent).toBe(role);
    }
  });

  it('parses mode=plan from the triage JSON', () => {
    const raw = `{
  "title": "Add auth",
  "assignedAgent": "backend-engineer",
  "reasoning": "complex",
  "mode": "plan"
}`;
    const result = parseTriageOutput(raw, 'fallback');
    expect(result.mode).toBe('plan');
  });

  it('parses mode=direct from the triage JSON', () => {
    const raw = `{
  "title": "Rename var",
  "assignedAgent": "backend-engineer",
  "reasoning": "trivial",
  "mode": "direct"
}`;
    const result = parseTriageOutput(raw, 'fallback');
    expect(result.mode).toBe('direct');
  });

  it('defaults mode to direct when missing', () => {
    const raw = `{
  "title": "x",
  "assignedAgent": "backend-engineer",
  "reasoning": "y"
}`;
    const result = parseTriageOutput(raw, 'fallback');
    expect(result.mode).toBe('direct');
  });

  it('defaults mode to direct when invalid', () => {
    const raw = `{
  "title": "x",
  "assignedAgent": "backend-engineer",
  "reasoning": "y",
  "mode": "wizard"
}`;
    const result = parseTriageOutput(raw, 'fallback');
    expect(result.mode).toBe('direct');
  });

  it('fallback result has mode=direct', () => {
    const result = parseTriageOutput('not json', 'fallback');
    expect(result.mode).toBe('direct');
  });
});
