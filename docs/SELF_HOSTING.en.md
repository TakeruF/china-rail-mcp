# Self-hosting China Rail MCP

[简体中文](SELF_HOSTING.md) | **English**

This guide covers four reproducible setups:

1. local stdio, for MCP clients running on the same computer;
2. Docker stdio, using a fixed Node.js 20 container;
3. an EdgeOne Makers deployment with the directory and namespaced HTTPS MCP endpoint;
4. a private Vercel deployment as an alternative HTTPS host.

The server never needs a 12306 account, user cookie, CAPTCHA, SMS code, or payment data.

## Prerequisites

- Git
- Node.js 20 or newer
- npm 10 or newer
- outbound HTTPS access to `12306.cn` for live railway data

Docker is optional. The repository's CI configuration covers Windows, macOS, and Linux; the live
12306 test remains manual because it calls a changing upstream service.

## Local stdio setup

```sh
git clone https://github.com/TakeruF/china-rail-mcp.git
cd china-rail-mcp
npm ci
npm run verify
```

`npm run verify` checks the environment, source, types, fixture tests, build, formatting,
production dependency audit, and a real JSON-RPC stdio initialization. It does not contact 12306. Run the opt-in live verification separately:

```sh
npm run test:integration
```

Start the server with:

```sh
npm start
```

Use an absolute checkout path in an MCP client configuration:

```json
{
  "mcpServers": {
    "china-rail": {
      "command": "node",
      "args": ["/absolute/path/to/china-rail-mcp/dist/index.js"]
    }
  }
}
```

No `.env` file is required in local stdio mode.

## Docker setup

Build the pinned Node 20 runtime image:

```sh
docker build -t china-rail-mcp:local .
```

Use the container as a stdio MCP command:

```json
{
  "mcpServers": {
    "china-rail": {
      "command": "docker",
      "args": ["run", "--interactive", "--rm", "china-rail-mcp:local"]
    }
  }
}
```

The container needs outbound HTTPS access but no mounted credentials or writable volume.

## EdgeOne Makers deployment

The current hosted service is [mcp.takeruf.com](https://mcp.takeruf.com). With a connection
password issued by its administrator, add `https://mcp.takeruf.com/china-rail/mcp` to your
remote MCP client and complete OAuth. The directory and consent screen support Japanese,
Chinese, Korean, and English; changing language does not change the MCP endpoint.

To operate a separate instance, follow [the EdgeOne hub guide](../makers/README.md). Use your
own project, stable HTTPS origin, and unique secret environment variable:

- `MCP_HTTP_BEARER_TOKEN`: the connection password and OAuth signing secret;
- `MCP_PUBLIC_ORIGIN`: your HTTPS origin, with no path, query, or fragment.

Build with `npm run build:edgeone`, deploy with
`npm run deploy:edgeone -- YOUR_PROJECT_NAME`, and run
`npm run smoke:http -- https://YOUR_HOST/china-rail`. That smoke test checks server health,
OAuth discovery, and authentication protection; it does not query live 12306 data. Connect
`https://YOUR_HOST/china-rail/mcp` with OAuth and verify an actual tool call separately.
The bundled directory's connection URL and canonical links target `mcp.takeruf.com`; customize
them in `makers/templates/directory.html` and `makers/public/index.html` for a separate public hub.

## Private Vercel deployment

The repository includes `vercel.json` and the catch-all API entry required for the HTTP MCP and
OAuth endpoints. Each operator must use a unique secret; never reuse the example value or share
the secret in an issue, commit, command transcript, or screenshot.

1. Create a strong secret locally:

   ```sh
   npm run generate:secret
   ```

2. Import the cloned repository into a personal Vercel project.
3. In the Vercel project settings, add `MCP_HTTP_BEARER_TOKEN` to the Production environment.
4. Deploy the current commit.
5. Run the deployment smoke test, replacing the host with the assigned deployment host:

   ```sh
   npm run smoke:http -- https://YOUR_HOST/api
   ```

   The smoke test verifies these endpoints without sending the deployment secret:

   ```text
   https://YOUR_HOST/api/health
   https://YOUR_HOST/.well-known/oauth-authorization-server/api
   https://YOUR_HOST/api/oauth-protected-resource
   https://YOUR_HOST/api/mcp
   ```

   The first three endpoints must return `200`. The unauthenticated request to `/api/mcp` must
   return `401` with a `WWW-Authenticate` discovery header.

6. In ChatGPT Developer Mode, add `https://YOUR_HOST/api/mcp` as the MCP server URL. Complete the
   OAuth page with the value of `MCP_HTTP_BEARER_TOKEN` stored in the Vercel project.

The generated access and refresh tokens are signed and self-contained. This personal deployment
does not require a database. Rotating `MCP_HTTP_BEARER_TOKEN` invalidates every existing client,
authorization code, access token, and refresh token for that deployment.

## Using it on a phone

The phone does not connect directly to a stdio process on your computer. It connects to the HTTPS
MCP deployed above. Complete the connection and OAuth first in a web or desktop client that
currently supports adding remote MCP, then open a new conversation in the phone app with the same
account, select the connection, and make a real query.

Verify these as three separate states:

1. the HTTPS deployment and unauthenticated smoke test succeed;
2. the AI-client account completes OAuth and can call tools on web or desktop;
3. the same account can see the connection and call a tool on mobile.

The first two do not prove the third. Remote-MCP availability on mobile may vary with the client
version, account plan, staged rollout, or workspace policy. Do not work around a client limitation
by making the MCP endpoint public or removing authentication.

## Reproducibility boundary

The build and protocol behavior are reproducible from the lockfile and tests. Live timetables,
fares, and availability are not deterministic artifacts: they depend on undocumented public
12306 interfaces, the current sales window, network reachability, and upstream rate controls.
The live integration test verifies behavior at a point in time; it cannot guarantee future
availability or permission to operate a public shared service.

This setup is intended for a person's own low-frequency, read-only use. It does not add shared
multi-user authentication, centralized logging, bulk collection, background polling, booking,
or payment automation.
