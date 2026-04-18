// shared/crypto/sas.ts — Derive a short authentication string from pairing inputs.
// Purpose: user eyeballs this on both screens to detect MITM during pairing.

import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

export function deriveSas(
  desktopIdentityPub: Uint8Array,
  devicePub: Uint8Array,
  pairingToken: string,
): string {
  const tokenBytes = utf8ToBytes(pairingToken);
  const input = new Uint8Array(
    desktopIdentityPub.length + devicePub.length + tokenBytes.length,
  );
  input.set(desktopIdentityPub, 0);
  input.set(devicePub, desktopIdentityPub.length);
  input.set(tokenBytes, desktopIdentityPub.length + devicePub.length);

  const digest = sha256(input);
  // Read first 4 bytes as uint32 big-endian, mod 1_000_000.
  const n = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
  const sixDigits = (n % 1_000_000).toString().padStart(6, '0');
  return `${sixDigits.slice(0, 3)} ${sixDigits.slice(3, 6)}`;
}
