import { describe, it, expect, beforeEach } from 'vitest';
import { useGreenfieldBannersStore } from '../../src/renderer/src/stores/greenfield-banners.store';

describe('useGreenfieldBannersStore', () => {
  beforeEach(() => {
    useGreenfieldBannersStore.getState().reset();
  });

  it('starts empty', () => {
    const state = useGreenfieldBannersStore.getState();
    expect(state.banners).toEqual([]);
    expect(state.dismissedForProject.size).toBe(0);
  });

  it('addBanner appends by unique id', () => {
    useGreenfieldBannersStore.getState().addBanner({
      id: 'b1',
      level: 'info',
      message: 'First',
    });
    useGreenfieldBannersStore.getState().addBanner({
      id: 'b2',
      level: 'warning',
      message: 'Second',
    });
    const state = useGreenfieldBannersStore.getState();
    expect(state.banners).toHaveLength(2);
    expect(state.banners[0].id).toBe('b1');
    expect(state.banners[1].id).toBe('b2');
  });

  it('addBanner with same id replaces the existing banner', () => {
    useGreenfieldBannersStore.getState().addBanner({
      id: 'b1',
      level: 'info',
      message: 'First',
    });
    useGreenfieldBannersStore.getState().addBanner({
      id: 'b1',
      level: 'warning',
      message: 'Updated',
    });
    const state = useGreenfieldBannersStore.getState();
    expect(state.banners).toHaveLength(1);
    expect(state.banners[0].message).toBe('Updated');
    expect(state.banners[0].level).toBe('warning');
  });

  it('dismissBanner removes by id', () => {
    useGreenfieldBannersStore.getState().addBanner({
      id: 'b1',
      level: 'info',
      message: 'First',
    });
    useGreenfieldBannersStore.getState().addBanner({
      id: 'b2',
      level: 'info',
      message: 'Second',
    });
    useGreenfieldBannersStore.getState().dismissBanner('b1');
    const state = useGreenfieldBannersStore.getState();
    expect(state.banners).toHaveLength(1);
    expect(state.banners[0].id).toBe('b2');
  });

  it('dismissBanner with unknown id is a no-op', () => {
    useGreenfieldBannersStore.getState().addBanner({
      id: 'b1',
      level: 'info',
      message: 'First',
    });
    useGreenfieldBannersStore.getState().dismissBanner('bogus');
    expect(useGreenfieldBannersStore.getState().banners).toHaveLength(1);
  });

  it('dismissForProject tracks project path', () => {
    useGreenfieldBannersStore.getState().dismissForProject('/path/a');
    expect(useGreenfieldBannersStore.getState().isDismissedForProject('/path/a')).toBe(true);
    expect(useGreenfieldBannersStore.getState().isDismissedForProject('/path/b')).toBe(false);
  });

  it('reset clears everything', () => {
    useGreenfieldBannersStore.getState().addBanner({
      id: 'b1',
      level: 'info',
      message: 'First',
    });
    useGreenfieldBannersStore.getState().dismissForProject('/path/a');
    useGreenfieldBannersStore.getState().reset();
    const state = useGreenfieldBannersStore.getState();
    expect(state.banners).toEqual([]);
    expect(state.dismissedForProject.size).toBe(0);
  });
});
