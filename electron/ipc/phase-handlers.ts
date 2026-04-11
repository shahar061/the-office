import { ipcMain, shell, clipboard } from 'electron';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/types';
import type {
  AppSettings,
  BuildConfig,
  ChatMessage,
  Phase,
  PhaseInfo,
  PermissionRequest,
  RestartPhasePayload,
  Request,
  WarTableCard,
  WarTableVisualState,
  WarTableChoreographyPayload,
  WarTableReviewPayload,
  WarTableReviewResponse,
  UIDesignReviewResponse,
  RequestPlanResponse,
  RequestPlanReadyPayload,
  GitInitPromptPayload,
  GitRecoveryNote,
} from '../../shared/types';
import { PhaseMachine } from '../orchestrator/phase-machine';
import { GreenfieldGit } from '../project/greenfield-git';
import { PermissionHandler } from '../sdk/permission-handler';
import { ArtifactStore } from '../project/artifact-store';
import { runImagine } from '../orchestrator/imagine';
import { runWarroom } from '../orchestrator/warroom';
import { runBuild } from '../orchestrator/build';
import { runWorkshopRequest } from '../orchestrator/workshop';
import { runOnboardingScan } from '../orchestrator/onboarding';
import { GitManager } from '../project/git-manager';
import { computeRequestDiff } from '../project/git-diff';
import { acceptRequest, rejectRequest } from '../project/git-merge';
import type { GitGateContext } from '../orchestrator/workshop-git-gate';
import {
  activeAbort,
  authManager,
  agentsDir,
  currentProjectDir,
  chatHistoryStore,
  currentChatPhase,
  phaseMachine,
  permissionHandler,
  currentChatAgentRole,
  currentChatRunNumber,
  pendingQuestions,
  projectManager,
  send,
  sendChat,
  onAgentEvent,
  handleAgentWaiting,
  onSystemMessage,
  rejectPendingQuestions,
  setActiveAbort,
  setCurrentChatPhase,
  setCurrentChatAgentRole,
  setCurrentChatRunNumber,
  setPhaseMachine,
  setPermissionHandler,
  pendingReview,
  setPendingReview,
  pendingUIReview,
  setPendingUIReview,
  pendingIntro,
  setPendingIntro,
  pendingBuildIntro,
  setPendingBuildIntro,
  statsCollector,
  setStatsCollector,
  clearWaitingState,
  persistPendingReview,
  clearPendingReview,
  requestStore,
  pendingRequestPlanReview,
  setPendingRequestPlanReview,
  pendingGitInit,
  setPendingGitInit,
  settingsStore,
} from './state';
import { StatsCollector } from '../stats/stats-collector';
import type { StatsState } from '../../shared/types';
import type { BuildState } from '../orchestrator/build';

let lastBuildState: BuildState | null = null;

const WORKSHOP_GIT_DENY = [
  /^git\s+(commit|checkout|reset|branch|merge|rebase|stash|push|pull|rm|clean)\b/,
];

/**
 * Attach a change listener to a PhaseMachine so that greenfield projects
 * commit their phase state when a phase completes or fails.
 * No-op for workshop projects (gated by state.mode check).
 */
function attachGreenfieldGitListener(pm: PhaseMachine): void {
  // Capture the project dir at attach time; PhaseMachines are recreated
  // when the project changes, so this binding is stable for the lifetime
  // of this listener. Constructing gg here (not per-event) ensures all
  // change events share the same commitMutex.
  const projectDir = currentProjectDir;
  if (!projectDir) return; // nothing to attach to

  const gg = new GreenfieldGit(
    projectDir,
    projectManager,
    settingsStore,
    (note) => send(IPC_CHANNELS.GREENFIELD_GIT_NOTE, note),
  );

  pm.on('change', async (info: PhaseInfo) => {
    const state = projectManager.getProjectState(projectDir);
    if (state.mode !== 'greenfield') return;
    if (info.status !== 'completed' && info.status !== 'failed') return;
    await gg.commitPhase(info.phase, info.status);
  });
}

function clearSessionYaml(projectDir: string, targetPhase: Phase): void {
  const sessionPath = path.join(projectDir, 'docs', 'office', 'session.yaml');
  if (!fs.existsSync(sessionPath)) return;

  if (targetPhase === 'imagine') {
    fs.unlinkSync(sessionPath);
  } else {
    let content = fs.readFileSync(sessionPath, 'utf-8');
    content = content.replace(/current_phase:\s*.+/, `current_phase: "${targetPhase}"`);
    content = content.replace(/completed_phases:\s*\[.*\]/, 'completed_phases: []');
    fs.writeFileSync(sessionPath, content, 'utf-8');
  }
}

async function handleStartImagine(userIdea: string, resume = false): Promise<void> {
  setCurrentChatPhase('imagine');
  setCurrentChatAgentRole('ceo');
  setCurrentChatRunNumber(chatHistoryStore?.nextRunNumber('imagine', 'ceo') ?? 1);

  if (!resume) {
    sendChat({ role: 'agent', agentRole: 'ceo', text: 'Starting the /imagine phase... gathering the team.' });

    // Persist user's initial idea
    if (chatHistoryStore) {
      const ideaMsg: ChatMessage = {
        id: randomUUID(),
        role: 'user',
        text: userIdea,
        timestamp: Date.now(),
      };
      chatHistoryStore.appendMessage('imagine', 'ceo', currentChatRunNumber, ideaMsg);
    }
  }

  const state = projectManager.getProjectState(currentProjectDir!);
  const pm = new PhaseMachine(state.currentPhase, state.completedPhases);
  attachGreenfieldGitListener(pm);
  setPhaseMachine(pm);
  pm.on('change', (info: PhaseInfo) => {
    send(IPC_CHANNELS.PHASE_CHANGE, info);
    if (currentProjectDir) {
      projectManager.updateProjectState(currentProjectDir, {
        currentPhase: info.phase,
        completedPhases: pm.completedPhases,
      });
    }
  });

  pm.transition('imagine');

  if (!statsCollector && currentProjectDir) {
    setStatsCollector(new StatsCollector(currentProjectDir));
  }
  statsCollector?.onPhaseStart('imagine');

  const ph = new PermissionHandler(
    'auto-all',
    (req: PermissionRequest) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
  );
  setPermissionHandler(ph);

  try {
    await runImagine(userIdea, {
      projectDir: currentProjectDir!,
      agentsDir,
      env: authManager.getAuthEnv() || {},
      onEvent: onAgentEvent,
      onWaiting: handleAgentWaiting,
      onSystemMessage,
      onArtifactAvailable: (info) => {
        send(IPC_CHANNELS.ARTIFACT_AVAILABLE, info);
      },
      onUIReviewReady: (payload) => {
        return new Promise<UIDesignReviewResponse>((resolve) => {
          setPendingUIReview({ resolve });
          send(IPC_CHANNELS.UI_DESIGN_REVIEW_READY, payload);
        });
      },
      onActStart: (actName) => statsCollector?.onActStart('imagine', actName),
      onActComplete: (actName) => statsCollector?.onActComplete('imagine', actName),
    });
    statsCollector?.onPhaseComplete('imagine');
    pm.markCompleted('imagine');
  } catch (err: any) {
    console.error('[Main] Imagine failed:', err);
    const errMsg = err.stderr || err.message || 'Unknown error';
    sendChat({ role: 'agent', text: `Error starting /imagine: ${errMsg}` });
    rejectPendingQuestions('Imagine phase failed', true);
    pm.markFailed();
  }
}

async function handleStartWarroom(): Promise<void> {
  setCurrentChatPhase('warroom');
  setCurrentChatAgentRole(null);
  setCurrentChatRunNumber(0);

  phaseMachine!.transition('warroom');

  if (!statsCollector && currentProjectDir) {
    setStatsCollector(new StatsCollector(currentProjectDir));
  }
  statsCollector?.onPhaseStart('warroom');

  let ph = permissionHandler;
  if (!ph) {
    ph = new PermissionHandler(
      'auto-all',
      (req: PermissionRequest) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
    );
    setPermissionHandler(ph);
  }

  try {
    await runWarroom({
      projectDir: currentProjectDir!,
      agentsDir,
      env: authManager.getAuthEnv() || {},
      onEvent: onAgentEvent,
      onWaiting: handleAgentWaiting,
      onSystemMessage,
      onActStart: (actName) => statsCollector?.onActStart('warroom', actName),
      onActComplete: (actName) => statsCollector?.onActComplete('warroom', actName),
      onWarTableState: (state: WarTableVisualState) => {
        send(IPC_CHANNELS.WAR_TABLE_STATE, state);
      },
      onWarTableCardAdded: (card: WarTableCard) => {
        send(IPC_CHANNELS.WAR_TABLE_CARD_ADDED, card);
      },
      onWarTableChoreography: (payload: WarTableChoreographyPayload) => {
        send(IPC_CHANNELS.WAR_TABLE_CHOREOGRAPHY, payload);
      },
      onReviewReady: (content: string, artifact: 'plan' | 'tasks') => {
        return new Promise<WarTableReviewResponse>((resolve) => {
          setPendingReview({ resolve });
          const payload: WarTableReviewPayload = { content, artifact };
          send(IPC_CHANNELS.WAR_TABLE_REVIEW_READY, payload);
          if (currentProjectDir) persistPendingReview(currentProjectDir, artifact);
        });
      },
      waitForIntro: () => {
        return new Promise<void>((resolve) => {
          setPendingIntro({ resolve });
        });
      },
      getSettings: async (): Promise<AppSettings> => settingsStore.get(),
    });
    statsCollector?.onPhaseComplete('warroom');
    phaseMachine!.markCompleted('warroom');
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Main] Warroom failed:', err);
    onSystemMessage(`Warroom failed: ${errMsg}`);
    rejectPendingQuestions('Warroom phase failed', true);
    setPendingReview(null);
    phaseMachine!.markFailed();
  }
}

async function handleStartBuild(config: BuildConfig): Promise<void> {
  setCurrentChatPhase('build');
  setCurrentChatAgentRole(null);
  setCurrentChatRunNumber(0);

  phaseMachine!.transition('build');

  if (!statsCollector && currentProjectDir) {
    setStatsCollector(new StatsCollector(currentProjectDir));
  }
  statsCollector?.onPhaseStart('build');

  const ph = new PermissionHandler(
    config.permissionMode,
    (req: PermissionRequest) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
  );
  setPermissionHandler(ph);

  // Build intro gate — show intro if not seen
  const state = projectManager.getProjectState(currentProjectDir!);
  if (!state.buildIntroSeen) {
    await new Promise<void>((resolve) => {
      setPendingBuildIntro({ resolve });
      send(IPC_CHANNELS.PHASE_CHANGE, { phase: 'build', status: 'starting' } as PhaseInfo);
    });
    projectManager.updateProjectState(currentProjectDir!, { buildIntroSeen: true });
  }

  try {
    lastBuildState = await runBuild({
      projectDir: currentProjectDir!,
      agentsDir,
      apiKey: authManager.getApiKey() || '',
      authEnv: authManager.getAuthEnv(),
      permissionHandler: ph,
      buildConfig: config,
      onEvent: onAgentEvent,
      onKanbanUpdate: (kanbanState) => send(IPC_CHANNELS.KANBAN_UPDATE, kanbanState),
      onWaiting: handleAgentWaiting,
      onSystemMessage,
      onActStart: (actName) => statsCollector?.onActStart('build', actName),
      onActComplete: (actName) => statsCollector?.onActComplete('build', actName),
    });

    statsCollector?.onPhaseComplete('build');
    if (!lastBuildState.taskErrors.size) {
      phaseMachine!.markCompleted('build');
      phaseMachine!.transition('complete');
      phaseMachine!.markCompleted('complete');
    } else {
      phaseMachine!.markFailed();
    }
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Main] Build failed:', err);
    onSystemMessage(`Build failed: ${errMsg}`);
    rejectPendingQuestions('Build phase failed', true);
    phaseMachine!.markFailed();
  }
}

/** Create a PhaseMachine from persisted project state (for app restart scenarios). */
function ensurePhaseMachine(): void {
  if (phaseMachine || !currentProjectDir) return;
  const state = projectManager.getProjectState(currentProjectDir);
  const pm = new PhaseMachine(state.currentPhase, state.completedPhases);
  attachGreenfieldGitListener(pm);
  setPhaseMachine(pm);
  pm.on('change', (info: PhaseInfo) => {
    send(IPC_CHANNELS.PHASE_CHANGE, info);
    if (currentProjectDir) {
      projectManager.updateProjectState(currentProjectDir, {
        currentPhase: info.phase,
        completedPhases: pm.completedPhases,
      });
    }
  });
}

/**
 * Resume a phase after the user answers a restored pending question.
 * Reads chat history to build a continuation prompt so the agent
 * knows what was already discussed.
 */
export async function resumePhase(phase: Phase): Promise<void> {
  if (!currentProjectDir || !chatHistoryStore) return;

  // Build conversation context from persisted chat history
  const history = chatHistoryStore.getPhaseHistory(phase);
  const allMessages = history.flatMap(h => h.runs.flatMap(r => r.messages));
  allMessages.sort((a, b) => a.timestamp - b.timestamp);

  const conversationLines: string[] = [];
  let originalIdea = '';
  for (const msg of allMessages) {
    if (msg.role === 'user') {
      if (!originalIdea) originalIdea = msg.text;
      conversationLines.push(`User: ${msg.text}`);
    } else if (msg.role === 'agent') {
      const label = msg.agentRole ?? 'Agent';
      conversationLines.push(`${label}: ${msg.text}`);
    }
  }

  if (phase === 'imagine') {
    const prompt = [
      originalIdea || 'Continue the project',
      '',
      '--- Previous conversation (already happened, do NOT repeat these questions) ---',
      conversationLines.join('\n'),
      '--- End of previous conversation ---',
      '',
      'Continue from where you left off. The user has already answered your question above.',
    ].join('\n');

    sendChat({ role: 'system', text: 'Resuming conversation...' });
    await handleStartImagine(prompt, true);
  } else if (phase === 'warroom') {
    // Warroom questions are rare (agents use excludeAskUser),
    // but if one occurs, restart the full warroom.
    await handleStartWarroom();
  } else if (phase === 'build') {
    await handleStartBuild({
      modelPreset: 'default',
      retryLimit: 2,
      permissionMode: 'auto-all',
    });
  }
}

/**
 * Resume the warroom after the user responds to a restored plan review.
 * Skips intro + PM (plan already exists) and continues from the TL step.
 */
export async function resumeWarroomAfterReview(reviewResponse: WarTableReviewResponse): Promise<void> {
  if (!currentProjectDir) return;

  setCurrentChatPhase('warroom');
  setCurrentChatAgentRole(null);
  setCurrentChatRunNumber(0);

  // Ensure phase machine exists
  if (!phaseMachine) {
    const state = projectManager.getProjectState(currentProjectDir);
    const pm = new PhaseMachine(state.currentPhase, state.completedPhases);
    attachGreenfieldGitListener(pm);
    setPhaseMachine(pm);
    pm.on('change', (info: PhaseInfo) => {
      send(IPC_CHANNELS.PHASE_CHANGE, info);
      if (currentProjectDir) {
        projectManager.updateProjectState(currentProjectDir, {
          currentPhase: info.phase,
          completedPhases: pm.completedPhases,
        });
      }
    });
  }

  phaseMachine!.transition('warroom');

  if (!statsCollector && currentProjectDir) {
    setStatsCollector(new StatsCollector(currentProjectDir));
  }
  statsCollector?.onPhaseStart('warroom');

  if (!permissionHandler) {
    setPermissionHandler(new PermissionHandler(
      'auto-all',
      (req: PermissionRequest) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
    ));
  }

  try {
    await runWarroom({
      projectDir: currentProjectDir,
      agentsDir,
      env: authManager.getAuthEnv() || {},
      onEvent: onAgentEvent,
      onWaiting: handleAgentWaiting,
      onSystemMessage,
      onActStart: (actName) => statsCollector?.onActStart('warroom', actName),
      onActComplete: (actName) => statsCollector?.onActComplete('warroom', actName),
      onWarTableState: (state: WarTableVisualState) => {
        send(IPC_CHANNELS.WAR_TABLE_STATE, state);
      },
      onWarTableCardAdded: (card: WarTableCard) => {
        send(IPC_CHANNELS.WAR_TABLE_CARD_ADDED, card);
      },
      onWarTableChoreography: (payload: WarTableChoreographyPayload) => {
        send(IPC_CHANNELS.WAR_TABLE_CHOREOGRAPHY, payload);
      },
      onReviewReady: (content: string, artifact: 'plan' | 'tasks') => {
        return new Promise<WarTableReviewResponse>((resolve) => {
          setPendingReview({ resolve });
          const payload: WarTableReviewPayload = { content, artifact };
          send(IPC_CHANNELS.WAR_TABLE_REVIEW_READY, payload);
          if (currentProjectDir) persistPendingReview(currentProjectDir, artifact);
        });
      },
      waitForIntro: () => Promise.resolve(), // not used in resume path
      getSettings: async (): Promise<AppSettings> => settingsStore.get(),
      resumeReviewResponse: reviewResponse,
    });
    statsCollector?.onPhaseComplete('warroom');
    phaseMachine!.markCompleted('warroom');
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Main] Warroom resume failed:', err);
    onSystemMessage(`Warroom resume failed: ${errMsg}`);
    phaseMachine!.markFailed();
  }
}

/**
 * Resume a request that was persisted in `awaiting_review` state with a plan.
 * Re-emits REQUEST_PLAN_READY so the overlay reappears; on user response,
 * continues directly into execution or a fresh planning loop.
 */
export function resumeAwaitingReview(request: Request): void {
  if (!currentProjectDir) return;
  if (!request.plan) return;

  const projectDir = currentProjectDir;
  const ph = new PermissionHandler(
    'auto-all',
    (req) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
    5 * 60 * 1000,
    WORKSHOP_GIT_DENY,
  );

  const resumeProjectState = projectManager.getProjectState(projectDir);
  const resumeGitContext: GitGateContext = {
    git: new GitManager(projectDir),
    projectDir,
    gitInitChoice: resumeProjectState.gitInit ?? null,
    promptGitInit: () => new Promise<'yes' | 'no'>((resolve) => {
      setPendingGitInit({
        resolve: (answer) => {
          projectManager.updateProjectState(projectDir, { gitInit: answer });
          resolve(answer);
        },
      });
      const payload: GitInitPromptPayload = { projectPath: projectDir };
      send(IPC_CHANNELS.GIT_INIT_PROMPT, payload);
    }),
    resolveIdentity: () => {
      const state = projectManager.getProjectState(projectDir);
      return settingsStore.resolveIdentityForProject(state);
    },
  };

  // Re-register the pending-review slot for the INITIAL wait
  const reviewPromise = new Promise<RequestPlanResponse>((resolve) => {
    setPendingRequestPlanReview({ requestId: request.id, resolve });
  });

  // Emit after a tick so renderer listeners are ready
  setTimeout(() => {
    const payload: RequestPlanReadyPayload = {
      requestId: request.id,
      title: request.title || request.description.slice(0, 60),
      plan: request.plan!,
    };
    send(IPC_CHANNELS.REQUEST_PLAN_READY, payload);
  }, 100);

  // When the user responds, continue the workflow
  reviewPromise.then(async (response) => {
    const { continueWorkshopAfterReview } = await import('../orchestrator/workshop');
    continueWorkshopAfterReview(request, response, {
      projectDir,
      agentsDir,
      env: authManager.getAuthEnv() || {},
      permissionHandler: ph,
      onEvent: onAgentEvent,
      onRequestUpdated: (updated: Request) => {
        requestStore?.update(updated.id, updated);
        send(IPC_CHANNELS.REQUEST_UPDATED, updated);
      },
      waitForPlanReview: (requestId, plan) =>
        new Promise<RequestPlanResponse>((resolve) => {
          setPendingRequestPlanReview({ requestId, resolve });
          send(IPC_CHANNELS.REQUEST_PLAN_READY, {
            requestId,
            title: request.title || request.description.slice(0, 60),
            plan,
          });
        }),
      gitContext: resumeGitContext,
    }).catch((err) => {
      console.error('[Workshop] Resumed request failed:', err);
    });
  });
}

export function initPhaseHandlers(): void {
  // ── Phases ──

  ipcMain.handle(IPC_CHANNELS.START_IMAGINE, async (_event, userIdea: string) => {
    if (!currentProjectDir) throw new Error('No project open');
    if (!authManager.isAuthenticated()) throw new Error('Not authenticated — connect via CLI or API key');
    return handleStartImagine(userIdea);
  });

  ipcMain.handle(IPC_CHANNELS.START_WARROOM, async () => {
    if (!currentProjectDir) throw new Error('No project open');
    if (!authManager.isAuthenticated()) throw new Error('Not authenticated');
    if (!phaseMachine) ensurePhaseMachine();
    return handleStartWarroom();
  });

  ipcMain.handle(IPC_CHANNELS.START_BUILD, async (_event, config: BuildConfig) => {
    if (!currentProjectDir) throw new Error('No project open');
    if (!authManager.isAuthenticated()) throw new Error('Not authenticated');
    if (!phaseMachine) ensurePhaseMachine();
    return handleStartBuild(config);
  });

  ipcMain.handle(IPC_CHANNELS.RESTART_PHASE, async (_event, payload: RestartPhasePayload) => {
    if (!currentProjectDir) throw new Error('No project open');
    if (!authManager.isAuthenticated()) throw new Error('Not authenticated');

    const { targetPhase, userIdea } = payload;

    // 1. Interrupt active phase if running
    if (activeAbort) {
      activeAbort();
      setActiveAbort(null);
    }
    if (phaseMachine) {
      phaseMachine.markInterrupted();
    }
    rejectPendingQuestions('Phase restart', true);
    setPendingReview(null);

    // 1b. Greenfield iteration — create backup branch + reset main before destructive clear
    const currentState = projectManager.getProjectState(currentProjectDir);
    if (currentState.mode === 'greenfield' && currentState.greenfieldGit?.initialized) {
      const gg = new GreenfieldGit(
        currentProjectDir,
        projectManager,
        settingsStore,
        (note) => send(IPC_CHANNELS.GREENFIELD_GIT_NOTE, note),
      );
      const result = await gg.startIteration(targetPhase as Phase);
      if (!result.ok) {
        return {
          success: false,
          error: result.message,
          reason: result.reason,
        };
      }
    }

    // 2. Clean artifacts from target phase onward
    const store = new ArtifactStore(currentProjectDir);
    store.clearFrom(targetPhase);

    // 2b. Clear chat history from target phase onward
    if (chatHistoryStore) {
      const PHASES_TO_CLEAR: Phase[] = ['imagine', 'warroom', 'build'];
      const clearIdx = PHASES_TO_CLEAR.indexOf(targetPhase as Phase);
      if (clearIdx !== -1) {
        for (const p of PHASES_TO_CLEAR.slice(clearIdx)) {
          chatHistoryStore.clearPhaseHistory(p);
        }
      }
    }

    // 3. Reset session.yaml
    clearSessionYaml(currentProjectDir, targetPhase);

    // 4. Update ProjectState
    const state = projectManager.getProjectState(currentProjectDir);
    const PHASE_ORDER = ['idle', 'imagine', 'warroom', 'build', 'complete'];
    const idx = PHASE_ORDER.indexOf(targetPhase);
    const cleanedCompleted = state.completedPhases.filter(
      (p) => PHASE_ORDER.indexOf(p) < idx
    );
    projectManager.updateProjectState(currentProjectDir, {
      currentPhase: targetPhase,
      completedPhases: cleanedCompleted,
      interrupted: false,
    });

    // 5. Broadcast renderer reset
    send(IPC_CHANNELS.PHASE_RESTART, targetPhase);

    // 6. Create fresh phase machine from cleaned state
    setPhaseMachine(null);
    setPermissionHandler(null);

    // 7. Start the target phase (don't await — runs async like normal starts)
    if (targetPhase === 'imagine') {
      const idea = userIdea ?? 'Continue from previous session';
      handleStartImagine(idea);
    } else if (targetPhase === 'warroom') {
      // handleStartWarroom expects phaseMachine to exist — create one from cleaned state
      const cleanedState = projectManager.getProjectState(currentProjectDir);
      const pm = new PhaseMachine(cleanedState.currentPhase, cleanedState.completedPhases);
      attachGreenfieldGitListener(pm);
      setPhaseMachine(pm);
      pm.on('change', (info: PhaseInfo) => {
        send(IPC_CHANNELS.PHASE_CHANGE, info);
        if (currentProjectDir) {
          projectManager.updateProjectState(currentProjectDir, {
            currentPhase: info.phase,
            completedPhases: pm.completedPhases,
          });
        }
      });
      handleStartWarroom();
    } else if (targetPhase === 'build') {
      // handleStartBuild expects phaseMachine to exist — create one from cleaned state
      const cleanedState = projectManager.getProjectState(currentProjectDir);
      const pm = new PhaseMachine(cleanedState.currentPhase, cleanedState.completedPhases);
      attachGreenfieldGitListener(pm);
      setPhaseMachine(pm);
      pm.on('change', (info: PhaseInfo) => {
        send(IPC_CHANNELS.PHASE_CHANGE, info);
        if (currentProjectDir) {
          projectManager.updateProjectState(currentProjectDir, {
            currentPhase: info.phase,
            completedPhases: pm.completedPhases,
          });
        }
      });
      handleStartBuild({
        modelPreset: 'default',
        retryLimit: 2,
        permissionMode: 'auto-all',
      });
    }
  });

  // ── Chat ──

  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, _message: string) => {
    // User messages are added to the chat store locally by the renderer.
    // This handler exists for future use (routing messages to active SDK sessions).
  });

  ipcMain.handle(IPC_CHANNELS.USER_RESPONSE, async (_event, sessionId: string, answers: Record<string, string>) => {
    // Clear persisted waiting state regardless of whether a live session exists
    if (currentProjectDir) clearWaitingState(currentProjectDir);

    const pending = pendingQuestions.get(sessionId);
    if (pending) {
      if (chatHistoryStore && currentChatPhase && currentChatAgentRole && currentChatRunNumber > 0) {
        // Persist the question text as an agent message
        const questionText = Object.keys(answers).join('\n');
        if (questionText) {
          const questionMsg: ChatMessage = {
            id: randomUUID(),
            role: 'agent',
            agentRole: currentChatAgentRole,
            text: questionText,
            timestamp: Date.now(),
          };
          chatHistoryStore.appendMessage(currentChatPhase, currentChatAgentRole, currentChatRunNumber, questionMsg);
        }

        // Persist user's answer
        const answerText = Object.values(answers).join('\n');
        if (answerText) {
          const userMsg: ChatMessage = {
            id: randomUUID(),
            role: 'user',
            text: answerText,
            timestamp: Date.now(),
          };
          chatHistoryStore.appendMessage(currentChatPhase, currentChatAgentRole, currentChatRunNumber, userMsg);
        }
      }

      pendingQuestions.delete(sessionId);
      pending.resolve(answers);
    }
  });

  // ── Permissions ──

  ipcMain.handle(IPC_CHANNELS.RESPOND_PERMISSION, async (_event, requestId: string, approved: boolean) => {
    if (permissionHandler) {
      permissionHandler.resolvePermission(requestId, approved);
    }
  });

  // ── War Table ──

  ipcMain.handle(IPC_CHANNELS.WAR_TABLE_REVIEW_RESPONSE, async (_event, response: WarTableReviewResponse) => {
    if (currentProjectDir) clearPendingReview(currentProjectDir);
    if (pendingReview) {
      pendingReview.resolve(response);
      setPendingReview(null);
    }
  });

  ipcMain.handle(IPC_CHANNELS.REQUEST_PLAN_RESPONSE, async (_event, response: RequestPlanResponse) => {
    if (pendingRequestPlanReview) {
      const pending = pendingRequestPlanReview;
      setPendingRequestPlanReview(null);
      pending.resolve(response);
    }
  });

  ipcMain.handle(IPC_CHANNELS.GIT_INIT_RESPONSE, async (_event, answer: 'yes' | 'no') => {
    if (pendingGitInit) {
      const pending = pendingGitInit;
      setPendingGitInit(null);
      pending.resolve(answer);
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_REQUEST_DIFF, async (_event, requestId: string) => {
    if (!currentProjectDir || !requestStore) {
      return { ok: false, error: 'No project open' };
    }
    const request = requestStore.get(requestId);
    if (!request || !request.branchName || !request.baseBranch || !request.commitSha) {
      return { ok: false, error: 'Request has no diff available' };
    }
    try {
      const gm = new GitManager(currentProjectDir);
      const git = gm.getSimpleGitInstance();
      const diff = await computeRequestDiff(git, request.baseBranch, request.branchName);
      return { ok: true, diff };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACCEPT_REQUEST, async (_event, requestId: string) => {
    if (!currentProjectDir || !requestStore) {
      return { ok: false, error: 'No project open' };
    }
    const request = requestStore.get(requestId);
    if (!request) {
      return { ok: false, error: 'Request not found' };
    }
    if (request.status !== 'done') {
      return { ok: false, error: 'Only done requests can be accepted' };
    }
    if (!request.branchName || !request.baseBranch) {
      return { ok: false, error: 'Request has no isolated branch' };
    }
    const projectState = projectManager.getProjectState(currentProjectDir);
    const identity = settingsStore.resolveIdentityForProject(projectState);
    const gm = new GitManager(currentProjectDir);
    const result = await acceptRequest(
      gm.getSimpleGitInstance(),
      {
        branchName: request.branchName,
        baseBranch: request.baseBranch,
      },
      identity,
    );
    if (!result.ok) {
      if (result.conflict) {
        const note: GitRecoveryNote = {
          level: 'warning',
          message: `Cannot merge ${request.branchName} — conflicts with ${request.baseBranch}. Resolve manually: \`git checkout ${request.baseBranch} && git merge ${request.branchName}\``,
          requestId: request.id,
        };
        send(IPC_CHANNELS.GIT_RECOVERY_NOTE, note);
        return { ok: false, error: result.message, conflict: true };
      }
      return { ok: false, error: result.message };
    }
    const updated = requestStore.update(request.id, {
      mergedAt: result.mergedAt,
      branchName: null,
    });
    if (updated) send(IPC_CHANNELS.REQUEST_UPDATED, updated);
    return { ok: true, mergedAt: result.mergedAt };
  });

  ipcMain.handle(IPC_CHANNELS.REJECT_REQUEST, async (_event, requestId: string) => {
    if (!currentProjectDir || !requestStore) {
      return { ok: false, error: 'No project open' };
    }
    const request = requestStore.get(requestId);
    if (!request) {
      return { ok: false, error: 'Request not found' };
    }
    if (!request.branchName || !request.baseBranch) {
      return { ok: false, error: 'Request has no isolated branch' };
    }
    const gm = new GitManager(currentProjectDir);
    const result = await rejectRequest(gm.getSimpleGitInstance(), {
      branchName: request.branchName,
      baseBranch: request.baseBranch,
    });
    if (!result.ok) {
      return { ok: false, error: result.message };
    }
    const updated = requestStore.update(request.id, {
      status: 'cancelled',
      error: 'Rejected via diff review',
      branchName: null,
    });
    if (updated) send(IPC_CHANNELS.REQUEST_UPDATED, updated);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.UI_DESIGN_REVIEW_RESPONSE, async (_event, response: UIDesignReviewResponse) => {
    if (pendingUIReview) {
      pendingUIReview.resolve(response);
      setPendingUIReview(null);
    }
  });

  ipcMain.handle(IPC_CHANNELS.WARROOM_INTRO_DONE, async () => {
    if (pendingIntro) {
      pendingIntro.resolve();
      setPendingIntro(null);
    }
  });

  ipcMain.handle(IPC_CHANNELS.BUILD_INTRO_DONE, async () => {
    if (pendingBuildIntro) {
      pendingBuildIntro.resolve();
      setPendingBuildIntro(null);
      // Flip the renderer out of the "starting" override. handleStartBuild
      // transitioned the PhaseMachine to 'build'/'active' earlier and then
      // manually overrode to 'starting' so the KanbanBoard would show the
      // BuildIntro modal; now that the user has dismissed the intro, we need
      // to re-emit 'active' so the modal unmounts.
      send(IPC_CHANNELS.PHASE_CHANGE, { phase: 'build', status: 'active' } as PhaseInfo);
    }
  });

  ipcMain.handle(IPC_CHANNELS.BUILD_RESUME, async () => {
    if (!currentProjectDir || !lastBuildState) throw new Error('No build state to resume');
    if (!phaseMachine) ensurePhaseMachine();
    const config: BuildConfig = {
      modelPreset: 'default',
      retryLimit: 2,
      permissionMode: 'auto-all',
    };
    return handleStartBuild(config);
  });

  ipcMain.handle(IPC_CHANNELS.BUILD_RESTART, async (_event, config: BuildConfig) => {
    lastBuildState = null;
    if (!currentProjectDir) throw new Error('No project open');
    if (!phaseMachine) ensurePhaseMachine();
    return handleStartBuild(config);
  });

  // ── Logs ──

  ipcMain.handle(IPC_CHANNELS.FLUSH_LOGS, async (_event, logText: string) => {
    if (!currentProjectDir || !logText) return;
    const date = new Date().toISOString().slice(0, 10);
    const logPath = path.join(currentProjectDir, `session-${date}.log`);
    fs.appendFileSync(logPath, logText, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_FILE_IN_BROWSER, async (_event, relativePath: string) => {
    if (!currentProjectDir) {
      return { success: false, error: 'No project open' };
    }
    // Defense against path traversal: resolve and verify the result is inside projectDir
    const absPath = path.resolve(currentProjectDir, relativePath);
    const projectRoot = path.resolve(currentProjectDir);
    if (absPath !== projectRoot && !absPath.startsWith(projectRoot + path.sep)) {
      return { success: false, error: 'Path escapes project directory' };
    }
    if (!fs.existsSync(absPath)) {
      return { success: false, error: 'File not found' };
    }
    const result = await shell.openPath(absPath);
    if (result) {
      return { success: false, error: result };
    }
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.READ_RUN_MD, async () => {
    if (!currentProjectDir) return null;
    const runMdPath = path.join(currentProjectDir, 'docs', 'office', 'RUN.md');
    if (!fs.existsSync(runMdPath)) return null;
    try {
      return fs.readFileSync(runMdPath, 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_PROJECT_FILE_COUNT, async () => {
    if (!currentProjectDir) return 0;
    const EXCLUDE = new Set(['node_modules', '.git', '.the-office', 'dist', 'build', '.next', '.venv', '__pycache__']);
    let count = 0;
    function walk(dir: string): void {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (EXCLUDE.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          // Skip docs/office files from the count — they're our artifacts, not the app
          if (full.includes(path.join('docs', 'office'))) continue;
          count++;
        }
      }
    }
    try {
      walk(currentProjectDir);
    } catch {
      return 0;
    }
    return count;
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_PROJECT_FOLDER, async () => {
    if (!currentProjectDir) {
      return { success: false, error: 'No project open' };
    }
    const result = await shell.openPath(currentProjectDir);
    if (result) return { success: false, error: result };
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.COPY_TO_CLIPBOARD, async (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle(IPC_CHANNELS.GET_STATS_STATE, async (): Promise<StatsState | null> => {
    return statsCollector?.getState() ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.LIST_REQUESTS, async () => {
    if (!requestStore) return [];
    return requestStore.list();
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_REQUEST, async (_event, description: string) => {
    if (!currentProjectDir) return { success: false, error: 'No project open' };
    if (!requestStore) return { success: false, error: 'Request store not initialized' };

    // Reject if a request is already running
    const running = requestStore.list().find(
      r => r.status === 'queued' || r.status === 'in_progress',
    );
    if (running) {
      return { success: false, error: 'Another request is already running' };
    }

    // Create the request immediately with empty title
    const request = requestStore.create(description);
    send(IPC_CHANNELS.REQUEST_UPDATED, request);

    // Build a per-request permission handler
    const ph = new PermissionHandler(
      'auto-all',
      (req) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
      5 * 60 * 1000,
      WORKSHOP_GIT_DENY,
    );

    const projectStateForGit = projectManager.getProjectState(currentProjectDir);
    const gitContext: GitGateContext = {
      git: new GitManager(currentProjectDir),
      projectDir: currentProjectDir,
      gitInitChoice: projectStateForGit.gitInit ?? null,
      promptGitInit: () => new Promise<'yes' | 'no'>((resolve) => {
        setPendingGitInit({
          resolve: (answer) => {
            // Persist the answer so we never prompt again
            if (currentProjectDir) {
              projectManager.updateProjectState(currentProjectDir, { gitInit: answer });
            }
            resolve(answer);
          },
        });
        const payload: GitInitPromptPayload = { projectPath: currentProjectDir! };
        send(IPC_CHANNELS.GIT_INIT_PROMPT, payload);
      }),
      resolveIdentity: () => {
        if (!currentProjectDir) return null;
        const state = projectManager.getProjectState(currentProjectDir);
        return settingsStore.resolveIdentityForProject(state);
      },
    };

    // Run in background (don't await — the IPC returns immediately)
    runWorkshopRequest(request, {
      projectDir: currentProjectDir,
      agentsDir,
      env: authManager.getAuthEnv() || {},
      permissionHandler: ph,
      onEvent: onAgentEvent,
      onRequestUpdated: (updated: Request) => {
        requestStore?.update(updated.id, updated);
        send(IPC_CHANNELS.REQUEST_UPDATED, updated);
      },
      waitForPlanReview: (requestId, plan) =>
        new Promise<RequestPlanResponse>((resolve) => {
          setPendingRequestPlanReview({ requestId, resolve });
          const payload: RequestPlanReadyPayload = {
            requestId,
            title: request.title || request.description.slice(0, 60),
            plan,
          };
          send(IPC_CHANNELS.REQUEST_PLAN_READY, payload);
        }),
      gitContext,
    }).catch((err) => {
      console.error('[Workshop] Request failed:', err);
    });

    return { success: true, request };
  });

  ipcMain.handle(IPC_CHANNELS.RUN_ONBOARDING_SCAN, async () => {
    if (!currentProjectDir) return { success: false, error: 'No project open' };

    const currentState = projectManager.getProjectState(currentProjectDir);
    if (currentState.scanStatus === 'in_progress') {
      return { success: false, error: 'Scan already in progress' };
    }

    const ph = new PermissionHandler(
      'auto-all',
      (req) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
    );

    // Run in background (don't await — IPC returns immediately)
    runOnboardingScan({
      projectDir: currentProjectDir,
      agentsDir,
      env: authManager.getAuthEnv() || {},
      permissionHandler: ph,
      onEvent: onAgentEvent,
      onStatusChange: (status) => {
        if (!currentProjectDir) return;

        // Respect user intent: if current is 'skipped' and new status is 'done',
        // don't overwrite (the scan finished in background after the user skipped)
        const current = projectManager.getProjectState(currentProjectDir);
        if (current.scanStatus === 'skipped' && status === 'done') {
          return;
        }

        projectManager.updateProjectState(currentProjectDir, { scanStatus: status });
        const updated = projectManager.getProjectState(currentProjectDir);
        send(IPC_CHANNELS.PROJECT_STATE_CHANGED, updated);
      },
    }).catch((err) => {
      console.error('[Onboarding] Scan failed:', err);
    });

    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.SKIP_ONBOARDING_SCAN, async () => {
    if (!currentProjectDir) return;
    projectManager.updateProjectState(currentProjectDir, { scanStatus: 'skipped' });
    const updated = projectManager.getProjectState(currentProjectDir);
    send(IPC_CHANNELS.PROJECT_STATE_CHANGED, updated);
  });

  // Push stats to renderer periodically
  setInterval(() => {
    if (statsCollector) {
      statsCollector.flush();
      send(IPC_CHANNELS.STATS_STATE, statsCollector.getState());
    }
  }, 10_000);
}
