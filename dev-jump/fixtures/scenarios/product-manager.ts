import type { Scenario } from '../../mock/types';

export const productManagerScenario: Scenario = {
  target: 'imagine.product-manager',
  events: [
    { kind: 'created', isTopLevel: true },
    { kind: 'message', text: 'Reading the vision brief to ground the PRD.', delayMs: 600 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/01-vision-brief.md', toolId: 'p1', delayMs: 700 },
    { kind: 'tool-done', toolId: 'p1', delayMs: 1400 },

    { kind: 'message', text: 'Three feature buckets stand out. Let me check priorities with you.', delayMs: 700 },

    {
      kind: 'ask-question',
      delayMs: 600,
      questions: [
        {
          question: 'Which capability is most important for v1?',
          header: 'v1 scope',
          multiSelect: false,
          options: [
            { label: 'Core habit tracking', description: 'Daily check-in flow + streak counter.' },
            { label: 'Streak rewards', description: 'Gamified milestones, badges, unlocks.' },
            { label: 'Social accountability', description: 'Share progress with friends or groups.' },
          ],
          recommendation: 'Core habit tracking',
        },
        {
          question: 'How should we handle data?',
          header: 'Data model',
          multiSelect: false,
          options: [
            { label: 'Local-first', description: 'No login, no server. Fast, private, no backups.' },
            { label: 'Cloud-synced', description: 'Account-based, multi-device, requires backend.' },
          ],
          recommendation: 'Local-first',
        },
      ],
    },

    { kind: 'message', text: 'Got it. Drafting the PRD with that scope.', delayMs: 800 },

    { kind: 'tool-start', toolName: 'Write', target: 'docs/office/02-prd.md', toolId: 'p2', delayMs: 500 },
    { kind: 'tool-done', toolId: 'p2', delayMs: 2400 },

    { kind: 'write-output', delayMs: 400 },
    { kind: 'message', text: 'PRD saved. Market Researcher takes it from here.', delayMs: 600 },
    { kind: 'closed', delayMs: 500 },
  ],
};
