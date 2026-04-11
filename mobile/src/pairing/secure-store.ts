import * as SecureStore from 'expo-secure-store';

const KEY = 'the-office.pairedDevice';

export interface PairedDeviceCredentials {
  deviceId: string;
  deviceToken: string;
  desktopName: string;
  host: string;
  port: number;
}

export async function saveDevice(device: PairedDeviceCredentials): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(device));
}

export async function loadDevice(): Promise<PairedDeviceCredentials | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as PairedDeviceCredentials; } catch { return null; }
}

export async function clearDevice(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
