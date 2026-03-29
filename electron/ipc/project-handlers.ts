import { ipcMain, dialog } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import type { Phase } from '../../shared/types';
import { ArtifactStore } from '../project/artifact-store';
import { ChatHistoryStore } from '../project/chat-history-store';
import {
  mainWindow,
  currentProjectDir,
  artifactStore,
  chatHistoryStore,
  projectManager,
  setCurrentProjectDir,
  setArtifactStore,
  setChatHistoryStore,
  resetSessionState,
} from './state';

export function initProjectHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_RECENT_PROJECTS, async () => {
    return projectManager.getRecentProjects();
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_PROJECT, async (_event, projectPath: string) => {
    try {
      resetSessionState();
      projectManager.openProject(projectPath);
      setCurrentProjectDir(projectPath);
      setArtifactStore(new ArtifactStore(projectPath));
      chatHistoryStore?.flush();
      setChatHistoryStore(new ChatHistoryStore(projectPath));
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
}
