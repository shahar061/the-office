import type { MobileMessage } from '../types';

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
