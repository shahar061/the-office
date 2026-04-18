// electron/mobile-bridge/identity.ts — Per-desktop long-lived X25519 identity keypair.
// Generated on first need, persisted in settings, reused across all paired phones.

import { x25519 } from '@noble/curves/ed25519';
import type { SettingsStoreLike } from './device-store';

export interface Identity { priv: Uint8Array; pub: Uint8Array; }

const b64decode = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));
const b64encode = (u: Uint8Array): string => Buffer.from(u).toString('base64');

export function getOrCreateIdentity(settings: SettingsStoreLike): Identity {
  const existing = settings.get().mobile?.identity;
  if (existing?.priv && existing?.pub) {
    return { priv: b64decode(existing.priv), pub: b64decode(existing.pub) };
  }
  const priv = x25519.utils.randomPrivateKey();
  const pub = x25519.getPublicKey(priv);
  const prevMobile = settings.get().mobile ?? { enabled: true, port: null, devices: [] };
  settings.update({
    mobile: {
      ...prevMobile,
      identity: { priv: b64encode(priv), pub: b64encode(pub) },
    },
  });
  return { priv, pub };
}
