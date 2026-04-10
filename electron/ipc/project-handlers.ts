import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/types';
import type { Phase } from '../../shared/types';
import { ArtifactStore } from '../project/artifact-store';
import { ChatHistoryStore } from '../project/chat-history-store';
import { RequestStore } from '../project/request-store';
import { ProjectScanner } from '../project/project-scanner';
import { resumePhase, resumeWarroomAfterReview, resumeAwaitingReview } from './phase-handlers';
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
  setRequestStore,
  requestStore,
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
      setRequestStore(new RequestStore(projectPath));
      chatHistoryStore?.flush();
      const newChatStore = new ChatHistoryStore(projectPath);
      setChatHistoryStore(newChatStore);

      // Sub-project 3: resume any awaiting_review requests with a persisted plan
      if (requestStore) {
        const awaitingReview = requestStore.list().filter(
          (r) => r.status === 'awaiting_review' && r.plan,
        );
        for (const req of awaitingReview) {
          resumeAwaitingReview(req);
        }
      }

      // Auto-enter workshop mode for already-completed projects
      const openedState = projectManager.getProjectState(projectPath);

      // Crash recovery: reset in_progress scans so they retry
      if (openedState.scanStatus === 'in_progress') {
        projectManager.updateProjectState(projectPath, { scanStatus: 'pending' });
      }

      if (openedState.completedPhases?.includes('build') && openedState.mode !== 'workshop') {
        projectManager.updateProjectState(projectPath, {
          mode: 'workshop',
          scanStatus: 'done', // rely on imagine artifacts instead of a scan
        });
      }

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
      setRequestStore(new RequestStore(projectPath));
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

  ipcMain.handle(IPC_CHANNELS.CHECK_PROJECT_EXISTS, async (_event, projectPath: string) => {
    try {
      if (!fs.existsSync(projectPath)) {
        return { exists: false, fileCount: 0 };
      }
      const configPath = path.join(projectPath, '.the-office', 'config.json');
      if (fs.existsSync(configPath)) {
        return { exists: true, fileCount: 0 };
      }
      // Count non-trivial files so the "start fresh" modal can decide
      // whether to show its second confirmation
      const scanner = new ProjectScanner(projectPath);
      const tree = scanner.getFileTree(500);
      const TRIVIAL = new Set(['.DS_Store', '.gitignore', 'LICENSE', 'README.md']);
      const lines = tree.split('\n').filter(l => l && !l.startsWith('...'));
      const significantFiles = lines.filter(l => {
        const base = path.basename(l);
        return !TRIVIAL.has(base);
      });
      return { exists: false, fileCount: significantFiles.length };
    } catch (err) {
      console.error('[CHECK_PROJECT_EXISTS] Error:', err);
      return { exists: false, fileCount: 0 };
    }
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_DIRECTORY_AS_WORKSHOP, async (_event, projectPath: string) => {
    try {
      if (!fs.existsSync(projectPath)) {
        return { success: false, error: 'Directory does not exist' };
      }

      // Create minimal .the-office/config.json in Workshop mode
      const officeDir = path.join(projectPath, '.the-office');
      if (!fs.existsSync(officeDir)) {
        fs.mkdirSync(officeDir, { recursive: true });
      }
      const configPath = path.join(officeDir, 'config.json');
      const initialState = {
        name: path.basename(projectPath),
        path: projectPath,
        currentPhase: 'idle' as const,
        completedPhases: [],
        interrupted: false,
        introSeen: true,
        buildIntroSeen: false,
        mode: 'workshop' as const,
        scanStatus: 'pending' as const,
      };
      fs.writeFileSync(configPath, JSON.stringify(initialState, null, 2), 'utf-8');

      // Add to recent projects
      projectManager.addToRecentProjects(initialState.name, projectPath, null);

      // Proceed with the normal open flow (reuse the OPEN_PROJECT setup logic)
      resetSessionState();
      projectManager.openProject(projectPath);
      setCurrentProjectDir(projectPath);
      setArtifactStore(new ArtifactStore(projectPath));
      setRequestStore(new RequestStore(projectPath));
      chatHistoryStore?.flush();
      setChatHistoryStore(new ChatHistoryStore(projectPath));

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to open directory';
      return { success: false, error: message };
    }
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
