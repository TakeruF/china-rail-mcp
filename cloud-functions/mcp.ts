import { timingSafeEqual } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Rail12306Provider } from '../src/providers/rail12306.js';
import { createServer } from '../src/server.js';
import { oauthAccessAuthorized, oauthChallenge } from './oauth.js';

interface EdgeOneContext {
  request: Request;
  env: Record<string, string | undefined>;
}

const provider = new Rail12306Provider();

function authorized(request: Request, expectedToken: string): boolean {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  });
}

export async function onRequest({ request, env }: EdgeOneContext): Promise<Response> {
  const token = env.MCP_HTTP_BEARER_TOKEN;
  if (!token) return json(503, { error: 'MCP HTTP transport is not configured.' });
  if (!authorized(request, token) && !oauthAccessAuthorized(request, token)) {
    return json(401, { error: 'Unauthorized' }, { 'www-authenticate': oauthChallenge(request) });
  }

  const server = createServer(provider);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
