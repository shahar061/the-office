// relay/src/auth.ts — Verify Ed25519 session tokens signed by a paired device's pairSign key.

import { ed25519 } from '@noble/curves/ed25519';

export interface TokenClaims {
  sid: string;
  role: 'desktop' | 'phone';
  epoch: number;
  exp: number; // unix ms
}

const SKEW_MS = 60_000;

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export function verifyToken(
  pub: Uint8Array,
  token: string,
  expected: { sid: string; role?: 'desktop' | 'phone'; currentEpoch: number },
): TokenClaims | null {
  const [body, sigB64] = token.split('.');
  if (!body || !sigB64) return null;
  try {
    const sig = b64decode(sigB64);
    if (!ed25519.verify(sig, new TextEncoder().encode(body), pub)) return null;
    const claims = JSON.parse(atob(body)) as TokenClaims;
    if (claims.sid !== expected.sid) return null;
    if (expected.role && claims.role !== expected.role) return null;
    if (claims.epoch !== expected.currentEpoch) return null;
    if (Date.now() > claims.exp + SKEW_MS) return null;
    return claims;
  } catch {
    return null;
  }
}
