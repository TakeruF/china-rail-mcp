import { onRequestGet as health } from './health.js';
import { onRequest as mcp } from './mcp.js';
import {
  authorize,
  oauthMetadata,
  protectedResourceMetadata,
  registerClient,
  token,
} from './oauth.js';

interface HttpContext {
  request: Request;
  env: Record<string, string | undefined>;
}

/** Shared Node.js handler for the EdgeOne hub's namespaced and legacy endpoints. */
export async function handleRequest(context: HttpContext): Promise<Response> {
  const { request } = context;
  const path = new URL(request.url).pathname;
  const prefix = path.startsWith('/china-rail/') ? '/china-rail' : '';
  const route = path.slice(prefix.length);
  if (route === '/health' && request.method === 'GET') return health();
  if (route === '/mcp') return mcp(context);
  if (route === '/authorize') return authorize(context);
  if (route === '/token') return token(context);
  if (route === '/register') return registerClient(context);
  if (
    route === '/.well-known/oauth-protected-resource' ||
    route === '/.well-known/oauth-protected-resource/mcp' ||
    path === '/.well-known/oauth-protected-resource/china-rail/mcp'
  )
    return protectedResourceMetadata(request);
  if (
    route === '/.well-known/oauth-authorization-server' ||
    route === '/.well-known/openid-configuration' ||
    path === '/.well-known/oauth-authorization-server/china-rail'
  )
    return oauthMetadata(request);
  return Response.json(
    { error: 'Not found' },
    {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
