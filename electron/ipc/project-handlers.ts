import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/types';
import type { Phase } from '../../shared/types';
import { ArtifactStore } from '../project/artifact-store';
import { ChatHistoryStore } from '../project/chat-history-store';
import { resumePhase, resumeWarroomAfterReview } from './phase-handlers';
import {
  mainWindow,
  currentProjectDir,
  artifactStore,
  chatHistoryStore,
  projectManager,
  pendingQuestions,
  setCurrentProjectDir,
  setArtifactStore,
  setChatHistoryStore,
  setCurrentChatPhase,
  setCurrentChatAgentRole,
  setCurrentChatRunNumber,
  resetSessionState,
  send,
  loadWaitingState,
  loadPendingReview,
  setPendingReview,
  dataDir,
} from './state';

export function initProjectHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_RECENT_PROJECTS, async () => {
    return projectManager.getRecentProjects();
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_PROJECT, async (_event, projectPath: string) => {
    try {
      // Read persisted waiting state BEFORE reset clears the file
      const saved = loadWaitingState(projectPath);

      resetSessionState();
      projectManager.openProject(projectPath);
      setCurrentProjectDir(projectPath);
      setArtifactStore(new ArtifactStore(projectPath));
      chatHistoryStore?.flush();
      const newChatStore = new ChatHistoryStore(projectPath);
      setChatHistoryStore(newChatStore);

      // Restore persisted waiting question (survives app restart)
      if (saved && saved.questions?.length) {
        // Set chat context so the USER_RESPONSE handler can persist the Q&A
        if (saved.phase) {
          setCurrentChatPhase(saved.phase);
          setCurrentChatAgentRole(saved.agentRole);
          const runNum = newChatStore.nextRunNumber(saved.phase, saved.agentRole);
          // Use the latest existing run (the one that asked the question), not a new one
          setCurrentChatRunNumber(Math.max(runNum - 1, 1));
        }

        // Register a pending entry that resumes the phase after the user answers
        const savedPhase = saved.phase ?? 'imagine';
        pendingQuestions.set(saved.sessionId, {
          resolve: () => { resumePhase(savedPhase as Phase); },
          reject: () => {},
        });

        // Emit after a tick so the renderer's listeners are ready
        setTimeout(() => send(IPC_CHANNELS.AGENT_WAITING, saved), 100);
      }

      // Restore persisted warroom plan review (survives app restart)
      const savedReview = loadPendingReview(projectPath);
      if (savedReview) {
        try {
          const store = new ArtifactStore(projectPath);
          const planContent = store.readArtifact('plan.md');

          // Register a pending review that resumes warroom after the user responds
          setPendingReview({
            resolve: (response) => { resumeWarroomAfterReview(response); },
          });

          // Re-emit review + war table state so the overlay reappears
          setTimeout(() => {
            send(IPC_CHANNELS.WAR_TABLE_STATE, 'review');
            send(IPC_CHANNELS.WAR_TABLE_REVIEW_READY, {
              content: planContent,
              artifact: savedReview.artifact,
            });
          }, 100);
        } catch {
          // plan.md missing — stale review state, ignore
        }
      }

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to open project';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_PROJECT, async (_event, name: string, projectPath: string) => {
    try {
      resetSessionState();
      projectManager.createProject(name, projectPath);
      setCurrentProjectDir(projectPath);
      setArtifactStore(new ArtifactStore(projectPath));
      chatHistoryStore?.flush();
      setChatHistoryStore(new ChatHistoryStore(projectPath));
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PICK_DIRECTORY, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.GET_PROJECT_STATE, async () => {
    if (!currentProjectDir) {
      return { name: '', path: '', currentPhase: 'idle', completedPhases: [], interrupted: false, introSeen: true };
    }
    return projectManager.getProjectState(currentProjectDir);
  });

  ipcMain.handle(IPC_CHANNELS.MARK_INTRO_SEEN, async () => {
    if (!currentProjectDir) throw new Error('No project open');
    projectManager.updateProjectState(currentProjectDir, { introSeen: true });
  });

  // ── Chat History ──

  ipcMain.handle(IPC_CHANNELS.GET_CHAT_HISTORY, async (_event, phase: string) => {
    if (!currentProjectDir || !chatHistoryStore) return [];
    return chatHistoryStore.getPhaseHistory(phase as Phase);
  });

  // ── Artifacts ──

  ipcMain.handle(IPC_CHANNELS.READ_ARTIFACT, async (_event, filename: string) => {
    if (!artifactStore) return { error: 'No project open' };
    try {
      const content = artifactStore.readArtifact(filename);
      return { content };
    } catch {
      return { error: 'Artifact not found' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_ARTIFACT_STATUS, async () => {
    if (!artifactStore) return {};
    const filenames = ['01-vision-brief.md', '02-prd.md', '03-market-analysis.md', '04-system-design.md'];
    const status: Record<string, boolean> = {};
    for (const f of filenames) {
      try {
        artifactStore.readArtifact(f);
        status[f] = true;
      } catch {
        status[f] = false;
      }
    }
    return status;
  });

  // ── Layouts ──

  ipcMain.handle(IPC_CHANNELS.GET_LAYOUTS, async () => {
    const layoutsPath = path.join(dataDir, 'layouts.json');
    try {
      if (fs.existsSync(layoutsPath)) {
        return JSON.parse(fs.readFileSync(layoutsPath, 'utf-8'));
      }
    } catch {
      // Corrupted file — return null to use defaults
    }
    return null;
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_LAYOUTS, async (_event, layouts: Record<string, unknown>) => {
    const layoutsPath = path.join(dataDir, 'layouts.json');
    fs.writeFileSync(layoutsPath, JSON.stringify(layouts, null, 2), 'utf-8');
  });
}
