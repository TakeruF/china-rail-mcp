import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

interface EdgeOneContext {
  request: Request;
  env: Record<string, string | undefined>;
}

interface ClientPayload {
  redirectUris: string[];
  exp: number;
}

interface AuthorizationCodePayload {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scope: string;
  exp: number;
}

interface AccessTokenPayload {
  clientId: string;
  resource: string;
  scope: string;
  exp: number;
}

type RefreshTokenPayload = AccessTokenPayload;

const READ_SCOPE = 'mcp:read';
const OFFLINE_SCOPE = 'offline_access';
const DEFAULT_PUBLIC_ORIGIN = 'https://china-rail-mcp.edgeone.dev';
const BASE64URL = /^[A-Za-z0-9_-]{43,128}$/u;
const MAX_BODY_BYTES = 32_768;

function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  });
}

function hmac(value: string, secret: string, purpose: string): string {
  return createHmac('sha256', secret).update(`${purpose}.${value}`).digest('base64url');
}

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function seal(payload: object, secret: string, purpose: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${purpose}.${encoded}.${hmac(encoded, secret, purpose)}`;
}

function unseal<T extends { exp: number }>(
  token: string,
  secret: string,
  purpose: string,
): T | undefined {
  const [actualPurpose, encoded, signature, extra] = token.split('.');
  if (extra !== undefined || actualPurpose !== purpose || !encoded || !signature) return undefined;
  if (!secureEqual(signature, hmac(encoded, secret, purpose))) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
    return Number.isFinite(payload.exp) && payload.exp > Date.now() ? payload : undefined;
  } catch {
    return undefined;
  }
}

function origin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedHost) {
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const forwardedOrigin = `${forwardedProto === 'http' ? 'http' : 'https'}://${forwardedHost}`;
    return new URL(request.url).pathname.startsWith('/api/')
      ? `${forwardedOrigin}/api`
      : forwardedOrigin;
  }
  const url = new URL(request.url);
  if (url.protocol !== 'https:') return DEFAULT_PUBLIC_ORIGIN;
  return url.pathname.startsWith('/api/') ? `${url.origin}/api` : url.origin;
}

function resourceUrl(request: Request): string {
  return `${origin(request)}/mcp`;
}

function oauthSecret(env: EdgeOneContext['env']): string | undefined {
  return env.MCP_HTTP_BEARER_TOKEN;
}

function scopes(value: string | null): string[] {
  return (value ?? READ_SCOPE).split(/\s+/u).filter(Boolean);
}

function validScopes(value: string[]): boolean {
  return (
    value.includes(READ_SCOPE) &&
    value.every((scope) => scope === READ_SCOPE || scope === OFFLINE_SCOPE)
  );
}

function validRedirectUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function clientPayload(clientId: string, secret: string): ClientPayload | undefined {
  const payload = unseal<ClientPayload>(clientId, secret, 'client');
  return payload &&
    Array.isArray(payload.redirectUris) &&
    payload.redirectUris.every(validRedirectUri)
    ? payload
    : undefined;
}

function validateClient(clientId: string, redirectUri: string, secret: string): boolean {
  return clientPayload(clientId, secret)?.redirectUris.includes(redirectUri) === true;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function authorizePage(params: URLSearchParams, secret: string, action: string): Response {
  const serialized = params.toString();
  const proof = hmac(serialized, secret, 'authorize-request');
  const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize China Rail MCP</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f6f8; color: #17202a; }
    main { width: min(430px, calc(100% - 40px)); padding: 28px; border-radius: 16px; background: white; box-shadow: 0 12px 40px #0002; }
    h1 { margin: 0 0 10px; font-size: 1.4rem; }
    p { line-height: 1.55; color: #4d5966; }
    label { display: grid; gap: 8px; margin-top: 22px; font-weight: 650; }
    input { box-sizing: border-box; width: 100%; padding: 12px; border: 1px solid #b7c0ca; border-radius: 9px; font: inherit; }
    button { width: 100%; margin-top: 18px; padding: 12px; border: 0; border-radius: 9px; color: white; background: #1769aa; font: inherit; font-weight: 700; cursor: pointer; }
    small { display: block; margin-top: 16px; color: #687581; line-height: 1.45; }
    @media (prefers-color-scheme: dark) { body { background: #11161c; color: #eef2f5; } main { background: #1b222a; } p, small { color: #b9c3cc; } }
  </style>
</head>
<body>
  <main>
    <h1>Authorize China Rail MCP</h1>
    <p>Allow ChatGPT to use the read-only official 12306 timetable, fare, stop, and seat-availability tools.</p>
    <form method="post" action="${htmlEscape(action)}">
      <input type="hidden" name="request" value="${htmlEscape(serialized)}">
      <input type="hidden" name="proof" value="${htmlEscape(proof)}">
      <label>Connection password
        <input type="password" name="password" autocomplete="current-password" required autofocus>
      </label>
      <button type="submit">Authorize ChatGPT</button>
    </form>
    <small>This integration cannot log in to 12306, book tickets, make payments, or modify railway accounts.</small>
  </main>
</body>
</html>`;
  return new Response(page, {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://chatgpt.com; base-uri 'none'; frame-ancestors 'none'",
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function bodyText(request: Request): Promise<string | undefined> {
  const text = await request.text();
  return Buffer.byteLength(text) <= MAX_BODY_BYTES ? text : undefined;
}

function issueTokens(
  payload: Omit<AccessTokenPayload, 'exp'>,
  secret: string,
): Record<string, unknown> {
  const accessToken = seal({ ...payload, exp: Date.now() + 60 * 60 * 1_000 }, secret, 'access');
  const refreshToken = seal(
    { ...payload, exp: Date.now() + 30 * 24 * 60 * 60 * 1_000 },
    secret,
    'refresh',
  );
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3_600,
    refresh_token: refreshToken,
    scope: payload.scope,
  };
}

export function oauthMetadata(request: Request): Response {
  const base = origin(request);
  return json(200, {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [READ_SCOPE, OFFLINE_SCOPE],
  });
}

export function protectedResourceMetadata(request: Request): Response {
  const base = origin(request);
  return json(200, {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: [READ_SCOPE, OFFLINE_SCOPE],
    bearer_methods_supported: ['header'],
  });
}

export async function registerClient({ request, env }: EdgeOneContext): Promise<Response> {
  const secret = oauthSecret(env);
  if (!secret) return json(503, { error: 'OAuth is not configured.' });
  const raw = await bodyText(request);
  if (raw === undefined) return json(413, { error: 'invalid_client_metadata' });
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const redirectUris = body.redirect_uris;
    if (
      !Array.isArray(redirectUris) ||
      redirectUris.length < 1 ||
      redirectUris.length > 3 ||
      !redirectUris.every(validRedirectUri) ||
      (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== 'none')
    ) {
      return json(400, { error: 'invalid_client_metadata' });
    }
    const clientId = seal(
      { redirectUris, exp: Date.now() + 365 * 24 * 60 * 60 * 1_000 },
      secret,
      'client',
    );
    return json(201, {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1_000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  } catch {
    return json(400, { error: 'invalid_client_metadata' });
  }
}

export async function authorize({ request, env }: EdgeOneContext): Promise<Response> {
  const secret = oauthSecret(env);
  if (!secret) return json(503, { error: 'OAuth is not configured.' });
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const clientId = url.searchParams.get('client_id');
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    const challenge = url.searchParams.get('code_challenge');
    const challengeMethod = url.searchParams.get('code_challenge_method');
    const responseType = url.searchParams.get('response_type');
    const resource = url.searchParams.get('resource') ?? resourceUrl(request);
    const requestedScopes = scopes(url.searchParams.get('scope'));
    if (
      !clientId ||
      !redirectUri ||
      !state ||
      !challenge ||
      !BASE64URL.test(challenge) ||
      challengeMethod !== 'S256' ||
      responseType !== 'code' ||
      resource !== resourceUrl(request) ||
      !validScopes(requestedScopes) ||
      !validateClient(clientId, redirectUri, secret)
    ) {
      return json(400, { error: 'invalid_request' });
    }
    const normalized = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      resource,
      scope: requestedScopes.join(' '),
    });
    return authorizePage(normalized, secret, new URL(request.url).pathname);
  }

  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const raw = await bodyText(request);
  if (raw === undefined) return json(413, { error: 'invalid_request' });
  const form = new URLSearchParams(raw);
  const serialized = form.get('request');
  const proof = form.get('proof');
  const password = form.get('password');
  if (
    !serialized ||
    !proof ||
    !password ||
    !secureEqual(proof, hmac(serialized, secret, 'authorize-request')) ||
    !secureEqual(password, secret)
  ) {
    return json(401, { error: 'access_denied' });
  }
  const params = new URLSearchParams(serialized);
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state');
  const challenge = params.get('code_challenge');
  const resource = params.get('resource');
  const scope = params.get('scope');
  if (
    !clientId ||
    !redirectUri ||
    !state ||
    !challenge ||
    !resource ||
    !scope ||
    !validateClient(clientId, redirectUri, secret)
  ) {
    return json(400, { error: 'invalid_request' });
  }
  const code = seal(
    {
      clientId,
      redirectUri,
      codeChallenge: challenge,
      resource,
      scope,
      exp: Date.now() + 5 * 60 * 1_000,
    },
    secret,
    'code',
  );
  const callback = new URL(redirectUri);
  callback.searchParams.set('code', code);
  callback.searchParams.set('state', state);
  return new Response(null, {
    status: 303,
    headers: { location: callback.href, 'cache-control': 'no-store' },
  });
}

export async function token({ request, env }: EdgeOneContext): Promise<Response> {
  const secret = oauthSecret(env);
  if (!secret) return json(503, { error: 'OAuth is not configured.' });
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const raw = await bodyText(request);
  if (raw === undefined) return json(413, { error: 'invalid_request' });
  const form = new URLSearchParams(raw);
  const grantType = form.get('grant_type');

  if (grantType === 'authorization_code') {
    const code = form.get('code');
    const verifier = form.get('code_verifier');
    const clientId = form.get('client_id');
    const redirectUri = form.get('redirect_uri');
    const resource = form.get('resource') ?? resourceUrl(request);
    const grant = code ? unseal<AuthorizationCodePayload>(code, secret, 'code') : undefined;
    const challenge = verifier ? createHash('sha256').update(verifier).digest('base64url') : '';
    if (
      !grant ||
      !clientId ||
      !redirectUri ||
      !verifier ||
      !BASE64URL.test(verifier) ||
      grant.clientId !== clientId ||
      grant.redirectUri !== redirectUri ||
      grant.resource !== resource ||
      !secureEqual(challenge, grant.codeChallenge) ||
      !validateClient(clientId, redirectUri, secret)
    ) {
      return json(400, { error: 'invalid_grant' });
    }
    return json(200, issueTokens({ clientId, resource, scope: grant.scope }, secret));
  }

  if (grantType === 'refresh_token') {
    const refresh = form.get('refresh_token');
    const clientId = form.get('client_id');
    const resource = form.get('resource') ?? resourceUrl(request);
    const grant = refresh ? unseal<RefreshTokenPayload>(refresh, secret, 'refresh') : undefined;
    if (
      !grant ||
      !clientId ||
      grant.clientId !== clientId ||
      grant.resource !== resource ||
      !clientPayload(clientId, secret)
    ) {
      return json(400, { error: 'invalid_grant' });
    }
    return json(200, issueTokens({ clientId, resource, scope: grant.scope }, secret));
  }

  return json(400, { error: 'unsupported_grant_type' });
}

export function oauthAccessAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get('authorization');
  const supplied = authorization?.match(/^Bearer\s+(.+)$/iu)?.[1];
  if (!supplied) return false;
  const payload = unseal<AccessTokenPayload>(supplied, secret, 'access');
  return payload?.resource === resourceUrl(request) && scopes(payload.scope).includes(READ_SCOPE);
}

export function oauthChallenge(request: Request): string {
  const base = origin(request);
  const metadataPath = base.endsWith('/api')
    ? '/oauth-protected-resource'
    : '/.well-known/oauth-protected-resource/mcp';
  return `Bearer resource_metadata="${base}${metadataPath}"`;
}
