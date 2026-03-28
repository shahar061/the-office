import { ipcMain, shell } from 'electron';
import { randomUUID } from 'crypto';
import { IPC_CHANNELS } from '../../shared/types';
import type {
  AppSettings,
  BuildConfig,
  ChatMessage,
  PhaseInfo,
  PermissionRequest,
} from '../../shared/types';
import { PhaseMachine } from '../orchestrator/phase-machine';
import { PermissionHandler } from '../sdk/permission-handler';
import { runImagine } from '../orchestrator/imagine';
import { runWarroom } from '../orchestrator/warroom';
import { runBuild } from '../orchestrator/build';
import {
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
  setCurrentChatPhase,
  setCurrentChatAgentRole,
  setCurrentChatRunNumber,
  setPhaseMachine,
  setPermissionHandler,
} from './state';

export function initPhaseHandlers(): void {
  // ── Phases ──

  ipcMain.handle(IPC_CHANNELS.START_IMAGINE, async (_event, userIdea: string) => {
    if (!currentProjectDir) throw new Error('No project open');
    if (!authManager.isAuthenticated()) throw new Error('Not authenticated — connect via CLI or API key');

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

    pm.transition('imagine');

    const ph = new PermissionHandler(
      'auto-all',
      (req: PermissionRequest) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
    );
    setPermissionHandler(ph);

    try {
      await runImagine(userIdea, {
        projectDir: currentProjectDir,
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
  });

  ipcMain.handle(IPC_CHANNELS.START_WARROOM, async () => {
    if (!currentProjectDir) throw new Error('No project open');
    if (!phaseMachine) throw new Error('No phase machine — start imagine first');
    if (!authManager.isAuthenticated()) throw new Error('Not authenticated');

    setCurrentChatPhase('warroom');
    setCurrentChatAgentRole(null);
    setCurrentChatRunNumber(0);

    phaseMachine.transition('warroom');

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
        projectDir: currentProjectDir,
        agentsDir,
        env: authManager.getAuthEnv() || {},
        onEvent: onAgentEvent,
        onWaiting: handleAgentWaiting,
        onSystemMessage,
      });
      phaseMachine.markCompleted('warroom');
    } catch (err) {
      console.error('[Main] Warroom failed:', err);
      rejectPendingQuestions('Warroom phase failed');
      phaseMachine.markFailed();
    }
  });

  ipcMain.handle(IPC_CHANNELS.START_BUILD, async (_event, config: BuildConfig) => {
    if (!currentProjectDir) throw new Error('No project open');
    if (!phaseMachine) throw new Error('No phase machine — start imagine first');
    if (!authManager.isAuthenticated()) throw new Error('Not authenticated');

    setCurrentChatPhase('build');
    setCurrentChatAgentRole(null);
    setCurrentChatRunNumber(0);

    phaseMachine.transition('build');

    const ph = new PermissionHandler(
      config.permissionMode,
      (req: PermissionRequest) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
    );
    setPermissionHandler(ph);

    try {
      await runBuild({
        projectDir: currentProjectDir,
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
      phaseMachine.markCompleted('build');
      phaseMachine.transition('complete');
      phaseMachine.markCompleted('complete');
    } catch (err) {
      console.error('[Main] Build failed:', err);
      rejectPendingQuestions('Build phase failed');
      phaseMachine.markFailed();
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

  // ── Settings ──

  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async (): Promise<AppSettings> => {
    return {
      defaultModelPreset: 'default',
      defaultPermissionMode: 'auto-safe',
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
