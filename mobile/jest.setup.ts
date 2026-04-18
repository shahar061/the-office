// Polyfill WebCrypto for jest-expo node environment. @noble libs require
// globalThis.crypto.getRandomValues at module evaluation time.
import { webcrypto } from 'crypto';

if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}
