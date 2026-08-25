import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { onRequest as authorize } from '../cloud-functions/authorize.js';
import { onRequest as metadata } from '../cloud-functions/[[path]].js';
import { onRequest as mcp } from '../cloud-functions/mcp.js';
import { onRequest as register } from '../cloud-functions/register.js';
import { onRequest as token } from '../cloud-functions/token.js';

const base = 'https://china-rail-mcp.example';
const secret = 'test-connection-password';
const env = { MCP_HTTP_BEARER_TOKEN: secret };

function context(path: string, init?: RequestInit) {
  return { request: new Request(`${base}${path}`, init), env };
}

async function registerClient(): Promise<string> {
  const response = await register(
    context('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['https://chatgpt.com/oauth/callback'],
        token_endpoint_auth_method: 'none',
      }),
    }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { client_id: string }).client_id;
}

describe('EdgeOne ChatGPT OAuth', () => {
  it('publishes protected-resource and authorization-server metadata', async () => {
    const resource = metadata(context('/.well-known/oauth-protected-resource/mcp'));
    await expect(resource.json()).resolves.toMatchObject({
      resource: `${base}/mcp`,
      authorization_servers: [base],
      scopes_supported: ['mcp:read', 'offline_access'],
    });

    const discovery = metadata(context('/.well-known/oauth-authorization-server'));
    await expect(discovery.json()).resolves.toMatchObject({
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
    });
  });

  it('completes DCR, PKCE authorization, refresh, and MCP initialization', async () => {
    const clientId = await registerClient();
    const verifier = 'v'.repeat(64);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorizeUrl = new URL(`${base}/authorize`);
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://chatgpt.com/oauth/callback',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: `${base}/mcp`,
      scope: 'mcp:read offline_access',
      state: 'chatgpt-state',
    }).toString();
    const consent = await authorize({ request: new Request(authorizeUrl), env });
    expect(consent.status).toBe(200);
    const page = await consent.text();
    const request = /name="request" value="([^"]+)"/u.exec(page)?.[1]?.replaceAll('&amp;', '&');
    const proof = /name="proof" value="([^"]+)"/u.exec(page)?.[1];
    expect(request).toBeTruthy();
    expect(proof).toBeTruthy();

    const approval = await authorize(
      context('/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ request: request!, proof: proof!, password: secret }),
      }),
    );
    expect(approval.status).toBe(303);
    const callback = new URL(approval.headers.get('location')!);
    expect(callback.searchParams.get('state')).toBe('chatgpt-state');

    const exchange = await token(
      context('/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: callback.searchParams.get('code')!,
          code_verifier: verifier,
          redirect_uri: 'https://chatgpt.com/oauth/callback',
          client_id: clientId,
          resource: `${base}/mcp`,
        }),
      }),
    );
    expect(exchange.status).toBe(200);
    const tokens = (await exchange.json()) as { access_token: string; refresh_token: string };

    const refreshed = await token(
      context('/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
          client_id: clientId,
          resource: `${base}/mcp`,
        }),
      }),
    );
    expect(refreshed.status).toBe(200);

    const initialize = await mcp(
      context('/mcp', {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${tokens.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'chatgpt-test', version: '1.0.0' },
          },
        }),
      }),
    );
    expect(initialize.status).toBe(200);
    await expect(initialize.json()).resolves.toMatchObject({
      result: { serverInfo: { name: 'china-rail-mcp' } },
    });
  });

  it('rejects an incorrect connection password', async () => {
    const clientId = await registerClient();
    const challenge = createHash('sha256').update('x'.repeat(64)).digest('base64url');
    const url = new URL(`${base}/authorize`);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://chatgpt.com/oauth/callback',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: `${base}/mcp`,
      scope: 'mcp:read',
      state: 'state',
    }).toString();
    const consent = await authorize({ request: new Request(url), env });
    const page = await consent.text();
    const request =
      /name="request" value="([^"]+)"/u.exec(page)?.[1]?.replaceAll('&amp;', '&') ?? '';
    const proof = /name="proof" value="([^"]+)"/u.exec(page)?.[1] ?? '';
    const denied = await authorize(
      context('/authorize', {
        method: 'POST',
        body: new URLSearchParams({ request, proof, password: 'wrong' }),
      }),
    );
    expect(denied.status).toBe(401);
  });
});
