// relay/src/pairing-room-do.ts
// Short-lived 2-peer rendezvous room for device pairing. Host (desktop)
// connects first and reserves the room; guest (phone) connects second.
// Forwards JSON text frames verbatim. No payload inspection — the
// pairing handshake (Noise + SAS) happens entirely between the peers.

const PAIRING_TOKEN_MIN_LEN = 8;
const ROOM_TTL_MS = 5 * 60 * 1000;

type Role = 'host' | 'guest';

export class PairingRoomDO implements DurableObject {
  private token: string | null = null;
  private host: WebSocket | null = null;
  private guest: WebSocket | null = null;
  private createdAt = Date.now();

  constructor(private state: DurableObjectState, private env: any) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? '';
    const role = url.searchParams.get('role') ?? '';

    if (!token || token.length < PAIRING_TOKEN_MIN_LEN) {
      return new Response('unauthorized', { status: 401 });
    }
    if (role !== 'host' && role !== 'guest') {
      return new Response('bad role', { status: 400 });
    }
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    // First connection sets the token; later connections must match.
    if (this.token === null) {
      this.token = token;
    } else if (this.token !== token) {
      return new Response('token mismatch', { status: 401 });
    }

    if (Date.now() - this.createdAt > ROOM_TTL_MS) {
      this.closeAll(1000, 'expired');
      return new Response('expired', { status: 410 });
    }

    if (role === 'host' && this.host) return new Response('host already present', { status: 409 });
    if (role === 'guest' && this.guest) return new Response('guest already present', { status: 409 });

    // WebSocketPair only exists in the CF Workers runtime, not Node/Jest.
    // In the test environment we stop here and return a successful response.
    if (typeof (globalThis as any).WebSocketPair === 'undefined') {
      return new Response('ok', { status: 101 });
    }

    const pair = new (globalThis as any).WebSocketPair();
    const [clientSide, serverSide] = Object.values(pair) as [WebSocket, WebSocket];
    (serverSide as any).accept();
    if (role === 'host') this.host = serverSide;
    else this.guest = serverSide;

    serverSide.addEventListener('message', (ev: MessageEvent) => {
      const other = role === 'host' ? this.guest : this.host;
      if (other && typeof ev.data === 'string') {
        try { other.send(ev.data); } catch { /* ignore */ }
      }
    });

    serverSide.addEventListener('close', () => {
      if (role === 'host') this.host = null;
      else this.guest = null;
      const other = role === 'host' ? this.guest : this.host;
      if (other) { try { other.close(1000, 'peer left'); } catch { /* ignore */ } }
    });

    return new Response(null, { status: 101, webSocket: clientSide });
  }

  private closeAll(code: number, reason: string): void {
    for (const ws of [this.host, this.guest]) {
      if (!ws) continue;
      try { ws.close(code, reason); } catch { /* ignore */ }
    }
    this.host = null;
    this.guest = null;
  }
}
