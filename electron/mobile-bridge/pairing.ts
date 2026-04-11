import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const PAIRING_TOKEN_TTL_MS = 5 * 60 * 1000;
const PAIRING_TOKEN_BYTES = 32;
const DEVICE_TOKEN_BYTES = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEY_LEN = 64;

export interface PairingToken {
  token: string;
  expiresAt: number;
}

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function createPairingToken(): PairingToken {
  return {
    token: toBase64Url(randomBytes(PAIRING_TOKEN_BYTES)),
    expiresAt: Date.now() + PAIRING_TOKEN_TTL_MS,
  };
}

export function isPairingTokenExpired(expiresAt: number): boolean {
  return expiresAt <= Date.now();
}

export function generateDeviceToken(): string {
  return toBase64Url(randomBytes(DEVICE_TOKEN_BYTES));
}

/**
 * Hash a device token for at-rest storage.
 * Format: "salt_b64url$key_b64url"
 */
export async function hashDeviceToken(token: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const key = await scryptAsync(token, salt, SCRYPT_KEY_LEN);
  return `${toBase64Url(salt)}$${toBase64Url(key)}`;
}

export async function verifyDeviceToken(token: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 2) return false;
  const [saltB64, keyB64] = parts;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, 'base64url');
    expected = Buffer.from(keyB64, 'base64url');
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEY_LEN) return false;
  const actual = await scryptAsync(token, salt, SCRYPT_KEY_LEN);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
