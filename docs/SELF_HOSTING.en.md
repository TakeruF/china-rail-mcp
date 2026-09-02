# Self-hosting China Rail MCP

[简体中文](SELF_HOSTING.md) | **English**

This guide covers three reproducible setups:

1. local stdio, for MCP clients running on the same computer;
2. Docker stdio, using a fixed Node.js 20 container;
3. a private Vercel deployment, for clients that require a public HTTPS MCP URL.

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

## Reproducibility boundary

The build and protocol behavior are reproducible from the lockfile and tests. Live timetables,
fares, and availability are not deterministic artifacts: they depend on undocumented public
12306 interfaces, the current sales window, network reachability, and upstream rate controls.
The live integration test verifies behavior at a point in time; it cannot guarantee future
availability or permission to operate a public shared service.

This setup is intended for a person's own low-frequency, read-only use. It does not add shared
multi-user authentication, centralized logging, bulk collection, background polling, booking,
or payment automation.
