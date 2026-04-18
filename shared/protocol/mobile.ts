import type { MobileMessage, MobileMessageV2 } from '../types';

const VALID_TYPES = new Set([
  'pair', 'auth', 'paired', 'authed', 'authFailed',
  'snapshot', 'event', 'chat', 'state', 'heartbeat',
]);

export function isMobileMessage(x: unknown): x is MobileMessage {
  if (x === null || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  if (typeof m.type !== 'string' || !VALID_TYPES.has(m.type)) return false;
  if (m.v !== 1) return false;
  return true;
}

export function encode(msg: MobileMessage): string {
  return JSON.stringify(msg);
}

export function decode(raw: string): MobileMessage | null {
  try {
    const parsed = JSON.parse(raw);
    return isMobileMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const VALID_V2_TYPES = new Set([
  'pair', 'pairConfirm', 'pairRemoteConsent', 'auth', 'chat', 'heartbeat',
  'paired', 'authed', 'authFailed', 'snapshot', 'event', 'chatFeed', 'chatAck', 'state',
]);

export function isMobileMessageV2(x: unknown): x is MobileMessageV2 {
  if (x === null || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  if (typeof m.type !== 'string' || !VALID_V2_TYPES.has(m.type)) return false;
  if (m.v !== 2) return false;
  return true;
}

export function encodeV2(msg: MobileMessageV2): string {
  return JSON.stringify(msg);
}

export function decodeV2(raw: string): MobileMessageV2 | null {
  try {
    const parsed = JSON.parse(raw);
    return isMobileMessageV2(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
