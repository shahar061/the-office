import { describe, it, expect, beforeEach } from 'vitest';
import { useGitBannerStore } from '../../src/renderer/src/stores/git-banner.store';

describe('useGitBannerStore', () => {
  beforeEach(() => {
    useGitBannerStore.getState().reset();
  });

  it('starts empty', () => {
    expect(useGitBannerStore.getState().banners).toEqual([]);
  });

  it('addBanner appends a banner with a unique id', () => {
    useGitBannerStore.getState().addBanner({
      level: 'info',
      message: 'first',
    });
    useGitBannerStore.getState().addBanner({
      level: 'warning',
      message: 'second',
      requestId: 'req-001',
    });
    const banners = useGitBannerStore.getState().banners;
    expect(banners.length).toBe(2);
    expect(banners[0].message).toBe('first');
    expect(banners[1].message).toBe('second');
    expect(banners[1].requestId).toBe('req-001');
    expect(banners[0].id).not.toBe(banners[1].id);
  });

  it('dismissBanner removes the matching banner', () => {
    useGitBannerStore.getState().addBanner({ level: 'info', message: 'a' });
    useGitBannerStore.getState().addBanner({ level: 'info', message: 'b' });
    const firstId = useGitBannerStore.getState().banners[0].id;
    useGitBannerStore.getState().dismissBanner(firstId);
    const banners = useGitBannerStore.getState().banners;
    expect(banners.length).toBe(1);
    expect(banners[0].message).toBe('b');
  });

  it('reset clears all banners', () => {
    useGitBannerStore.getState().addBanner({ level: 'info', message: 'x' });
    useGitBannerStore.getState().reset();
    expect(useGitBannerStore.getState().banners).toEqual([]);
  });
});
