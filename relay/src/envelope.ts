// relay/src/envelope.ts — Parse and validate the outer relay envelope.

import type { RelayEnvelope } from '../../shared/types/envelope';

export function parseEnvelope(raw: string): RelayEnvelope | null {
  try {
    const p = JSON.parse(raw);
    if (p?.v !== 2) return null;
    if (typeof p.sid !== 'string' || typeof p.seq !== 'number') return null;
    if (p.kind !== 'data' && p.kind !== 'ctrl') return null;
    if (typeof p.ct !== 'string') return null;
    return p as RelayEnvelope;
  } catch {
    return null;
  }
}
