import { ipcMain, shell } from 'electron';
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
  WarTableCard,
  WarTableVisualState,
  WarTableChoreographyPayload,
  WarTableReviewPayload,
  WarTableReviewResponse,
} from '../../shared/types';
import { PhaseMachine } from '../orchestrator/phase-machine';
import { PermissionHandler } from '../sdk/permission-handler';
import { ArtifactStore } from '../project/artifact-store';
import { runImagine } from '../orchestrator/imagine';
import { runWarroom } from '../orchestrator/warroom';
import { runBuild } from '../orchestrator/build';
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
  pendingIntro,
  setPendingIntro,
} from './state';

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

async function handleStartImagine(userIdea: string): Promise<void> {
  setCurrentChatPhase('imagine');
  setCurrentChatAgentRole('ceo');
  setCurrentChatRunNumber(chatHistoryStore?.nextRunNumber('imagine', 'ceo') ?? 1);

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

  const state = projectManager.getProjectState(currentProjectDir!);
  const pm = new PhaseMachine(state.currentPhase, state.completedPhases);
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
    });
    pm.markCompleted('imagine');
  } catch (err: any) {
    console.error('[Main] Imagine failed:', err);
    const errMsg = err.stderr || err.message || 'Unknown error';
    sendChat({ role: 'agent', text: `Error starting /imagine: ${errMsg}` });
    rejectPendingQuestions('Imagine phase failed');
    pm.markFailed();
  }
}

async function handleStartWarroom(): Promise<void> {
  setCurrentChatPhase('warroom');
  setCurrentChatAgentRole(null);
  setCurrentChatRunNumber(0);

  phaseMachine!.transition('warroom');

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
        });
      },
      waitForIntro: () => {
        return new Promise<void>((resolve) => {
          setPendingIntro({ resolve });
        });
      },
      getSettings: async (): Promise<AppSettings> => ({
        defaultModelPreset: 'default',
        defaultPermissionMode: 'auto-safe',
        maxParallelTLs: 4,
      }),
    });
    phaseMachine!.markCompleted('warroom');
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Main] Warroom failed:', err);
    onSystemMessage(`Warroom failed: ${errMsg}`);
    rejectPendingQuestions('Warroom phase failed');
    setPendingReview(null);
    phaseMachine!.markFailed();
  }
}

async function handleStartBuild(config: BuildConfig): Promise<void> {
  setCurrentChatPhase('build');
  setCurrentChatAgentRole(null);
  setCurrentChatRunNumber(0);

  phaseMachine!.transition('build');

  const ph = new PermissionHandler(
    config.permissionMode,
    (req: PermissionRequest) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
  );
  setPermissionHandler(ph);

  try {
    await runBuild({
      projectDir: currentProjectDir!,
      agentsDir,
      apiKey: authManager.getApiKey() || '',
      authEnv: authManager.getAuthEnv(),
      permissionHandler: ph,
      buildConfig: config,
      onEvent: onAgentEvent,
      onKanbanUpdate: (state) => send(IPC_CHANNELS.KANBAN_UPDATE, state),
      onWaiting: handleAgentWaiting,
      onSystemMessage,
    });
    phaseMachine!.markCompleted('build');
    phaseMachine!.transition('complete');
    phaseMachine!.markCompleted('complete');
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Main] Build failed:', err);
    onSystemMessage(`Build failed: ${errMsg}`);
    rejectPendingQuestions('Build phase failed');
    phaseMachine!.markFailed();
  }
}

/** Create a PhaseMachine from persisted project state (for app restart scenarios). */
function ensurePhaseMachine(): void {
  if (phaseMachine || !currentProjectDir) return;
  const state = projectManager.getProjectState(currentProjectDir);
  const pm = new PhaseMachine(state.currentPhase, state.completedPhases);
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
    rejectPendingQuestions('Phase restart');
    setPendingReview(null);

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
    if (pendingReview) {
      pendingReview.resolve(response);
      setPendingReview(null);
    }
  });

  ipcMain.handle(IPC_CHANNELS.WARROOM_INTRO_DONE, async () => {
    if (pendingIntro) {
      pendingIntro.resolve();
      setPendingIntro(null);
    }
  });

  // ── Logs ──

  ipcMain.handle(IPC_CHANNELS.FLUSH_LOGS, async (_event, logText: string) => {
    if (!currentProjectDir || !logText) return;
    const date = new Date().toISOString().slice(0, 10);
    const logPath = path.join(currentProjectDir, `session-${date}.log`);
    fs.appendFileSync(logPath, logText, 'utf-8');
  });

  // ── Settings ──

  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async (): Promise<AppSettings> => {
    return {
      defaultModelPreset: 'default',
      defaultPermissionMode: 'auto-safe',
      maxParallelTLs: 4,
    };
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, async (_event, _settings: AppSettings) => {
    // Placeholder — will persist to disk in a future iteration
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
    }
  });
}
