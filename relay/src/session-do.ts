// relay/src/session-do.ts — SessionDO: forwards encrypted frames between a paired
// desktop and phone. Uses the classic (non-hibernatable) WebSocket pattern for v1.

import { parseEnvelope } from './envelope';
import { verifyToken } from './auth';

const MAX_MSG_PER_SEC = 100;
const MAX_PAYLOAD_BYTES = 1_048_576; // 1 MB
const PENDING_QUEUE_LIMIT = 32;
const KICK_COOLDOWN_MS = 5_000;

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
  // Frames destined for a peer that's currently disconnected. Drained when the
  // missing role reconnects. Bounded so a permanently-absent peer can't make
  // the DO hold unbounded memory.
  private pending: Partial<Record<Role, string[]>> = {};
  // Timestamp of the last time we closed a role with 'peerReconnect'. When the
  // same role reconnects within the cooldown window, we treat it as the direct
  // response to our kick and skip re-kicking the counterparty — otherwise the
  // two peers kick each other in a loop and neither stays connected long
  // enough to complete the AUTH handshake.
  private recentKicks: Partial<Record<Role, number>> = {};

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

    // Also kick the peer of the OTHER role so their encryption streams reset
    // in lockstep — unless we ourselves just kicked this role, in which case
    // this connect IS the response to that kick and the counterparty is
    // already fresh. Without this cooldown the two peers ping-pong forever.
    const other: Role = role === 'desktop' ? 'phone' : 'desktop';
    const myLastKick = this.recentKicks[role];
    const wasJustKicked = myLastKick !== undefined && (Date.now() - myLastKick) < KICK_COOLDOWN_MS;
    delete this.recentKicks[role];
    if (!wasJustKicked) {
      const existingOther = this.peers[other];
      if (existingOther) {
        try { existingOther.close(1000, 'peerReconnect'); } catch { /* ignore */ }
        delete this.peers[other];
        delete this.lastSeq[other];
        delete this.rate[other];
        this.recentKicks[other] = Date.now();
      }
    }

    // Upgrade.
    const pair = new WebSocketPair();
    const [clientSide, serverSide] = Object.values(pair);
    serverSide.accept();
    this.peers[role] = serverSide;
    this.lastSeq[role] = -1;
    this.rate[role] = { windowStart: Date.now(), count: 0 };

    // Drain any frames buffered while this role was absent. Do this before
    // wiring the message listener so the incoming peer sees queued traffic
    // (typically the other side's AUTH / AUTHED handshake) before its own.
    const queued = this.pending[role];
    if (queued && queued.length > 0) {
      delete this.pending[role];
      for (const frame of queued) {
        try { serverSide.send(frame); } catch { /* ignore */ }
      }
    }

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

    // Forward to the other peer, or buffer if they're not connected.
    const other: Role = role === 'desktop' ? 'phone' : 'desktop';
    const dest = this.peers[other];
    if (dest) {
      try { dest.send(data); } catch { /* ignore */ }
      return;
    }
    const queue = this.pending[other] ?? [];
    if (queue.length < PENDING_QUEUE_LIMIT) {
      queue.push(data);
      this.pending[other] = queue;
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
    this.pending = {};
    this.recentKicks = {};
    return new Response('ok');
  }
}
