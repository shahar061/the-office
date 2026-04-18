// relay/src/session-do.ts — SessionDO: forwards encrypted frames between a paired
// desktop and phone. Uses the classic (non-hibernatable) WebSocket pattern for v1.

import { parseEnvelope } from './envelope';
import { verifyToken } from './auth';

const MAX_MSG_PER_SEC = 100;
const MAX_PAYLOAD_BYTES = 1_048_576; // 1 MB

type Role = 'desktop' | 'phone';

function b64urlDecode(s: string): Uint8Array {
  const fixed = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4);
  const bin = atob(fixed);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

interface Env { SESSION_DO: DurableObjectNamespace; }

export class SessionDO implements DurableObject {
  private pairSignPub: Uint8Array | null = null;
  private epoch = 1;
  private cachedSid: string | null = null;
  private peers: Partial<Record<Role, WebSocket>> = {};
  private lastSeq: Partial<Record<Role, number>> = {};
  private rate: Partial<Record<Role, { windowStart: number; count: number }>> = {};

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split('/'); // ["", "s", sid, maybe-"revoke"]
    const sid = parts[2];
    if (!sid) return new Response('missing sid', { status: 400 });

    if (parts[3] === 'revoke') return this.handleRevoke(req, sid);

    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    // Extract token from either Authorization header (desktop) or subprotocol (phone).
    const authHeader = req.headers.get('Authorization') ?? '';
    const wspHeader = req.headers.get('Sec-WebSocket-Protocol') ?? '';
    const wspTokens = wspHeader.split(',').map((s) => s.trim()).filter(Boolean);
    const subprotocolToken = wspTokens.find((t) => t.startsWith('token.'))?.slice(6);
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : subprotocolToken ?? '';
    if (!token) return new Response('unauthorized: no token', { status: 401 });

    // First connect must be desktop and must supply pairSignPub via header.
    let role: Role;
    if (!this.pairSignPub) {
      const embeddedPub = req.headers.get('X-PairSign-Pub');
      if (!embeddedPub) return new Response('first connect needs X-PairSign-Pub', { status: 401 });
      let pub: Uint8Array;
      try {
        pub = b64urlDecode(embeddedPub);
      } catch {
        return new Response('malformed pubkey', { status: 401 });
      }
      const claims = verifyToken(pub, token, { sid, currentEpoch: this.epoch });
      if (!claims || claims.role !== 'desktop') {
        return new Response('unauthorized: first connect must be desktop', { status: 401 });
      }
      this.pairSignPub = pub;
      this.cachedSid = sid;
      role = 'desktop';
    } else {
      const claims = verifyToken(this.pairSignPub, token, { sid, currentEpoch: this.epoch });
      if (!claims) return new Response('unauthorized', { status: 401 });
      role = claims.role;
      // Cache sid on subsequent connects too, in case the DO was restored without it.
      if (!this.cachedSid) this.cachedSid = sid;
    }

    // Close any existing connection in this role — "last one wins".
    const existing = this.peers[role];
    if (existing) {
      try { existing.close(1008, 'superseded'); } catch { /* ignore */ }
    }

    // Upgrade.
    const pair = new WebSocketPair();
    const [clientSide, serverSide] = Object.values(pair);
    serverSide.accept();
    this.peers[role] = serverSide;
    this.lastSeq[role] = -1;
    this.rate[role] = { windowStart: Date.now(), count: 0 };

    serverSide.addEventListener('message', (ev: MessageEvent) => this.onMessage(role, ev.data));
    serverSide.addEventListener('close', () => { delete this.peers[role]; });

    // Echo the first subprotocol back to the client if one was sent.
    const responseHeaders: HeadersInit = {};
    const chosenSubprotocol = wspTokens[0];
    if (chosenSubprotocol) responseHeaders['Sec-WebSocket-Protocol'] = chosenSubprotocol;

    return new Response(null, { status: 101, webSocket: clientSide, headers: responseHeaders });
  }

  private onMessage(role: Role, data: string | ArrayBuffer): void {
    if (typeof data !== 'string') {
      this.peers[role]?.close(1008, 'binary not supported');
      return;
    }
    if (data.length > MAX_PAYLOAD_BYTES) {
      this.peers[role]?.close(1009, 'payloadTooLarge');
      return;
    }

    // Rate limit.
    const now = Date.now();
    const r = this.rate[role] ?? { windowStart: now, count: 0 };
    if (now - r.windowStart > 1000) { r.windowStart = now; r.count = 0; }
    r.count++;
    this.rate[role] = r;
    if (r.count > MAX_MSG_PER_SEC) {
      this.peers[role]?.close(1008, 'rateLimit');
      return;
    }

    // Parse envelope + seq monotonicity.
    const env = parseEnvelope(data);
    if (!env) {
      this.peers[role]?.close(1008, 'malformed');
      return;
    }
    if (this.cachedSid && env.sid !== this.cachedSid) {
      this.peers[role]?.close(1008, 'malformed');
      return;
    }
    const last = this.lastSeq[role] ?? -1;
    if (env.seq <= last) {
      this.peers[role]?.close(1008, 'seqRegression');
      return;
    }
    this.lastSeq[role] = env.seq;

    // Forward to the other peer.
    const other: Role = role === 'desktop' ? 'phone' : 'desktop';
    const dest = this.peers[other];
    if (dest) {
      try { dest.send(data); } catch { /* ignore */ }
    }
  }

  private async handleRevoke(req: Request, sid: string): Promise<Response> {
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
    if (!this.pairSignPub) return new Response('no session', { status: 404 });
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return new Response('unauthorized', { status: 401 });
    const token = auth.slice(7);
    const claims = verifyToken(this.pairSignPub, token, { sid, currentEpoch: this.epoch });
    if (!claims || claims.role !== 'desktop') return new Response('unauthorized', { status: 401 });
    this.epoch++;
    for (const role of Object.keys(this.peers) as Role[]) {
      try { this.peers[role]?.close(1008, 'revoked'); } catch { /* ignore */ }
    }
    this.peers = {};
    return new Response('ok');
  }
}
