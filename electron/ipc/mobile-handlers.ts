import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import type { MobileBridge } from '../mobile-bridge';

export function registerMobileHandlers(bridge: MobileBridge): void {
  ipcMain.handle(IPC_CHANNELS.MOBILE_GET_PAIRING_QR, () => bridge.getPairingQR());
  ipcMain.handle(IPC_CHANNELS.MOBILE_LIST_DEVICES, () => bridge.listDevices());
  ipcMain.handle(IPC_CHANNELS.MOBILE_REVOKE_DEVICE, (_evt, deviceId: string) => bridge.revokeDevice(deviceId));
  ipcMain.handle(IPC_CHANNELS.MOBILE_RENAME_DEVICE, (_evt, deviceId: string, name: string) => bridge.renameDevice(deviceId, name));
  ipcMain.handle(IPC_CHANNELS.MOBILE_SET_REMOTE_ACCESS, (_evt, deviceId: string, enabled: boolean) => bridge.setRemoteAccess(deviceId, enabled));
  ipcMain.handle(IPC_CHANNELS.MOBILE_PAUSE_RELAY, (_evt, until: number | null) => bridge.pauseRelay(until));
  ipcMain.handle(IPC_CHANNELS.MOBILE_GET_STATUS, () => bridge.getStatus());
  ipcMain.handle(IPC_CHANNELS.MOBILE_SET_LAN_HOST, (_e, host: string | null) => bridge.setLanHost(host));
}

export function unregisterMobileHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_GET_PAIRING_QR);
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_LIST_DEVICES);
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_REVOKE_DEVICE);
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_RENAME_DEVICE);
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_SET_REMOTE_ACCESS);
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_PAUSE_RELAY);
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_GET_STATUS);
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_SET_LAN_HOST);
}

export function broadcastMobileStatus(bridge: MobileBridge): void {
  const status = bridge.getStatus();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.MOBILE_STATUS_CHANGE, status);
  }
}
