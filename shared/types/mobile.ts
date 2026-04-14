// shared/types/mobile.ts — Mobile bridge protocol types

import type { AgentEvent } from './agent';
import type { ChatMessage, SessionSnapshot, SessionStatePatch } from './session';

export interface PairedDevice {
  deviceId: string;
  deviceName: string;
  deviceTokenHash: string;  // scrypt hash; never the raw token
  pairedAt: number;
  lastSeenAt: number;
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
