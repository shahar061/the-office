import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { IPC_CHANNELS } from '../shared/types';
import type {
  AgentEvent,
  AgentRole,
  AgentWaitingPayload,
  AskQuestion,
  AppSettings,
  BuildConfig,
  ChatMessage,
  PhaseInfo,
  PermissionRequest,
  SessionStats,
} from '../shared/types';
import { ArtifactStore } from './project/artifact-store';
import { AuthManager } from './auth/auth-manager';
import { ProjectManager } from './project/project-manager';
import { PhaseMachine } from './orchestrator/phase-machine';
import { PermissionHandler } from './sdk/permission-handler';
import { runImagine } from './orchestrator/imagine';
import { runWarroom } from './orchestrator/warroom';
import { runBuild } from './orchestrator/build';

// ── State ──

let mainWindow: BrowserWindow | null = null;

const dataDir = path.join(app.getPath('userData'), 'the-office');
const authManager = new AuthManager(dataDir);
const projectManager = new ProjectManager(dataDir);
const agentsDir = path.join(__dirname, '../../agents');

let currentProjectDir: string | null = null;
let artifactStore: ArtifactStore | null = null;
let phaseMachine: PhaseMachine | null = null;
let permissionHandler: PermissionHandler | null = null;
let activeAbort: (() => void) | null = null;

const sessionStats: SessionStats = {
  totalCost: 0,
  totalTokens: 0,
  sessionTime: 0,
  activeAgents: 0,
};

// Pending AskUserQuestion promises, keyed by session ID
interface PendingQuestion {
  resolve: (answers: Record<string, string>) => void;
  reject: (error: Error) => void;
}
const pendingQuestions = new Map<string, PendingQuestion>();
let nextSessionId = 0;

// ── Helpers ──

function send(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function sendChat(msg: Omit<ChatMessage, 'id' | 'timestamp'>): void {
  const chatMsg: ChatMessage = {
    id: randomUUID(),
    timestamp: Date.now(),
    ...msg,
  };
  send(IPC_CHANNELS.CHAT_MESSAGE, chatMsg);
}

function onAgentEvent(event: AgentEvent): void {
  send(IPC_CHANNELS.AGENT_EVENT, event);

  // Extract chat messages from agent:message events
  if (event.type === 'agent:message' && event.message) {
    sendChat({
      role: 'agent',
      agentRole: event.agentRole,
      text: event.message,
    });
  }

  // Extract cost updates for stats
  if (event.type === 'session:cost:update') {
    if (event.cost !== undefined) sessionStats.totalCost += event.cost;
    if (event.tokens !== undefined) sessionStats.totalTokens += event.tokens;
    send(IPC_CHANNELS.STATS_UPDATE, { ...sessionStats });
  }
}

function handleAgentWaiting(agentRole: AgentRole, questions: AskQuestion[]): Promise<Record<string, string>> {
  return new Promise<Record<string, string>>((resolve, reject) => {
    const sessionId = `session-${++nextSessionId}`;
    pendingQuestions.set(sessionId, { resolve, reject });

    const payload: AgentWaitingPayload = { sessionId, agentRole, questions };
    send(IPC_CHANNELS.AGENT_WAITING, payload);
  });
}

function onSystemMessage(text: string): void {
  sendChat({ role: 'system', text });
}

function rejectPendingQuestions(reason: string): void {
  for (const [id, pending] of pendingQuestions) {
    pending.reject(new Error(reason));
  }
  pendingQuestions.clear();
}

// ── Window ──

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'The Office',
    backgroundColor: '#0f0f1a',
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC Setup ──

function setupIPC(): void {
  // ── Auth ──

  ipcMain.handle(IPC_CHANNELS.GET_AUTH_STATUS, async () => {
    return authManager.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.CONNECT_API_KEY, async (_event, key: string) => {
    const result = authManager.connectApiKey(key);
    if (result.success) {
      send(IPC_CHANNELS.AUTH_STATUS_CHANGE, authManager.getStatus());
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.DISCONNECT, async () => {
    authManager.disconnect();
    send(IPC_CHANNELS.AUTH_STATUS_CHANGE, authManager.getStatus());
  });

  // ── Projects ──

  ipcMain.handle(IPC_CHANNELS.GET_RECENT_PROJECTS, async () => {
    return projectManager.getRecentProjects();
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_PROJECT, async (_event, projectPath: string) => {
    try {
      projectManager.openProject(projectPath);
      currentProjectDir = projectPath;
      artifactStore = new ArtifactStore(projectPath);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to open project';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_PROJECT, async (_event, name: string, projectPath: string) => {
    try {
      projectManager.createProject(name, projectPath);
      currentProjectDir = projectPath;
      artifactStore = new ArtifactStore(projectPath);
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
      return { name: '', path: '', currentPhase: 'idle', completedPhases: [], interrupted: false };
    }
    return projectManager.getProjectState(currentProjectDir);
  });

  // ── Phases ──

  ipcMain.handle(IPC_CHANNELS.START_IMAGINE, async (_event, userIdea: string) => {
    if (!currentProjectDir) throw new Error('No project open');
    if (!authManager.isAuthenticated()) throw new Error('Not authenticated — connect via CLI or API key');

    sendChat({ role: 'agent', agentRole: 'ceo', text: 'Starting the /imagine phase... gathering the team.' });

    const state = projectManager.getProjectState(currentProjectDir);
    phaseMachine = new PhaseMachine(state.currentPhase, state.completedPhases);
    phaseMachine.on('change', (info: PhaseInfo) => {
      send(IPC_CHANNELS.PHASE_CHANGE, info);
      if (currentProjectDir) {
        projectManager.updateProjectState(currentProjectDir, {
          currentPhase: info.phase,
          completedPhases: phaseMachine!.completedPhases,
        });
      }
    });

    phaseMachine.transition('imagine');

    permissionHandler = new PermissionHandler(
      'auto-all',
      (req: PermissionRequest) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
    );

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
      phaseMachine.markCompleted('imagine');
    } catch (err: any) {
      console.error('[Main] Imagine failed:', err);
      const errMsg = err.stderr || err.message || 'Unknown error';
      sendChat({ role: 'agent', text: `Error starting /imagine: ${errMsg}` });
      rejectPendingQuestions('Imagine phase failed');
      phaseMachine.markFailed();
    }
  });

  ipcMain.handle(IPC_CHANNELS.START_WARROOM, async () => {
    if (!currentProjectDir) throw new Error('No project open');
    if (!phaseMachine) throw new Error('No phase machine — start imagine first');
    if (!authManager.isAuthenticated()) throw new Error('Not authenticated');

    phaseMachine.transition('warroom');

    if (!permissionHandler) {
      permissionHandler = new PermissionHandler(
        'auto-all',
        (req: PermissionRequest) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
      );
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

    phaseMachine.transition('build');

    permissionHandler = new PermissionHandler(
      config.permissionMode,
      (req: PermissionRequest) => send(IPC_CHANNELS.PERMISSION_REQUEST, req),
    );

    try {
      await runBuild({
        projectDir: currentProjectDir,
        agentsDir,
        apiKey: authManager.getApiKey() || '',
        authEnv: authManager.getAuthEnv(),
        permissionHandler: permissionHandler!,
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

// ── App Lifecycle ──

// Fix PATH for macOS — ensure Node 20+ is first in PATH.
// The Agent SDK's cli.js uses `using` declarations requiring Node 20+.
function fixPath(): void {
  if (process.platform !== 'darwin') return;

  const homeDir = process.env.HOME || '';

  // Find the newest Node 20+ from nvm
  const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node');
  try {
    const fs = require('fs');
    if (fs.existsSync(nvmDir)) {
      const versions = fs.readdirSync(nvmDir)
        .filter((v: string) => {
          const major = parseInt(v.replace('v', '').split('.')[0], 10);
          return major >= 20;
        })
        .sort((a: string, b: string) => {
          // Sort descending by major version
          const ma = parseInt(a.replace('v', '').split('.')[0], 10);
          const mb = parseInt(b.replace('v', '').split('.')[0], 10);
          return mb - ma;
        });

      if (versions.length > 0) {
        const nvmNodeBin = path.join(nvmDir, versions[0], 'bin');
        // Prepend nvm Node 20+ to PATH so it's found first
        process.env.PATH = `${nvmNodeBin}:${process.env.PATH}`;
        console.log(`[Main] Prepended nvm Node ${versions[0]} to PATH`);
      }
    }
  } catch (err) {
    console.warn('[Main] Could not check nvm versions:', err);
  }

  // Verify
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();
    const major = parseInt(nodeVersion.replace('v', '').split('.')[0], 10);
    console.log('[Main] System Node:', nodeVersion);
    if (major < 20) {
      console.error(`[Main] WARNING: Node ${nodeVersion} still in PATH. Agent SDK requires Node 20+.`);
    }
  } catch {
    console.error('[Main] WARNING: Could not detect Node version');
  }
}

app.whenReady().then(async () => {
  fixPath();
  createWindow();
  setupIPC();
  // Detect CLI auth on startup and notify renderer
  await authManager.detectCliAuth();
  send(IPC_CHANNELS.AUTH_STATUS_CHANGE, authManager.getStatus());
});

app.on('window-all-closed', () => {
  // Mark interrupted if a phase is active
  if (phaseMachine && phaseMachine.currentPhase !== 'idle' && phaseMachine.currentPhase !== 'complete') {
    phaseMachine.markInterrupted();
    if (currentProjectDir) {
      projectManager.updateProjectState(currentProjectDir, { interrupted: true });
    }
  }

  // Abort any running SDK sessions
  if (activeAbort) {
    activeAbort();
    activeAbort = null;
  }

  // Reject any pending AskUserQuestion promises
  rejectPendingQuestions('App closing');

  app.quit();
});
