import { lockOrientation, resetOrientation } from '../session/orientation';
import * as ScreenOrientation from 'expo-screen-orientation';

jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { PORTRAIT: 1, LANDSCAPE: 3 },
  lockAsync: jest.fn(),
}));

const mockLockAsync = ScreenOrientation.lockAsync as jest.Mock;

describe('orientation wrapper', () => {
  beforeEach(() => { mockLockAsync.mockReset(); mockLockAsync.mockResolvedValue(undefined); });

  it('lockOrientation("portrait") calls lockAsync with PORTRAIT', async () => {
    await lockOrientation('portrait');
    expect(mockLockAsync).toHaveBeenCalledWith(ScreenOrientation.OrientationLock.PORTRAIT);
  });

  it('lockOrientation("landscape") calls lockAsync with LANDSCAPE', async () => {
    await lockOrientation('landscape');
    expect(mockLockAsync).toHaveBeenCalledWith(ScreenOrientation.OrientationLock.LANDSCAPE);
  });

  it('lockOrientation swallows rejections from lockAsync', async () => {
    mockLockAsync.mockRejectedValueOnce(new Error('boom'));
    await expect(lockOrientation('portrait')).resolves.toBeUndefined();
  });

  it('resetOrientation locks to portrait and swallows errors', async () => {
    mockLockAsync.mockRejectedValueOnce(new Error('nope'));
    await expect(resetOrientation()).resolves.toBeUndefined();
    expect(mockLockAsync).toHaveBeenCalledWith(ScreenOrientation.OrientationLock.PORTRAIT);
  });
});
