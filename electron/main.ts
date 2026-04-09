import { app, BrowserWindow } from 'electron';
import path from 'path';
import { execSync } from 'child_process';
import { IPC_CHANNELS } from '../shared/types';
import {
  authManager,
  mainWindow,
  currentProjectDir,
  activeAbort,
  chatHistoryStore,
  phaseMachine,
  projectManager,
  send,
  rejectPendingQuestions,
  setMainWindow,
  setActiveAbort,
} from './ipc/state';
import { initAuthHandlers } from './ipc/auth-handlers';
import { initProjectHandlers } from './ipc/project-handlers';
import { initPhaseHandlers } from './ipc/phase-handlers';

// ── Suppress noisy Chromium/macOS warnings from stderr ──
// These are harmless but spam the console (~30 lines per menu interaction):
//   - "representedObject is not a WeakPtrToElectronMenuModelAsNSObject" (macOS Electron menu bug)
//   - "SharedImageManager::ProduceOverlay ... non-existent mailbox" (transient GPU resource)
const SUPPRESSED_PATTERNS = [
  'representedObject is not a WeakPtrToElectronMenuModelAsNSObject',
  'SharedImageManager::ProduceOverlay',
  'Invalid mailbox',
];
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk: any, ...args: any[]): boolean => {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();
  if (SUPPRESSED_PATTERNS.some((p) => str.includes(p))) return true;
  return (originalStderrWrite as any)(chunk, ...args);
};

// ── Window ──

function createWindow(): void {
  const win = new BrowserWindow({
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
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.on('closed', () => {
    setMainWindow(null);
  });

  setMainWindow(win);
}

// ── Fix PATH for macOS ──

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
          const ma = parseInt(a.replace('v', '').split('.')[0], 10);
          const mb = parseInt(b.replace('v', '').split('.')[0], 10);
          return mb - ma;
        });

      if (versions.length > 0) {
        const nvmNodeBin = path.join(nvmDir, versions[0], 'bin');
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

// ── App Lifecycle ──

app.whenReady().then(async () => {
  fixPath();
  createWindow();
  initAuthHandlers();
  initProjectHandlers();
  initPhaseHandlers();
  // Detect CLI auth on startup and notify renderer
  await authManager.detectCliAuth();
  send(IPC_CHANNELS.AUTH_STATUS_CHANGE, authManager.getStatus());
});

app.on('window-all-closed', () => {
  chatHistoryStore?.flush();

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
    setActiveAbort(null);
  }

  // Reject any pending AskUserQuestion promises
  rejectPendingQuestions('App closing');

  app.quit();
});
