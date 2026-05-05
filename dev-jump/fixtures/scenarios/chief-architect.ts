import type { Scenario } from '../../mock/types';

export const chiefArchitectScenario: Scenario = {
  target: 'imagine.chief-architect',
  events: [
    { kind: 'created', isTopLevel: true },
    { kind: 'message', text: 'Reviewing the design package before proposing a stack.', delayMs: 600 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/02-prd.md', toolId: 'a1', delayMs: 700 },
    { kind: 'tool-done', toolId: 'a1', delayMs: 1300 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/03-market-analysis.md', toolId: 'a2', delayMs: 300 },
    { kind: 'tool-done', toolId: 'a2', delayMs: 1100 },

    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/05-ui-designs/index.md', toolId: 'a3', delayMs: 300 },
    { kind: 'tool-done', toolId: 'a3', delayMs: 900 },

    { kind: 'message', text: 'A few stack choices need your input.', delayMs: 700 },

    {
      kind: 'ask-question',
      delayMs: 600,
      questions: [
        {
          question: 'Mobile platform target?',
          header: 'Platforms',
          multiSelect: true,
          options: [
            { label: 'iOS', description: 'Native via React Native / Swift.', tradeoffs: 'Larger user base for paid apps. App Store review delays.' },
            { label: 'Android', description: 'Native via React Native / Kotlin.', tradeoffs: 'Bigger global reach. More device fragmentation.' },
            { label: 'Web (PWA)', description: 'Installable web app, works everywhere.', tradeoffs: 'No App Store cut. Reduced platform-native polish.' },
          ],
          recommendation: 'iOS',
        },
        {
          question: 'How should we persist data?',
          header: 'Storage',
          multiSelect: false,
          options: [
            { label: 'SQLite (local-first)', description: 'On-device DB, no server.', tradeoffs: 'Fast, private. No multi-device sync without extra work.' },
            { label: 'Supabase (managed)', description: 'Hosted Postgres + auth + realtime.', tradeoffs: 'Sync for free. Vendor dependency, monthly cost.' },
            { label: 'Custom Node + Postgres', description: 'Self-hosted backend.', tradeoffs: 'Full control. Highest ops burden.' },
          ],
          recommendation: 'SQLite (local-first)',
        },
      ],
    },

    { kind: 'message', text: 'Solid choices. Drafting the system design.', delayMs: 800 },

    { kind: 'tool-start', toolName: 'Write', target: 'docs/office/04-system-design.md', toolId: 'a4', delayMs: 500 },
    { kind: 'tool-done', toolId: 'a4', delayMs: 2400 },

    { kind: 'write-output', delayMs: 400 },
    { kind: 'message', text: 'System design saved. Ready for War Room.', delayMs: 500 },
    { kind: 'closed', delayMs: 500 },
  ],
};
