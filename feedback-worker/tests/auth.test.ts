import { describe, it, expect } from 'vitest';
import { requireAdmin } from '../src/auth';

describe('requireAdmin', () => {
  it('returns null when token matches', () => {
    const req = new Request('https://x', { headers: { Authorization: 'Bearer secret123' } });
    expect(requireAdmin(req, 'secret123')).toBeNull();
  });

  it('returns 401 Response when token missing', () => {
    const req = new Request('https://x');
    const res = requireAdmin(req, 'secret123');
    expect(res).toBeInstanceOf(Response);
    expect(res!.status).toBe(401);
  });

  it('returns 401 Response when token wrong', () => {
    const req = new Request('https://x', { headers: { Authorization: 'Bearer wrong' } });
    const res = requireAdmin(req, 'secret123');
    expect(res!.status).toBe(401);
  });

  it('returns 401 when admin secret is empty (misconfigured Worker)', () => {
    const req = new Request('https://x', { headers: { Authorization: 'Bearer ' } });
    const res = requireAdmin(req, '');
    expect(res!.status).toBe(401);
  });
});
