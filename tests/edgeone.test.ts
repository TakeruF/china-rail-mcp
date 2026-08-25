import { describe, expect, it } from 'vitest';
import { onRequestGet as health } from '../cloud-functions/health.js';
import { onRequest as mcp } from '../cloud-functions/mcp.js';

const endpoint = 'https://china-rail-mcp.example/mcp';

function request(body: unknown, token?: string): Request {
  return new Request(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('EdgeOne HTTP transport', () => {
  it('exposes a non-cached health response', async () => {
    const response = health();
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      transport: 'streamable-http',
      provider: '12306-official',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('stays closed until a bearer token is configured', async () => {
    const response = await mcp({
      request: request({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      env: {},
    });
    expect(response.status).toBe(503);
  });

  it('rejects a missing or incorrect bearer token', async () => {
    const response = await mcp({
      request: request({ jsonrpc: '2.0', id: 1, method: 'initialize' }, 'wrong'),
      env: { MCP_HTTP_BEARER_TOKEN: 'correct' },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('initializes over stateless Streamable HTTP when authorized', async () => {
    const response = await mcp({
      request: request(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'edgeone-test', version: '1.0.0' },
          },
        },
        'test-token',
      ),
      env: { MCP_HTTP_BEARER_TOKEN: 'test-token' },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        serverInfo: { name: 'china-rail-mcp', version: '0.1.0' },
        capabilities: { tools: {} },
      },
    });
  });
});
