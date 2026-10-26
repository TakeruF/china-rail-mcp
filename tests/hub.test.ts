import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../cloud-functions/router.js';

const origin = 'https://mcp.takeruf.com';
const base = `${origin}/china-rail`;
const env = { MCP_HTTP_BEARER_TOKEN: 'test-hub-secret' };
const call = (path: string, init?: RequestInit) =>
  handleRequest({
    request: new Request(`${origin}${path}`, init),
    env,
  });
afterEach(() => vi.unstubAllEnvs());

describe('EdgeOne MCP hub', () => {
  it('serves namespaced health and refuses unknown services and private files', async () => {
    expect(await (await call('/china-rail/health')).json()).toMatchObject({
      status: 'ok',
      service: 'china-rail-mcp',
    });
    for (const path of ['/unknown/mcp', '/runtime.mjs', '/.env', '/china-rail/unknown']) {
      expect((await call(path)).status).toBe(404);
    }
  });

  it('advertises the exact namespaced resource and authorization metadata', async () => {
    const response = await call('/china-rail/mcp');
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/china-rail/mcp"`,
    );
    expect(
      await (await call('/.well-known/oauth-protected-resource/china-rail/mcp')).json(),
    ).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [base] });
    expect(
      await (await call('/.well-known/oauth-authorization-server/china-rail')).json(),
    ).toMatchObject({
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
    });
  });

  it('uses the configured public origin for EdgeOne internal requests', async () => {
    vi.stubEnv('MCP_PUBLIC_ORIGIN', origin);
    const response = await handleRequest({
      request: new Request('http://internal/.well-known/oauth-protected-resource/china-rail/mcp'),
      env,
    });
    expect(await response.json()).toMatchObject({ resource: `${base}/mcp` });
  });

  it('completes namespaced OAuth and initializes MCP, preserving audience boundaries', async () => {
    const registration = await call('/china-rail/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['https://chatgpt.com/oauth/callback'],
        token_endpoint_auth_method: 'none',
      }),
    });
    expect(registration.status).toBe(201);
    const { client_id: clientId } = await registration.json();
    const verifier = 'v'.repeat(64);
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://chatgpt.com/oauth/callback',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      resource: `${base}/mcp`,
      scope: 'mcp:read',
      state: 'test-state',
    });
    const consent = await call(`/china-rail/authorize?${query}`, {
      headers: { 'accept-language': 'ja-JP, en;q=0.5' },
    });
    expect(consent.status).toBe(200);
    let html = await consent.text();
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('接続用パスワード');
    // Switching languages must preserve every OAuth parameter and the signed consent.
    const initialProof = /name="proof" value="([^"]+)"/u.exec(html)![1]!;
    for (const [lang, label] of [
      ['zh-CN', '连接密码'],
      ['ko', '연결 비밀번호'],
      ['en', 'Connection password'],
    ]) {
      const link = new RegExp(`href="([^"]+)" lang="${lang}"`, 'u')
        .exec(html)![1]!
        .replaceAll('&amp;', '&');
      const switchedUrl = new URL(link, origin);
      for (const [key, value] of query) expect(switchedUrl.searchParams.get(key)).toBe(value);
      const switched = await call(`${switchedUrl.pathname}${switchedUrl.search}`, {
        headers: { 'accept-language': 'ja-JP' },
      });
      expect(switched.status).toBe(200);
      html = await switched.text();
      expect(html).toContain(`<html lang="${lang}">`);
      expect(html).toContain(label);
      expect(/name="proof" value="([^"]+)"/u.exec(html)![1]).toBe(initialProof);
    }
    expect(html).toContain('action="/china-rail/authorize"');
    const serialized = /name="request" value="([^"]+)"/u.exec(html)![1]!.replaceAll('&amp;', '&');
    const proof = /name="proof" value="([^"]+)"/u.exec(html)![1]!;
    const approved = await call('/china-rail/authorize', {
      method: 'POST',
      body: new URLSearchParams({
        request: serialized,
        proof,
        password: env.MCP_HTTP_BEARER_TOKEN,
      }),
    });
    expect(approved.status).toBe(303);
    const code = new URL(approved.headers.get('location')!).searchParams.get('code')!;
    const exchange = await call('/china-rail/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: clientId,
        redirect_uri: 'https://chatgpt.com/oauth/callback',
        resource: `${base}/mcp`,
      }),
    });
    expect(exchange.status).toBe(200);
    const { access_token: accessToken } = await exchange.json();
    const init = () => ({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'hub-test', version: '1.0.0' },
        },
      }),
    });
    const connected = await call('/china-rail/mcp', init());
    expect(connected.status).toBe(200);
    expect(await connected.json()).toMatchObject({
      result: {
        serverInfo: { name: 'china-rail-mcp' },
        capabilities: { tools: { listChanged: true } },
      },
    });
    expect((await call('/mcp', init())).status).toBe(401);
    const malformed = await call('/china-rail/mcp', { ...init(), body: '{invalid' });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: -32700 } });
  });
});
