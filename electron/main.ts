import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { SessionManager } from './session-manager';
import { ClaudeCodeTranscriptAdapter } from './adapters/claude-transcript.adapter';
import { OpenCodeAdapter } from './adapters/opencode.adapter';
import { IPC_CHANNELS } from '../shared/types';
import type { ConnectionStatus } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'The Office',
    backgroundColor: '#0f0f1a',
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

function setupAdapters() {
  const projectDir = process.cwd();

  const adapters = [
    new ClaudeCodeTranscriptAdapter(),
    new OpenCodeAdapter(),
  ];

  sessionManager = new SessionManager(adapters);

  sessionManager.on('agentEvent', (event) => {
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.AGENT_EVENT, event);
    }
  });

  sessionManager.start({ projectDir });

  const status: ConnectionStatus = {
    claudeCode: 'connected',
    openCode: 'connected',
  };

  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.CONNECTION_STATUS, status);
  }
}

function setupIPC() {
  ipcMain.handle(IPC_CHANNELS.DISPATCH, async (_event, prompt: string) => {
    // TODO: Implement SDK adapter dispatch
    console.log('Dispatch requested:', prompt);
    return { sessionId: `session-${Date.now()}` };
  });

  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, async () => {
    return sessionManager?.getActiveSessions() ?? [];
  });

  ipcMain.handle(IPC_CHANNELS.APPROVE_PERMISSION, async (_event, agentId: string, toolId: string) => {
    // TODO: Implement permission approval
    console.log('Permission approved:', agentId, toolId);
  });

  ipcMain.handle(IPC_CHANNELS.DENY_PERMISSION, async (_event, agentId: string, toolId: string) => {
    // TODO: Implement permission denial
    console.log('Permission denied:', agentId, toolId);
  });

  ipcMain.handle(IPC_CHANNELS.GET_KANBAN, async () => {
    // TODO: Implement Kanban state retrieval
    return {
      projectName: 'The Office',
      currentPhase: 'imagine',
      completionPercent: 0,
      tasks: [],
    };
  });
}

app.whenReady().then(() => {
  createWindow();
  setupIPC();
  setupAdapters();
});

app.on('window-all-closed', () => {
  sessionManager?.stop();
  app.quit();
});