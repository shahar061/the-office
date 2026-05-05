import type { Scenario } from '../../mock/types';

export const teamLeadScenario: Scenario = {
  target: 'warroom.team-lead',
  events: [
    { kind: 'created', isTopLevel: true },
    { kind: 'message', text: 'Reading the plan to break it into Claude-task units.', delayMs: 600 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/plan.md', toolId: 'tl1', delayMs: 600 },
    { kind: 'tool-done', toolId: 'tl1', delayMs: 1300 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/02-prd.md', toolId: 'tl2', delayMs: 300 },
    { kind: 'tool-done', toolId: 'tl2', delayMs: 1000 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/04-system-design.md', toolId: 'tl3', delayMs: 300 },
    { kind: 'tool-done', toolId: 'tl3', delayMs: 1100 },

    { kind: 'message', text: 'Carving 8 tasks across frontend, backend, and devops. Adding TDD specs to each.', delayMs: 700 },

    { kind: 'tool-start', toolName: 'Write', target: 'docs/office/tasks.yaml', toolId: 'tl4', delayMs: 500 },
    { kind: 'tool-done', toolId: 'tl4', delayMs: 2400 },

    { kind: 'write-output', delayMs: 400 },
    { kind: 'message', text: 'Task graph ready. Engineers can start.', delayMs: 500 },
    { kind: 'closed', delayMs: 400 },
  ],
};
