import { oauthMetadata, protectedResourceMetadata } from './oauth.js';

interface EdgeOneContext {
  request: Request;
}

export function onRequest({ request }: EdgeOneContext): Response {
  const pathname = new URL(request.url).pathname;
  if (
    pathname === '/.well-known/oauth-protected-resource' ||
    pathname === '/.well-known/oauth-protected-resource/mcp'
  ) {
    return protectedResourceMetadata(request);
  }
  if (
    pathname === '/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/openid-configuration'
  ) {
    return oauthMetadata(request);
  }
  return Response.json(
    { error: 'Not found' },
    { status: 404, headers: { 'cache-control': 'no-store' } },
  );
}
