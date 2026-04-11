import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import type { MobileBridge } from '../mobile-bridge';

export function registerMobileHandlers(bridge: MobileBridge): void {
  ipcMain.handle(IPC_CHANNELS.MOBILE_GET_PAIRING_QR, () => bridge.getPairingQR());
  ipcMain.handle(IPC_CHANNELS.MOBILE_LIST_DEVICES, () => bridge.listDevices());
  ipcMain.handle(IPC_CHANNELS.MOBILE_REVOKE_DEVICE, (_evt, deviceId: string) => bridge.revokeDevice(deviceId));
  ipcMain.handle(IPC_CHANNELS.MOBILE_GET_STATUS, () => bridge.getStatus());
}

export function unregisterMobileHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_GET_PAIRING_QR);
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_LIST_DEVICES);
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_REVOKE_DEVICE);
  ipcMain.removeHandler(IPC_CHANNELS.MOBILE_GET_STATUS);
}

export function broadcastMobileStatus(bridge: MobileBridge): void {
  const status = bridge.getStatus();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.MOBILE_STATUS_CHANGE, status);
  }
}
