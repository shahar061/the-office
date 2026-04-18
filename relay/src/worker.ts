export { SessionDO } from './session-do';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/healthz') return new Response('ok');
    return new Response('Not found', { status: 404 });
  },
};

interface Env { SESSION_DO: DurableObjectNamespace; }
