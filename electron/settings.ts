import fs from 'fs';
import path from 'path';
import { app, dialog, BrowserWindow } from 'electron';
import type { TerminalConfig, AppSettings } from '../shared/types';

const DEFAULT_TERMINAL: TerminalConfig = {
  id: 'terminal',
  name: 'Terminal',
  path: '/System/Applications/Utilities/Terminal.app',
  isBuiltIn: true,
};

const DEFAULT_SETTINGS: AppSettings = {
  terminals: [DEFAULT_TERMINAL],
  defaultTerminalId: 'terminal',
};

const KNOWN_TERMINALS: { name: string; appName: string }[] = [
  { name: 'iTerm2', appName: 'iTerm.app' },
  { name: 'Warp', appName: 'Warp.app' },
  { name: 'Kitty', appName: 'kitty.app' },
  { name: 'Alacritty', appName: 'Alacritty.app' },
  { name: 'Hyper', appName: 'Hyper.app' },
  { name: 'WezTerm', appName: 'WezTerm.app' },
];

export function slugify(name: string): string {
  return name
    .replace(/\.app$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettingsFromPath(filePath: string): AppSettings {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as AppSettings;
    if (!Array.isArray(data.terminals) || !data.defaultTerminalId) {
      return { ...DEFAULT_SETTINGS, terminals: [...DEFAULT_SETTINGS.terminals] };
    }
    return data;
  } catch {
    return { ...DEFAULT_SETTINGS, terminals: [...DEFAULT_SETTINGS.terminals] };
  }
}

export function saveSettingsToPath(filePath: string, settings: AppSettings): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
}

export function loadSettings(): AppSettings {
  return loadSettingsFromPath(getSettingsPath());
}

export function saveSettings(settings: AppSettings): void {
  saveSettingsToPath(getSettingsPath(), settings);
}

export function detectTerminals(currentTerminals: TerminalConfig[]): TerminalConfig[] {
  const existingIds = new Set(currentTerminals.map(t => t.id));
  const found: TerminalConfig[] = [];

  for (const known of KNOWN_TERMINALS) {
    const appPath = path.join('/Applications', known.appName);
    const id = slugify(known.appName);
    if (existingIds.has(id)) continue;
    if (fs.existsSync(appPath)) {
      found.push({
        id,
        name: known.name,
        path: appPath,
        isBuiltIn: false,
      });
    }
  }

  return found;
}

export async function browseTerminalApp(parentWindow: BrowserWindow): Promise<TerminalConfig | null> {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Select Terminal Application',
    defaultPath: '/Applications',
    filters: [{ name: 'Applications', extensions: ['app'] }],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const appPath = result.filePaths[0];
  const appName = path.basename(appPath);
  const id = slugify(appName);
  const name = appName.replace(/\.app$/i, '');

  return { id, name, path: appPath, isBuiltIn: false };
}
