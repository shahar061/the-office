export { SessionDO } from './session-do';
export { PairingRoomDO } from './pairing-room-do';

interface Env {
  SESSION_DO: DurableObjectNamespace;
  PAIRING_ROOM_DO: DurableObjectNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/healthz') return new Response('ok');

    const sess = url.pathname.match(/^\/s\/([A-Za-z0-9_-]+)(\/.*)?$/);
    if (sess) {
      const id = env.SESSION_DO.idFromName(sess[1]);
      return env.SESSION_DO.get(id).fetch(req);
    }

    const pair = url.pathname.match(/^\/pair\/([A-Za-z0-9_-]+)$/);
    if (pair) {
      const id = env.PAIRING_ROOM_DO.idFromName(pair[1]);
      return env.PAIRING_ROOM_DO.get(id).fetch(req);
    }

    return new Response('not found', { status: 404 });
  },
};
