import type { Scenario } from '../../mock/types';

export const projectManagerScenario: Scenario = {
  target: 'warroom.project-manager',
  events: [
    { kind: 'created', isTopLevel: true },
    { kind: 'message', text: 'Loading the full design package to draft the implementation plan.', delayMs: 600 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/01-vision-brief.md', toolId: 'pm1', delayMs: 600 },
    { kind: 'tool-done', toolId: 'pm1', delayMs: 1000 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/02-prd.md', toolId: 'pm2', delayMs: 300 },
    { kind: 'tool-done', toolId: 'pm2', delayMs: 1100 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/04-system-design.md', toolId: 'pm3', delayMs: 300 },
    { kind: 'tool-done', toolId: 'pm3', delayMs: 1200 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/05-ui-designs/index.md', toolId: 'pm4', delayMs: 300 },
    { kind: 'tool-done', toolId: 'pm4', delayMs: 900 },

    { kind: 'message', text: 'Three milestones identified. Drafting plan.md with sequencing and risks.', delayMs: 700 },

    { kind: 'tool-start', toolName: 'Write', target: 'docs/office/plan.md', toolId: 'pm5', delayMs: 500 },
    { kind: 'tool-done', toolId: 'pm5', delayMs: 2600 },

    { kind: 'write-output', delayMs: 400 },
    { kind: 'message', text: 'Plan ready. Team Lead will break it into tasks.', delayMs: 500 },
    { kind: 'closed', delayMs: 500 },
  ],
};
