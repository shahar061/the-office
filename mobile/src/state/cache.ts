import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SessionSnapshot } from '../types/shared';

const KEY = 'the-office.lastKnownState';

export interface LastKnown {
  snapshot: SessionSnapshot;
  updatedAt: number;
}

export async function saveLastKnown(snapshot: SessionSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ snapshot, updatedAt: Date.now() } satisfies LastKnown));
  } catch (err) {
    console.warn('[cache] save failed', err);
  }
}

export async function loadLastKnown(): Promise<LastKnown | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastKnown;
  } catch (err) {
    console.warn('[cache] load failed', err);
    return null;
  }
}
