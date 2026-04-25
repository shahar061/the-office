import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyTurnstile } from '../src/turnstile';

describe('verifyTurnstile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const ok = await verifyTurnstile('TOKEN', 'SECRET', '127.0.0.1');
    expect(ok).toBe(true);
  });

  it('returns false on { success: false }', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 }),
    );
    const ok = await verifyTurnstile('TOKEN', 'SECRET', '127.0.0.1');
    expect(ok).toBe(false);
  });

  it('returns false on network error (fail-closed)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const ok = await verifyTurnstile('TOKEN', 'SECRET', '127.0.0.1');
    expect(ok).toBe(false);
  });

  it('returns false on non-2xx HTTP', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('server error', { status: 500 }),
    );
    const ok = await verifyTurnstile('TOKEN', 'SECRET', '127.0.0.1');
    expect(ok).toBe(false);
  });
});
