import * as SecureStore from 'expo-secure-store';

const KEY = 'the-office.pairedDevice';

export interface PairedDeviceCredentials {
  deviceId: string;
  deviceToken: string;
  desktopName: string;
  host: string;
  port: number;
  // v2 additions
  identityPriv: string;          // base64, phone's long-lived X25519 private key
  identityPub: string;           // base64, phone's pubkey (echoed in pair message)
  desktopIdentityPub: string;    // base64, pinned at pairing
  sid: string;                   // base64url, relay session id
  remoteAllowed: boolean;
}

export async function saveDevice(device: PairedDeviceCredentials): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(device));
}

export async function loadDevice(): Promise<PairedDeviceCredentials | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Any v1 record lacks these v2 fields — force a re-pair by returning null.
    if (!parsed?.identityPriv || !parsed?.identityPub || !parsed?.sid) return null;
    return parsed as PairedDeviceCredentials;
  } catch {
    return null;
  }
}

export async function clearDevice(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
