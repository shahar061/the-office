import { ArtifactStore } from '../project/artifact-store';
import { runAgentSession } from './run-agent-session';
import type { PhaseConfig, WarTableCard, WarTableVisualState, WarTableChoreographyPayload, WarTableReviewResponse } from '../../shared/types';

export interface WarroomConfig extends PhaseConfig {
  onSystemMessage: (text: string) => void;
  onWarTableState: (state: WarTableVisualState) => void;
  onWarTableCardAdded: (card: WarTableCard) => void;
  onWarTableChoreography: (payload: WarTableChoreographyPayload) => void;
  onReviewReady: (content: string, artifact: 'plan' | 'tasks') => Promise<WarTableReviewResponse>;
  waitForIntro: () => Promise<void>;
}

export async function runWarroom(config: WarroomConfig): Promise<void> {
  const {
    projectDir, agentsDir, env, onEvent, onWaiting, onSystemMessage,
    onWarTableState, onWarTableCardAdded, onWarTableChoreography, onReviewReady,
    waitForIntro,
  } = config;
  const artifactStore = new ArtifactStore(projectDir);
  const context = artifactStore.getImagineContext();

  // ── Intro: PM walks to boardroom with cinematic dialog ──

  onWarTableChoreography({ step: 'intro-walk' });
  await waitForIntro();

  // ── Act 1: PM reads artifacts and writes plan ──

  onWarTableState('growing');
  onWarTableChoreography({ step: 'pm-reading' });
  onSystemMessage('War Room started — Project Manager is analyzing the Imagine artifacts...');

  await runAgentSession({
    agentName: 'project-manager',
    agentsDir,
    prompt: [
      'You are the Project Manager leading the War Room planning phase.',
      'Based on the design documents below, create a human-readable implementation plan.',
      'Write it to docs/office/plan.md.',
      '',
      context,
    ].join('\n'),
    cwd: projectDir,
    env,
    excludeAskUser: true,
    expectedOutput: 'docs/office/plan.md',
    onEvent,
    onWaiting,
  });

  // Parse milestones and emit cards with staggered timing
  onWarTableChoreography({ step: 'pm-writing' });
  onSystemMessage('Project Manager is drafting the plan...');

  const milestones = artifactStore.parsePlanMilestones();
  for (const m of milestones) {
    onWarTableCardAdded({ id: m.id, type: 'milestone', title: m.title });
    await delay(400);
  }

  onWarTableChoreography({ step: 'pm-done' });

  // ── Act 2: Review Gate ──

  onWarTableState('review');
  onSystemMessage('Plan ready for review. Click the war table to review.');

  const plan = artifactStore.readArtifact('plan.md');
  const reviewResponse = await onReviewReady(plan, 'plan');

  // ── Act 3: Team Lead breaks down tasks ──

  onWarTableState('expanding');
  onWarTableChoreography({ step: 'tl-reading' });
  onSystemMessage('Team Lead is breaking the plan into tasks...');

  const feedbackClause = reviewResponse.feedback
    ? `\n\nThe user reviewed the plan and has this feedback — incorporate it into your task breakdown:\n${reviewResponse.feedback}`
    : '';

  await runAgentSession({
    agentName: 'team-lead',
    agentsDir,
    prompt: [
      'You are the Team Lead creating the machine-readable task manifest.',
      'Based on the plan and design documents below, create tasks.yaml with phases, dependencies, and assigned agents.',
      'Write it to docs/office/tasks.yaml.',
      feedbackClause,
      '',
      '## Plan',
      plan,
      '',
      context,
    ].join('\n'),
    cwd: projectDir,
    env,
    excludeAskUser: true,
    expectedOutput: 'docs/office/tasks.yaml',
    onEvent,
    onWaiting,
  });

  // Parse tasks and emit cards
  onWarTableChoreography({ step: 'tl-writing' });

  const taskEntries = artifactStore.parseTaskEntries();
  for (const t of taskEntries) {
    onWarTableCardAdded({ id: t.id, type: 'task', title: t.title, parentId: t.milestoneId });
    await delay(250);
  }

  onWarTableChoreography({ step: 'tl-done' });
  onWarTableState('complete');
  onSystemMessage('Task breakdown complete. Review the war table or continue to Build.');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
