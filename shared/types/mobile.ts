// shared/types/mobile.ts — Mobile bridge protocol types

import type { AgentEvent } from './agent';
import type { ChatMessage, SessionSnapshot, SessionStatePatch } from './session';

/** Cloudflare Worker that forwards encrypted frames between desktop and phone.
 *  Currently points at staging. Swap to a prod URL once a production worker
 *  is deployed. The desktop opens one outbound WS per remoteAllowed device;
 *  the phone falls back to this URL when LAN is unreachable. */
export const RELAY_URL = 'wss://the-office-relay-staging.shahar061.workers.dev';

export interface PairedDevice {
  deviceId: string;
  deviceName: string;
  deviceTokenHash: string;  // scrypt hash; never the raw token
  pairedAt: number;
  lastSeenAt: number;
  // v2 fields — optional for backward compat with v1 records
  phoneIdentityPub?: string;   // base64, phone's long-lived X25519 pubkey
  pairSignPriv?: string;       // base64, desktop's Ed25519 priv for relay tokens
  pairSignPub?: string;        // base64, corresponding pubkey
  sid?: string;                // base64url, 128-bit relay session id
  remoteAllowed?: boolean;
  epoch?: number;              // bumped on revoke (used in Plan 2)
}

export interface PairingQRPayload {
  v: 1;
  host: string;
  port: number;
  pairingToken: string;
  expiresAt: number;
}

export type MobileMessage =
  // Phone → Desktop
  | { type: 'pair'; v: 1; pairingToken: string; deviceName: string }
  | { type: 'auth'; v: 1; deviceId: string; deviceToken: string }
  // Desktop → Phone
  | { type: 'paired'; v: 1; deviceId: string; deviceToken: string; desktopName: string }
  | { type: 'authed'; v: 1; snapshot: SessionSnapshot }
  | { type: 'authFailed'; v: 1; reason: 'unknownDevice' | 'revoked' | 'expired' | 'malformed' | 'internal' }
  | { type: 'snapshot'; v: 1; snapshot: SessionSnapshot }
  | { type: 'event'; v: 1; event: AgentEvent }
  | { type: 'chat'; v: 1; messages: ChatMessage[] }
  | { type: 'state'; v: 1; patch: SessionStatePatch }
  // Bidirectional
  | { type: 'heartbeat'; v: 1 };

// -----------------------------------------------------------------------------
// v2 additions — added alongside v1 for an incremental migration.
// New components import MobileMessageV2 / PairingQRPayloadV2 directly.
// -----------------------------------------------------------------------------

export interface PairingQRPayloadV2 {
  v: 2;
  host: string;
  port: number;
  desktopIdentityPub: string;    // base64, desktop's long-lived X25519 pubkey
  pairingToken: string;
  expiresAt: number;
}

/** v3: relay-based pairing is default. host/port are optional and
 *  populated only when the user has configured a LAN direct connection
 *  in Settings → Mobile → Advanced. */
export interface PairingQRPayloadV3 {
  v: 3;
  mode: 'relay' | 'lan-direct';
  roomId: string;                // 128-bit base64url — rendezvous room id on the relay
  desktopIdentityPub: string;
  pairingToken: string;
  expiresAt: number;
  host?: string;                 // LAN override — present only if user configured it
  port?: number;                 // LAN override — present only if user configured it
}

// v2 message union. Wire format is an encrypted envelope; these are the
// plaintext shapes after envelope unwrap.
export type MobileMessageV2 =
  // Phone -> Desktop
  | { type: 'pair'; v: 2; pairingToken: string; devicePub: string; deviceName: string }
  | { type: 'pairConfirm'; v: 2 }                               // after SAS match
  | { type: 'pairRemoteConsent'; v: 2; remoteAllowed: boolean }
  | { type: 'auth'; v: 2; deviceId: string; deviceToken: string }
  | { type: 'chat'; v: 2; body: string; clientMsgId: string; agentId?: string }
  | { type: 'heartbeat'; v: 2 }
  // Desktop -> Phone
  | { type: 'paired'; v: 2; deviceId: string; deviceToken: string; desktopName: string; sid: string }
  | { type: 'authed'; v: 2; snapshot: SessionSnapshot }
  | { type: 'authFailed'; v: 2; reason: 'unknownDevice' | 'revoked' | 'expired' | 'malformed' | 'internal' | 'sasAbort' }
  | { type: 'snapshot'; v: 2; snapshot: SessionSnapshot }
  | { type: 'event'; v: 2; event: AgentEvent }
  | { type: 'chatFeed'; v: 2; messages: ChatMessage[] }
  | { type: 'chatAck'; v: 2; clientMsgId: string; ok: boolean; error?: string }
  | { type: 'state'; v: 2; patch: SessionStatePatch }
  | { type: 'tokenRefresh'; v: 2; token: string; expiresAt: number };
