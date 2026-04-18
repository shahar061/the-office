import * as ScreenOrientation from 'expo-screen-orientation';

export type Mode = 'portrait' | 'landscape';

export async function lockOrientation(mode: Mode): Promise<void> {
  const lock = mode === 'portrait'
    ? ScreenOrientation.OrientationLock.PORTRAIT
    : ScreenOrientation.OrientationLock.LANDSCAPE;
  try {
    await ScreenOrientation.lockAsync(lock);
  } catch (err) {
    console.warn('[orientation] lock failed:', err);
  }
}

export async function resetOrientation(): Promise<void> {
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
  } catch {
    // best-effort on unmount
  }
}
