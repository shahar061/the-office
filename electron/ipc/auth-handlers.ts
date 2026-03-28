import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import { authManager, agentsDir, send } from './state';

export function initAuthHandlers(): void {
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

  ipcMain.handle(IPC_CHANNELS.GET_AGENT_DEFINITIONS, async () => {
    const { loadAllAgents } = await import('../sdk/agent-loader');
    const agents = loadAllAgents(agentsDir);
    const result: Record<string, any> = {};
    for (const [name, def] of Object.entries(agents)) {
      result[name] = {
        name,
        description: def.description,
        prompt: def.prompt,
        tools: def.tools ?? [],
      };
    }
    return result;
  });
}
