import type { Scenario } from '../../mock/types';

export const marketResearcherScenario: Scenario = {
  target: 'imagine.market-researcher',
  events: [
    { kind: 'created', isTopLevel: true },
    { kind: 'message', text: 'Pulling context — vision brief and PRD — before scanning the market.', delayMs: 600 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/01-vision-brief.md', toolId: 'm1', delayMs: 700 },
    { kind: 'tool-done', toolId: 'm1', delayMs: 1100 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/02-prd.md', toolId: 'm2', delayMs: 300 },
    { kind: 'tool-done', toolId: 'm2', delayMs: 1200 },

    { kind: 'message', text: 'Searching for direct and adjacent competitors.', delayMs: 600 },

    { kind: 'tool-start', toolName: 'WebSearch', target: 'habit tracker apps streak rewards 2026', toolId: 'm3', delayMs: 500 },
    { kind: 'tool-done', toolId: 'm3', delayMs: 2000 },

    { kind: 'tool-start', toolName: 'WebSearch', target: 'gamified habit tracking market size', toolId: 'm4', delayMs: 400 },
    { kind: 'tool-done', toolId: 'm4', delayMs: 1900 },

    { kind: 'tool-start', toolName: 'WebSearch', target: 'Streaks app Habitica reviews', toolId: 'm5', delayMs: 400 },
    { kind: 'tool-done', toolId: 'm5', delayMs: 1700 },

    { kind: 'message', text: 'Strong opportunity in the indie-friendly local-first space. Writing it up.', delayMs: 600 },

    { kind: 'tool-start', toolName: 'Write', target: 'docs/office/03-market-analysis.md', toolId: 'm6', delayMs: 500 },
    { kind: 'tool-done', toolId: 'm6', delayMs: 2200 },

    { kind: 'write-output', delayMs: 400 },
    { kind: 'message', text: 'Market analysis ready. UI/UX next.', delayMs: 500 },
    { kind: 'closed', delayMs: 500 },
  ],
};
