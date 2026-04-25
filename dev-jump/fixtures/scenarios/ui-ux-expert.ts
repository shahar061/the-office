import type { Scenario } from '../../mock/types';

export const uiUxExpertScenario: Scenario = {
  target: 'imagine.ui-ux-expert',
  events: [
    { kind: 'created', isTopLevel: true },
    { kind: 'message', text: 'Reading the PRD and vision brief to ground the design direction.', delayMs: 400 },
    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/02-prd.md', toolId: 't1', delayMs: 600 },
    { kind: 'tool-done', toolId: 't1', delayMs: 1200 },
    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/01-vision-brief.md', toolId: 't2', delayMs: 300 },
    { kind: 'tool-done', toolId: 't2', delayMs: 900 },
    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/03-market-analysis.md', toolId: 't3', delayMs: 300 },
    { kind: 'tool-done', toolId: 't3', delayMs: 800 },
    { kind: 'message', text: 'Single-habit simplicity is the hook. Drafting a low-chrome mobile design with a large streak counter as the anchor.', delayMs: 600 },
    { kind: 'tool-start', toolName: 'Write', target: 'docs/office/05-ui-designs/01-home.html', toolId: 't4', delayMs: 500 },
    { kind: 'tool-done', toolId: 't4', delayMs: 2000 },
    { kind: 'tool-start', toolName: 'Write', target: 'docs/office/05-ui-designs/02-dashboard.html', toolId: 't5', delayMs: 400 },
    { kind: 'tool-done', toolId: 't5', delayMs: 1800 },
    { kind: 'tool-start', toolName: 'Write', target: 'docs/office/05-ui-designs/03-settings.html', toolId: 't6', delayMs: 400 },
    { kind: 'tool-done', toolId: 't6', delayMs: 1600 },
    { kind: 'write-output', delayMs: 500 },
    { kind: 'message', text: 'UI designs saved to docs/office/05-ui-designs/. Ready for review.', delayMs: 600 },
    { kind: 'closed', delayMs: 400 },
  ],
};
