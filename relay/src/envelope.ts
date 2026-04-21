// relay/src/envelope.ts — Parse and validate the outer relay envelope.

import type { RelayEnvelope } from '../../shared/types/envelope';

const NONCE_BYTES = 12;

function isValidNonceB64(s: string): boolean {
  if (s.length === 0) return false;
  // Quick charset gate — base64 alphabet only.
  if (!/^[A-Za-z0-9+/]+=*$/.test(s)) return false;
  try {
    const decoded = atob(s);
    return decoded.length === NONCE_BYTES;
  } catch {
    return false;
  }
}

export function parseEnvelope(raw: string): RelayEnvelope | null {
  try {
    const p = JSON.parse(raw);
    if (p?.v !== 2) return null;
    if (typeof p.sid !== 'string' || typeof p.seq !== 'number') return null;
    if (p.kind !== 'data' && p.kind !== 'ctrl') return null;
    if (typeof p.ct !== 'string') return null;
    if (typeof p.nonce !== 'string' || !isValidNonceB64(p.nonce)) return null;
    return p as RelayEnvelope;
  } catch {
    return null;
  }
}
