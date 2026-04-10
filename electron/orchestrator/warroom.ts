import fs from 'fs';
import path from 'path';
import { ArtifactStore } from '../project/artifact-store';
import { runAgentSession } from './run-agent-session';
import type { PhaseConfig, WarTableCard, WarTableVisualState, WarTableChoreographyPayload, WarTableReviewResponse, AppSettings } from '../../shared/types';
import yaml from 'js-yaml';
import { runPool } from './worker-pool';

interface ParsedPhase {
  id: string;
  name: string;
  dependsOn: string[];
  tasks: { id: string; description: string; assigned_agent: string; model: string }[];
}

export interface WarroomConfig extends PhaseConfig {
  onSystemMessage: (text: string) => void;
  onWarTableState: (state: WarTableVisualState) => void;
  onWarTableCardAdded: (card: WarTableCard) => void;
  onWarTableChoreography: (payload: WarTableChoreographyPayload) => void;
  onReviewReady: (content: string, artifact: 'plan' | 'tasks') => Promise<WarTableReviewResponse>;
  waitForIntro: () => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  /** If provided, skip intro + PM + review gate and resume from the TL step. */
  resumeReviewResponse?: WarTableReviewResponse;
}

export async function runWarroom(config: WarroomConfig): Promise<void> {
  const {
    projectDir, agentsDir, env, onEvent, onWaiting, onSystemMessage,
    onWarTableState, onWarTableCardAdded, onWarTableChoreography, onReviewReady,
    waitForIntro, getSettings,
  } = config;
  const artifactStore = new ArtifactStore(projectDir);
  const context = artifactStore.getImagineContext();

  let reviewResponse: WarTableReviewResponse;

  if (config.resumeReviewResponse) {
    // ── Resuming after app restart — skip intro, PM, and review gate ──
    reviewResponse = config.resumeReviewResponse;
    onSystemMessage('Resuming War Room from plan review...');
  } else {
    // ── Intro: PM walks to boardroom with cinematic dialog ──

    onWarTableChoreography({ step: 'intro-walk' });
    await waitForIntro();

    // ── Act 1: PM reads artifacts and writes plan ──

    // Ensure docs/office/ exists (imagine agents may have created it, but be safe)
    fs.mkdirSync(path.join(projectDir, 'docs', 'office'), { recursive: true });

    config.onActStart?.('PM Plan');
    onWarTableState('growing');
    onWarTableChoreography({ step: 'pm-reading' });
    onSystemMessage('War Room started — Project Manager is analyzing the Imagine artifacts...');

    await runAgentSession({
      agentName: 'project-manager',
      agentsDir,
      prompt: [
        'You are the Project Manager leading the War Room planning phase.',
        'Based on the design documents below, create a human-readable implementation plan.',
        '',
        'CRITICAL: You MUST use the Write tool to save the plan to docs/office/plan.md.',
        'Do NOT just output the plan as text — you MUST write it to the file using the Write tool.',
        'The session will fail if docs/office/plan.md does not exist when you finish.',
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
    config.onActComplete?.('PM Plan');

    // ── Act 2: Review Gate ──

    onWarTableState('review');
    onSystemMessage('Plan ready for review. Click the war table to review.');

    reviewResponse = await onReviewReady(artifactStore.readArtifact('plan.md'), 'plan');
  }

  // Read plan for TL prompt (works for both fresh and resume paths)
  const plan = artifactStore.readArtifact('plan.md');

  // ── Act 3: Coordinator TL writes tasks.yaml ──

  config.onActStart?.('TL Tasks');
  onWarTableState('expanding');
  onWarTableChoreography({ step: 'tl-reading' });
  onSystemMessage('Team Lead is analyzing the plan and creating task manifest...');

  const feedbackClause = reviewResponse.feedback
    ? `\n\nThe user reviewed the plan and has this feedback — incorporate it into your task breakdown:\n${reviewResponse.feedback}`
    : '';

  await runAgentSession({
    agentName: 'team-lead',
    agentsDir,
    prompt: [
      'You are the Team Lead creating the machine-readable task manifest.',
      'Based on the plan and design documents below, create ONLY tasks.yaml.',
      'Do NOT write an implementation spec — that will be handled separately per phase.',
      '',
      'For each task, include a `model` field with one of: "opus", "sonnet", "haiku".',
      'Use opus for complex architectural tasks, sonnet for standard implementation, haiku for boilerplate/config.',
      'For each task, include a `depends_on` field listing task IDs that must complete before this task can start.',
      'Tasks with no dependencies get an empty list: `depends_on: []`.',
      'Tasks CAN depend on tasks in other phases — use this for cross-phase dependencies.',
      'Example:',
      '  - id: auth-wire',
      '    description: "Connect login form to auth API"',
      '    assigned_agent: frontend_engineer',
      '    model: sonnet',
      '    depends_on: [auth-api, auth-ui]',
      '',
      'CRITICAL: You MUST use the Write tool to save the file to docs/office/tasks.yaml.',
      'The session will fail if docs/office/tasks.yaml does not exist when you finish.',
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

  onWarTableChoreography({ step: 'tl-writing' });
  onSystemMessage('Task manifest ready. Parsing phases...');

  // Parse milestones from plan for war table cards
  const milestoneEntries = artifactStore.parsePlanMilestones();

  // Parse phases from tasks.yaml
  const tasksYaml = artifactStore.getTasksYaml();
  if (!tasksYaml) throw new Error('tasks.yaml not found after coordinator TL');
  const parsed = yaml.load(tasksYaml) as any;
  console.log('[Warroom] Parsed tasks.yaml top-level keys:', Object.keys(parsed || {}));
  console.log('[Warroom] parsed.phases type:', typeof parsed?.phases, 'length:', Array.isArray(parsed?.phases) ? parsed.phases.length : 'N/A');

  const phases: ParsedPhase[] = (parsed.phases || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    dependsOn: p.depends_on || [],
    tasks: (p.tasks || []).map((t: any) => ({
      id: t.id,
      description: t.description,
      assigned_agent: t.assigned_agent || 'backend_engineer',
      model: t.model || 'sonnet',
    })),
  }));

  console.log('[Warroom] Parsed phases:', phases.map(p => `${p.id} (${p.tasks.length} tasks)`));

  if (phases.length === 0) {
    onSystemMessage('Warning: No phases found in tasks.yaml — spec writers will not run. Check the YAML structure.');
    console.error('[Warroom] No phases found. Raw YAML (first 500 chars):', tasksYaml.slice(0, 500));
  }

  onWarTableChoreography({ step: 'tl-coordinator-done', totalClones: phases.length });
  config.onActComplete?.('TL Tasks');
  onSystemMessage(`Spawning ${phases.length} spec writers...`);

  // ── Act 4: Parallel spec-writer TL clones (worker pool) ──

  config.onActStart?.('TL Specs');
  artifactStore.ensureSpecsDir();
  const settings = await getSettings();
  const maxConcurrency = settings.maxParallelTLs || 4;

  const systemDesign = artifactStore.getSystemDesign();
  const phaseSummary = buildPhaseSummary(phases);

  const results = await runPool(
    phases,
    maxConcurrency,
    async (phase, index) => {
      const cloneNumber = index + 1;
      onWarTableChoreography({ step: 'tl-clone-writing', cloneId: `tl-${phase.id}`, phaseId: phase.id, phaseName: phase.name });

      const phaseTaskList = phase.tasks
        .map(t => `- ${t.id}: ${t.description} (agent: ${t.assigned_agent}, model: ${t.model})`)
        .join('\n');

      await runAgentSession({
        agentName: 'team-lead',
        agentLabel: `Team Lead #${cloneNumber}`,
        agentsDir,
        prompt: [
          `You are a spec-writer Team Lead. Write the TDD implementation spec for phase "${phase.name}" (${phase.id}).`,
          '',
          `Write the spec to docs/office/specs/phase-${phase.id}.md`,
          '',
          'IMPORTANT: All context you need is provided below. Do NOT read files from disk,',
          'do NOT explore the project directory, do NOT run find/ls/cat commands.',
          'Write the spec directly based on the provided context.',
          '',
          'UI Reference requirement:',
          'For any frontend or UI task in this phase, the task spec MUST include a "UI Reference:" line',
          'pointing to the specific mockup file, e.g.:',
          '  UI Reference: docs/office/05-ui-designs/02-dashboard.html',
          'Check the "UI Designs" section in the context below for available mockups and match them to',
          'frontend tasks. If no mockup matches a given task, write "UI Reference: none".',
          'For backend/data/devops tasks, omit the UI Reference line entirely.',
          '',
          'Follow strict TDD (red-green-refactor) for every task. Each step must have:',
          '- Checkbox syntax (- [ ]) for tracking',
          '- Complete code — no placeholders',
          '- Exact file paths and test commands',
          '- Bite-sized steps (2-5 minutes each)',
          '',
          '## Phase Tasks',
          phaseTaskList,
          '',
          '## All Phases (dependency order)',
          phaseSummary,
          '',
          '## UI Designs (reference docs/office/05-ui-designs/*.html for mockups)',
          artifactStore.hasUIDesigns() ? artifactStore.readArtifact('05-ui-designs/index.md') : '(no UI designs available)',
          '',
          '## System Design',
          systemDesign,
        ].join('\n'),
        cwd: projectDir,
        env,
        excludeAskUser: true,
        expectedOutput: `docs/office/specs/phase-${phase.id}.md`,
        onEvent,
        onWaiting,
      });

      onWarTableChoreography({ step: 'tl-clone-done', cloneId: `tl-${phase.id}`, phaseId: phase.id });

      // Emit task cards for this phase
      const milestoneId = milestoneEntries.find(m =>
        m.title.toLowerCase().includes(phase.name.toLowerCase())
      )?.id || `m${index + 1}`;

      for (const t of phase.tasks) {
        onWarTableCardAdded({ id: t.id, type: 'task', title: t.description, parentId: milestoneId });
        await delay(250);
      }
    },
    {
      onStart: (phase) => {
        onWarTableChoreography({ step: 'tl-clone-spawned', cloneId: `tl-${phase.id}`, phaseId: phase.id, phaseName: phase.name });
      },
    },
  );

  // Log failures
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      const phase = phases[i];
      const reason = (results[i] as PromiseRejectedResult).reason;
      const errMsg = reason instanceof Error ? reason.message : String(reason);
      console.error(`[Warroom] Spec writer failed for phase ${phase.id}:`, reason);
      onSystemMessage(`Error: spec writer for phase "${phase.name}" failed — ${errMsg}`);
    }
  }

  config.onActComplete?.('TL Specs');
  onWarTableChoreography({ step: 'tl-done' });
  onWarTableState('complete');
  onSystemMessage('All specs complete. Review the war table or continue to Build.');
}

function buildPhaseSummary(phases: ParsedPhase[]): string {
  const header = '| # | Phase | Depends On |';
  const separator = '|---|-------|------------|';
  const rows = phases.map((p, i) => {
    const deps = p.dependsOn.length > 0 ? p.dependsOn.join(', ') : '—';
    return `| ${i + 1} | ${p.name} (${p.id}) | ${deps} |`;
  });
  return [header, separator, ...rows].join('\n');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
