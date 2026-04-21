import { describe, it, expect } from 'vitest';
import { parseEnvelope } from '../envelope';

// 12 zero bytes, base64-encoded, for the nonce field.
const VALID_NONCE_B64 = Buffer.alloc(12).toString('base64');

describe('parseEnvelope', () => {
  it('returns the envelope on valid input', () => {
    const input = JSON.stringify({
      v: 2, sid: 's1', seq: 0, kind: 'data', nonce: VALID_NONCE_B64, ct: 'AQ==',
    });
    expect(parseEnvelope(input)).toEqual({
      v: 2, sid: 's1', seq: 0, kind: 'data', nonce: VALID_NONCE_B64, ct: 'AQ==',
    });
  });

  it('returns null on invalid JSON', () => {
    expect(parseEnvelope('not json')).toBeNull();
  });

  it('returns null on wrong version', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 1, sid: 's', seq: 0, kind: 'data', nonce: VALID_NONCE_B64, ct: '',
    }))).toBeNull();
  });

  it('returns null on missing fields', () => {
    expect(parseEnvelope(JSON.stringify({ v: 2, sid: 's' }))).toBeNull();
  });

  it('returns null on wrong kind', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'weird', nonce: VALID_NONCE_B64, ct: '',
    }))).toBeNull();
  });

  it('returns null when nonce is missing', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'data', ct: '',
    }))).toBeNull();
  });

  it('returns null when nonce is the wrong type', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'data', nonce: 123, ct: '',
    }))).toBeNull();
  });

  it('returns null when nonce is empty string', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'data', nonce: '', ct: '',
    }))).toBeNull();
  });

  it('returns null when nonce decodes to the wrong length', () => {
    // 8 bytes base64-encoded — too short for a 12-byte ChaCha20 nonce.
    const shortNonce = Buffer.alloc(8).toString('base64');
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'data', nonce: shortNonce, ct: '',
    }))).toBeNull();
  });

  it('returns null when nonce is not valid base64', () => {
    expect(parseEnvelope(JSON.stringify({
      v: 2, sid: 's', seq: 0, kind: 'data', nonce: '!!!not-b64!!!', ct: '',
    }))).toBeNull();
  });
});
