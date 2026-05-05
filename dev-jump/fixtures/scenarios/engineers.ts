import type { Scenario, MockEvent } from '../../mock/types';

interface EngineerProfile {
  /** Path the engineer reads for context. */
  readPath: string;
  /** Files the engineer writes/edits. */
  writePaths: readonly string[];
  /** Optional bash command to run after writes (e.g., tests). */
  bashCommand?: string;
  /** First message — what the engineer says when they start. */
  openingMessage: string;
  /** Final summary message. */
  closingMessage: string;
}

function makeEngineerEvents(profile: EngineerProfile): MockEvent[] {
  const events: MockEvent[] = [
    { kind: 'created', isTopLevel: true },
    { kind: 'message', text: profile.openingMessage, delayMs: 600 },

    // Read context
    { kind: 'tool-start', toolName: 'Read', target: 'docs/office/tasks.yaml', toolId: 'r1', delayMs: 500 },
    { kind: 'tool-done', toolId: 'r1', delayMs: 1000 },

    { kind: 'tool-start', toolName: 'Read', target: profile.readPath, toolId: 'r2', delayMs: 300 },
    { kind: 'tool-done', toolId: 'r2', delayMs: 1100 },

    { kind: 'message', text: 'Got the spec. Implementing now.', delayMs: 600 },
  ];

  // One Write/Edit per file
  profile.writePaths.forEach((file, i) => {
    const isFirst = i === 0;
    const tool = isFirst ? 'Write' : 'Edit';
    const toolId = `w${i + 1}`;
    events.push(
      { kind: 'tool-start', toolName: tool, target: file, toolId, delayMs: isFirst ? 500 : 350 },
      { kind: 'tool-done', toolId, delayMs: 1700 + i * 200 },
    );
  });

  // Optional test run
  if (profile.bashCommand) {
    events.push(
      { kind: 'message', text: 'Running tests to verify.', delayMs: 500 },
      { kind: 'tool-start', toolName: 'Bash', target: profile.bashCommand, toolId: 'b1', delayMs: 400 },
      { kind: 'tool-done', toolId: 'b1', delayMs: 2100 },
    );
  }

  events.push(
    { kind: 'message', text: profile.closingMessage, delayMs: 500 },
    { kind: 'closed', delayMs: 500 },
  );

  return events;
}

export const backendEngineerScenario: Scenario = {
  target: 'build.engineering',
  events: makeEngineerEvents({
    openingMessage: 'Picking up the API task. Reading spec and design.',
    readPath: 'docs/office/04-system-design.md',
    writePaths: [
      'src/api/routes/habits.ts',
      'src/api/services/habit-service.ts',
      'src/api/__tests__/habits.test.ts',
    ],
    bashCommand: 'npm test -- habits',
    closingMessage: 'API endpoints + service layer + tests done.',
  }),
};

export const frontendEngineerScenario: Scenario = {
  target: 'build.engineering',
  events: makeEngineerEvents({
    openingMessage: 'Building the home screen from the UI mockup.',
    readPath: 'docs/office/05-ui-designs/01-home.html',
    writePaths: [
      'src/components/HabitList.tsx',
      'src/components/HabitCard.tsx',
      'src/styles/home.module.css',
    ],
    bashCommand: 'npm run typecheck',
    closingMessage: 'Home screen components + styles ready.',
  }),
};

export const mobileDeveloperScenario: Scenario = {
  target: 'build.engineering',
  events: makeEngineerEvents({
    openingMessage: 'Wiring the React Native shell + native bridge.',
    readPath: 'docs/office/04-system-design.md',
    writePaths: [
      'mobile/App.tsx',
      'mobile/src/screens/HomeScreen.tsx',
      'mobile/ios/Podfile',
    ],
    closingMessage: 'Mobile shell scaffolded, deep-link wired.',
  }),
};

export const dataEngineerScenario: Scenario = {
  target: 'build.engineering',
  events: makeEngineerEvents({
    openingMessage: 'Modeling the SQLite schema and migration path.',
    readPath: 'docs/office/04-system-design.md',
    writePaths: [
      'src/db/schema.ts',
      'src/db/migrations/0001_init.sql',
      'src/db/__tests__/migrations.test.ts',
    ],
    bashCommand: 'npm test -- migrations',
    closingMessage: 'Schema + initial migration shipped.',
  }),
};

export const devopsScenario: Scenario = {
  target: 'build.engineering',
  events: makeEngineerEvents({
    openingMessage: 'Setting up CI pipeline and release config.',
    readPath: 'docs/office/04-system-design.md',
    writePaths: [
      '.github/workflows/ci.yml',
      'Dockerfile',
      '.github/workflows/release.yml',
    ],
    bashCommand: 'gh workflow view ci',
    closingMessage: 'CI + release pipeline live.',
  }),
};

export const automationDeveloperScenario: Scenario = {
  target: 'build.engineering',
  events: makeEngineerEvents({
    openingMessage: 'Adding e2e coverage for the streak flow.',
    readPath: 'docs/office/02-prd.md',
    writePaths: [
      'tests/e2e/streak.spec.ts',
      'tests/e2e/fixtures/seed-user.ts',
      'playwright.config.ts',
    ],
    bashCommand: 'npx playwright test --project=chromium',
    closingMessage: 'e2e suite passing on the streak flow.',
  }),
};
