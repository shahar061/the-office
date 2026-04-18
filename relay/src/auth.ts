// relay/src/auth.ts — Verify Ed25519 session tokens signed by a paired device's pairSign key.

import { ed25519 } from '@noble/curves/ed25519';

export interface TokenClaims {
  sid: string;
  role: 'desktop' | 'phone';
  epoch: number;
  exp: number; // unix ms
}

const SKEW_MS = 60_000;

/** Accept both standard base64 and base64url. The desktop's signPairToken uses
 *  base64url (so the token is URL/header safe); tolerating standard base64 too
 *  keeps this helper future-proof for other token producers. */
function b64decode(s: string): Uint8Array {
  const normalized = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '=='.slice(0, (4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function b64decodeToUtf8(s: string): string {
  const bytes = b64decode(s);
  return new TextDecoder().decode(bytes);
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
    const claims = JSON.parse(b64decodeToUtf8(body)) as TokenClaims;
    if (claims.sid !== expected.sid) return null;
    if (expected.role && claims.role !== expected.role) return null;
    if (claims.epoch !== expected.currentEpoch) return null;
    if (Date.now() > claims.exp + SKEW_MS) return null;
    return claims;
  } catch {
    return null;
  }
}
