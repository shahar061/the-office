import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { SessionManager } from './session-manager';
import { ClaudeCodeTranscriptAdapter } from './adapters/claude-transcript.adapter';
import { OpenCodeAdapter } from './adapters/opencode.adapter';
import { IPC_CHANNELS } from '../shared/types';
import type { ConnectionStatus, SessionListItem } from '../shared/types';
import { loadSettings, saveSettings, detectTerminals, browseTerminalApp } from './settings';
import type { AppSettings } from '../shared/types';
// exec removed — using spawn for osascript

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;
let windowReady = false;
let pendingSession: { tool: string; directory: string; terminalId?: string; createdAt: number } | null = null;
let linkedSessionId: string | null = null;
let dispatchInFlight = false;
let linkingTimer: ReturnType<typeof setTimeout> | null = null;
const activeProcesses = new Set<ChildProcess>();
let claudeTerminalLaunched = false;

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
    windowReady = false;
  });

  windowReady = true;
}

function setupAdapters() {
  const projectDir = process.cwd();
  console.log('[Main] Setting up adapters for project:', projectDir);

  const adapters = [
    new ClaudeCodeTranscriptAdapter(),
    new OpenCodeAdapter(),
  ];

  sessionManager = new SessionManager(adapters);

  sessionManager.on('agentEvent', (event) => {
    console.log('[Main] Agent event:', event.type, event.agentId);
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.AGENT_EVENT, event);
    }
  });

  sessionManager.on('sessionListUpdate', (sessions: SessionListItem[]) => {
    if (mainWindow && windowReady) {
      mainWindow.webContents.send(IPC_CHANNELS.SESSION_LIST_UPDATE, sessions);
    }

    // Session linking: match new session to pending config
    if (pendingSession && !linkedSessionId && dispatchInFlight) {
      const match = sessions.find(s =>
        s.directory === pendingSession!.directory &&
        s.createdAt > pendingSession!.createdAt - 2000
      );
      if (match) {
        linkedSessionId = match.sessionId;
        dispatchInFlight = false;
        if (linkingTimer) { clearTimeout(linkingTimer); linkingTimer = null; }
        console.log('[Main] Session linked:', match.sessionId, match.title);
        if (mainWindow) {
          mainWindow.webContents.send(IPC_CHANNELS.SESSION_LINKED, {
            sessionId: match.sessionId,
            title: match.title,
          });
        }
      }
    }
  });

  sessionManager.start({ projectDir }).catch(err => console.error('[Main] Failed to start adapters:', err));

  const status: ConnectionStatus = {
    claudeCode: 'connected',
    openCode: 'connected',
  };

  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.CONNECTION_STATUS, status);
  }
  console.log('[Main] Adapters initialized and event forwarding active');
}

function spawnOpenCode(args: string[]): void {
  console.log('[Main] Spawning: opencode', args.join(' '));
  const child = spawn('opencode', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  activeProcesses.add(child);

  child.stdout?.on('data', (data: Buffer) => {
    console.log('[OpenCode stdout]', data.toString().trim());
  });

  child.stderr?.on('data', (data: Buffer) => {
    console.error('[OpenCode stderr]', data.toString().trim());
  });

  child.on('error', (err) => {
    console.error('[Main] opencode spawn error:', err.message);
    activeProcesses.delete(child);
    dispatchInFlight = false;
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.DISPATCH_ERROR, {
        error: err.message,
      });
    }
  });

  child.on('exit', (code) => {
    activeProcesses.delete(child);
    if (code !== 0 && code !== null) {
      console.error('[Main] opencode exited with code:', code);
      dispatchInFlight = false;
      if (mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.DISPATCH_ERROR, {
          error: `opencode exited with code ${code}`,
        });
      }
    }
  });
}

function setupIPC() {
  ipcMain.handle(IPC_CHANNELS.DISPATCH, async (_event, prompt: string) => {
    console.log('[Main] DISPATCH called, tool:', pendingSession?.tool, 'prompt:', prompt.slice(0, 50));
    if (!pendingSession) return { error: 'no-session' };

    // ── Claude Code path: open Terminal window ──
    if (pendingSession.tool === 'claude-code') {
      if (!claudeTerminalLaunched) {
        claudeTerminalLaunched = true;
        const dir = pendingSession.directory.replace(/'/g, "'\\''");
        const cmd = `cd '${dir}' && claude`;
        const child = spawn('osascript', [
          '-e', 'tell application "Terminal"',
          '-e', 'activate',
          '-e', `do script ${JSON.stringify(cmd)}`,
          '-e', 'end tell',
        ]);
        child.on('error', handleTerminalError);
        child.on('exit', (code) => { if (code !== 0) handleTerminalError(new Error(`osascript exit ${code}`)); });
        function handleTerminalError(err: Error) {
          console.error('[Main] Failed to open Terminal:', err.message);
          if (mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.DISPATCH_ERROR, { error: err.message });
          }
          claudeTerminalLaunched = false;
        }
        console.log('[Main] Opening Terminal with claude in:', pendingSession.directory);
      }
      // Session linking happens via ClaudeCodeTranscriptAdapter (file watching)
      // when claude creates its transcript file in ~/.claude/projects/
      return { sessionId: linkedSessionId ?? 'pending' };
    }

    // ── OpenCode path (unchanged) ──
    if (linkedSessionId) {
      const args = ['run', prompt, '--session', linkedSessionId, '--dir', pendingSession.directory, '--format', 'json'];
      spawnOpenCode(args);
      return { sessionId: linkedSessionId };
    }

    if (!dispatchInFlight) {
      dispatchInFlight = true;
      const args = ['run', prompt, '--dir', pendingSession.directory, '--format', 'json'];
      spawnOpenCode(args);

      linkingTimer = setTimeout(() => {
        if (!linkedSessionId && mainWindow) {
          mainWindow.webContents.send(IPC_CHANNELS.SESSION_LINK_FAILED, {
            error: 'Timed out waiting for session to appear',
          });
          dispatchInFlight = false;
        }
      }, 30_000);

      return { sessionId: 'pending' };
    }

    if (dispatchInFlight) {
      return { error: 'session-starting' };
    }

    return { error: 'no-session' };
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

  ipcMain.handle(IPC_CHANNELS.PICK_DIRECTORY, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_event, tool: string, directory: string, terminalId?: string) => {
    pendingSession = { tool, directory, terminalId, createdAt: Date.now() };
    linkedSessionId = null;
    dispatchInFlight = false;
    if (linkingTimer) { clearTimeout(linkingTimer); linkingTimer = null; }
    console.log('[Main] Session created:', { tool, directory });
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async () => {
    return loadSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, async (_event, settings: AppSettings) => {
    saveSettings(settings);
  });

  ipcMain.handle(IPC_CHANNELS.DETECT_TERMINALS, async () => {
    const current = loadSettings();
    return detectTerminals(current.terminals);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSE_TERMINAL_APP, async () => {
    if (!mainWindow) return null;
    return browseTerminalApp(mainWindow);
  });

  ipcMain.handle(IPC_CHANNELS.CANCEL_SESSION, async () => {
    console.log('[Main] Session cancelled');
    claudeTerminalLaunched = false;
    for (const proc of activeProcesses) {
      proc.kill();
    }
    activeProcesses.clear();
    pendingSession = null;
    linkedSessionId = null;
    dispatchInFlight = false;
    if (linkingTimer) { clearTimeout(linkingTimer); linkingTimer = null; }
  });
}

app.whenReady().then(() => {
  createWindow();
  setupIPC();
  setupAdapters();
});

app.on('window-all-closed', () => {
  for (const proc of activeProcesses) {
    proc.kill();
  }
  activeProcesses.clear();
  if (linkingTimer) clearTimeout(linkingTimer);
  sessionManager?.stop();
  app.quit();
});