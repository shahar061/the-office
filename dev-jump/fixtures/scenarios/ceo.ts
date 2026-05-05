import type { Scenario } from '../../mock/types';

export const ceoScenario: Scenario = {
  target: 'imagine.ceo',
  events: [
    { kind: 'created', isTopLevel: true },
    { kind: 'message', text: "Welcome! I'm the CEO. Let me understand what we're building.", delayMs: 600 },

    // Settle in — read whatever context exists in the project
    { kind: 'tool-start', toolName: 'Glob', target: '**/*.md', toolId: 'c1', delayMs: 800 },
    { kind: 'tool-done', toolId: 'c1', delayMs: 700 },

    { kind: 'message', text: "I have a few quick questions before we draft the vision.", delayMs: 700 },

    // Ask the user — this is what makes the CEO interactive
    {
      kind: 'ask-question',
      delayMs: 600,
      questions: [
        {
          question: 'Who is the primary user for this product?',
          header: 'Target audience',
          multiSelect: false,
          options: [
            { label: 'Solo founders / indie hackers', description: 'Building alone, validating fast.' },
            { label: 'Small teams (2–10)', description: 'Early-stage startups or side projects with collaborators.' },
            { label: 'General consumers', description: 'Mainstream end-users, not technical.' },
          ],
          recommendation: 'Solo founders / indie hackers',
        },
      ],
    },

    { kind: 'message', text: 'Got it. Drafting the vision brief now.', delayMs: 800 },

    { kind: 'tool-start', toolName: 'Write', target: 'docs/office/01-vision-brief.md', toolId: 'c2', delayMs: 600 },
    { kind: 'tool-done', toolId: 'c2', delayMs: 2200 },

    { kind: 'write-output', delayMs: 400 },
    { kind: 'message', text: 'Vision brief saved. Handing off to the Product Manager.', delayMs: 600 },
    { kind: 'closed', delayMs: 500 },
  ],
};
