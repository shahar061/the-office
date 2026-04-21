import { describe, it, expect } from 'vitest';
import { encode, decode, isMobileMessage, isMobileMessageV2 } from '../mobile';
import type { MobileMessage } from '../../types';

describe('protocol', () => {
  const samples: MobileMessage[] = [
    { type: 'pair', v: 1, pairingToken: 'abc', deviceName: 'iPhone' },
    { type: 'auth', v: 1, deviceId: 'dev-1', deviceToken: 'tok' },
    { type: 'heartbeat', v: 1 },
    { type: 'authFailed', v: 1, reason: 'revoked' },
    { type: 'event', v: 1, event: {
        agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1,
    }},
  ];

  it('round-trips every sample message', () => {
    for (const msg of samples) {
      const wire = encode(msg);
      expect(typeof wire).toBe('string');
      const parsed = decode(wire);
      expect(parsed).toEqual(msg);
    }
  });

  it('decode returns null on malformed JSON', () => {
    expect(decode('{not json')).toBeNull();
  });

  it('decode returns null on missing type field', () => {
    expect(decode(JSON.stringify({ v: 1 }))).toBeNull();
  });

  it('decode returns null on wrong v field', () => {
    expect(decode(JSON.stringify({ type: 'pair', v: 2, pairingToken: 'x', deviceName: 'y' }))).toBeNull();
  });

  it('isMobileMessage rejects non-objects', () => {
    expect(isMobileMessage(null)).toBe(false);
    expect(isMobileMessage(42)).toBe(false);
    expect(isMobileMessage('str')).toBe(false);
  });
});

describe('isMobileMessageV2 — new phase-history message types', () => {
  it('accepts getPhaseHistory messages', () => {
    expect(isMobileMessageV2({
      type: 'getPhaseHistory', v: 2, phase: 'imagine', requestId: 'r1',
    })).toBe(true);
  });

  it('accepts phaseHistory messages', () => {
    expect(isMobileMessageV2({
      type: 'phaseHistory', v: 2, requestId: 'r1', phase: 'imagine', history: [],
    })).toBe(true);
  });

  it('rejects malformed bogus types at v=2', () => {
    expect(isMobileMessageV2({
      type: 'notARealType', v: 2,
    })).toBe(false);
  });
});
