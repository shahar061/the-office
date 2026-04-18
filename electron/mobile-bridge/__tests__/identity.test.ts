import { describe, it, expect } from 'vitest';
import { getOrCreateIdentity } from '../identity';
import type { SettingsStoreLike } from '../device-store';
import type { AppSettings } from '../../../shared/types';

function makeStore(initial: Partial<AppSettings> = {}): SettingsStoreLike {
  let state = { ...initial } as AppSettings;
  return {
    get: () => state,
    update: (patch) => { state = { ...state, ...patch }; return state; },
  };
}

describe('getOrCreateIdentity', () => {
  it('generates a keypair on first call and persists it', () => {
    const store = makeStore();
    const id1 = getOrCreateIdentity(store);
    expect(id1.priv).toHaveLength(32);
    expect(id1.pub).toHaveLength(32);

    const id2 = getOrCreateIdentity(store);
    expect(Buffer.from(id1.pub).toString('hex'))
      .toBe(Buffer.from(id2.pub).toString('hex'));
    expect(Buffer.from(id1.priv).toString('hex'))
      .toBe(Buffer.from(id2.priv).toString('hex'));
  });

  it('preserves existing mobile settings when persisting identity', () => {
    const store = makeStore({ mobile: { enabled: true, port: 52341, devices: [] } });
    getOrCreateIdentity(store);
    const mobile = store.get().mobile!;
    expect(mobile.enabled).toBe(true);
    expect(mobile.port).toBe(52341);
    expect(mobile.identity?.priv).toBeTruthy();
  });
});
