export { SessionDO } from './session-do';

interface Env { SESSION_DO: DurableObjectNamespace; }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/healthz') return new Response('ok');
    const m = url.pathname.match(/^\/s\/([A-Za-z0-9_-]+)(\/.*)?$/);
    if (m) {
      const id = env.SESSION_DO.idFromName(m[1]);
      const stub = env.SESSION_DO.get(id);
      return stub.fetch(req);
    }
    return new Response('not found', { status: 404 });
  },
};
