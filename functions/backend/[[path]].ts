const DEFAULT_BACKEND_ORIGIN = 'https://chaotic-backend.garudalinux.org';

interface Env {
  BACKEND_ORIGIN?: string;
}

interface RequestContext {
  request: Request;
  env: Env;
}

export const onRequest = ({ request, env }: RequestContext): Promise<Response> => {
  const url = new URL(request.url);
  const origin = env.BACKEND_ORIGIN ?? DEFAULT_BACKEND_ORIGIN;
  const target = new URL(url.pathname.replace(/^\/backend/, '') + url.search, origin);

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', url.host);

  const proxied = new Request(target.toString(), {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });

  return fetch(proxied);
};
