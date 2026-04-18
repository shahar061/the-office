// electron/mobile-bridge/token-minter.ts
// Thin TTL-based wrapper around signPairToken. Desktop mints short-lived
// tokens for its own relay connection, plus longer-lived (24h) tokens
// that are pushed to the phone via ctrl:tokenRefresh.

import { signPairToken } from './pairing';

export function mintToken(
  pairSignPriv: Uint8Array,
  opts: { sid: string; role: 'desktop' | 'phone'; epoch: number; ttlMs: number },
): string {
  return signPairToken(pairSignPriv, {
    sid: opts.sid,
    role: opts.role,
    epoch: opts.epoch,
    exp: Date.now() + opts.ttlMs,
  });
}
