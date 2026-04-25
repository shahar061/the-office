interface Env {
  ADMIN_READ_TOKEN: string;
  WORKER_URL: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const path = (params.path as string[]).join('/');
  const url = new URL(request.url);
  const targetUrl = `${env.WORKER_URL}/${path}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${env.ADMIN_READ_TOKEN}`);
  headers.delete('Cookie'); // Don't forward Pages cookies to the Worker.

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const proxied = await fetch(targetUrl, init);
  const respHeaders = new Headers(proxied.headers);
  return new Response(proxied.body, {
    status: proxied.status,
    statusText: proxied.statusText,
    headers: respHeaders,
  });
};
