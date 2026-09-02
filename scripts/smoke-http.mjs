const rawBase = process.argv[2];
if (!rawBase) {
  console.error('Usage: npm run smoke:http -- https://YOUR_HOST/api');
  process.exit(2);
}

const base = new URL(rawBase);
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
  console.error('The deployment base must be a plain HTTPS URL without credentials.');
  process.exit(2);
}
const origin = base.origin;
const basePath = base.pathname.replace(/\/+$/u, '');
const baseUrl = `${origin}${basePath}`;
const vercelStyle = basePath.endsWith('/api');
const endpoints = {
  health: new URL(`${basePath}/health`, origin),
  mcp: new URL(`${basePath}/mcp`, origin),
  authorization: new URL(
    vercelStyle
      ? '/.well-known/oauth-authorization-server/api'
      : '/.well-known/oauth-authorization-server',
    origin,
  ),
  resource: new URL(
    vercelStyle
      ? `${basePath}/oauth-protected-resource`
      : '/.well-known/oauth-protected-resource/mcp',
    origin,
  ),
};

async function jsonRequest(name, url, expectedStatus) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${name} returned ${response.status}; expected ${expectedStatus}.`);
  }
  const body = await response.json();
  return { response, body };
}

const health = await jsonRequest('health', endpoints.health, 200);
if (health.body.status !== 'ok' || health.body.service !== 'china-rail-mcp') {
  throw new Error(`Unexpected health response: ${JSON.stringify(health.body)}`);
}

const authorization = await jsonRequest('authorization metadata', endpoints.authorization, 200);
if (
  typeof authorization.body.authorization_endpoint !== 'string' ||
  typeof authorization.body.token_endpoint !== 'string'
) {
  throw new Error('Authorization metadata is missing required endpoints.');
}

const resource = await jsonRequest('protected-resource metadata', endpoints.resource, 200);
if (resource.body.resource !== endpoints.mcp.href) {
  throw new Error(
    `Protected-resource metadata advertised ${resource.body.resource}; expected ${endpoints.mcp.href}.`,
  );
}

const unauthorized = await jsonRequest('unauthenticated MCP request', endpoints.mcp, 401);
if (!unauthorized.response.headers.get('www-authenticate')?.includes('resource_metadata=')) {
  throw new Error('The MCP 401 response is missing OAuth resource discovery metadata.');
}

console.log(`HTTP deployment smoke passed for ${baseUrl}.`);
console.log('Health and OAuth discovery returned 200; unauthenticated MCP correctly returned 401.');
