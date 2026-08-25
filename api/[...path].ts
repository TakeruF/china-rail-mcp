import { authorize } from '../cloud-functions/oauth.js';
import { onRequestGet as health } from '../cloud-functions/health.js';
import { onRequest as mcp } from '../cloud-functions/mcp.js';
import {
  oauthMetadata,
  protectedResourceMetadata,
  registerClient,
  token,
} from '../cloud-functions/oauth.js';

const env = process.env as Record<string, string | undefined>;

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const context = { request, env };

  if (pathname === '/api/mcp') return mcp(context);
  if (pathname === '/api/health' && request.method === 'GET') return health();
  if (pathname === '/api/authorize') return authorize(context);
  if (pathname === '/api/token') return token(context);
  if (pathname === '/api/register') return registerClient(context);
  if (
    pathname === '/api/oauth-protected-resource' ||
    pathname === '/api/.well-known/oauth-protected-resource' ||
    pathname === '/api/.well-known/oauth-protected-resource/mcp'
  ) {
    return protectedResourceMetadata(request);
  }
  if (
    pathname === '/api/oauth-authorization-server' ||
    pathname === '/api/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/oauth-authorization-server/api'
  ) {
    const metadataRequest = pathname.startsWith('/api/')
      ? request
      : new Request(`${url.origin}/api/oauth-authorization-server`, {
          headers: request.headers,
        });
    return oauthMetadata(metadataRequest);
  }
  return Response.json(
    { error: 'Not found' },
    { status: 404, headers: { 'cache-control': 'no-store' } },
  );
}

export default { fetch: handle };
