import { describe, it, expect } from 'vitest';
import { parseEnvelope } from '../envelope';

describe('parseEnvelope', () => {
  it('returns the envelope on valid input', () => {
    const input = JSON.stringify({ v: 2, sid: 's1', seq: 0, kind: 'data', ct: 'AQ==' });
    expect(parseEnvelope(input)).toEqual({ v: 2, sid: 's1', seq: 0, kind: 'data', ct: 'AQ==' });
  });
  it('returns null on invalid JSON', () => {
    expect(parseEnvelope('not json')).toBeNull();
  });
  it('returns null on wrong version', () => {
    expect(parseEnvelope(JSON.stringify({ v: 1, sid: 's', seq: 0, kind: 'data', ct: '' }))).toBeNull();
  });
  it('returns null on missing fields', () => {
    expect(parseEnvelope(JSON.stringify({ v: 2, sid: 's' }))).toBeNull();
  });
  it('returns null on wrong kind', () => {
    expect(parseEnvelope(JSON.stringify({ v: 2, sid: 's', seq: 0, kind: 'weird', ct: '' }))).toBeNull();
  });
});
