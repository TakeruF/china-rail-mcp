# China Rail MCP

[简体中文](README.md) | **English**

China Rail MCP brings Chinese railway timetables, reference fares, and remaining-ticket
queries into MCP-compatible AI clients such as ChatGPT and Codex.

> **Note:** This is an unofficial, read-only project. It is not affiliated with, endorsed by,
> or sponsored by China Railway or 12306. It requires no 12306 login, does not accept user
> cookies, and cannot purchase, waitlist, snipe, or pay for tickets.

## See the difference

I asked ChatGPT:

> 今天下午5点之后，从广州去长沙的高铁还有哪几趟？

The screenshots below capture the same question on September 3, 2026. They are a
point-in-time example: results can change with the date, ticket sales, network conditions,
and the upstream 12306 service.

### Without China Rail MCP

ChatGPT alone could not reliably retrieve the complete list after 17:00 or current seat
availability, so it directed me to verify the result with 12306.

<img src="docs/images/chatgpt-without-mcp.jpg" alt="ChatGPT without China Rail MCP asks the user to verify the result in 12306" width="300">

### With China Rail MCP

With China Rail MCP connected, the same question returned trains departing after 17:00,
including departure and arrival times, duration, reference fares, and seat availability.

<img src="docs/images/chatgpt-with-mcp.jpg" alt="ChatGPT with China Rail MCP lists trains after 17:00 with times, fares, and availability" width="300">

### Compared with 12306

A check in the 12306 app at the same time matched the train numbers, times, and starting
reference fares for these representative results:

<img src="docs/images/12306-reference.jpg" alt="12306 app showing the same Guangzhou South to Changsha South search" width="300">

| Train | Departure | Arrival | Starting reference fare |
| ----- | --------- | ------- | ----------------------- |
| G1192 | 17:03     | 19:44   | ¥283                    |
| G1116 | 17:14     | 20:12   | ¥330                    |
| G400  | 17:27     | 19:49   | ¥377                    |
| G6010 | 17:33     | 19:35   | ¥320                    |
| G420  | 17:40     | 19:53   | ¥339                    |

**Same question. Same railway data. Now available directly to your AI.**

## Quick start

Not sure whether to use ChatGPT, Qwen Code, TRAE, Coze, or Claude? Start with Silkroad MCP's
[client compatibility guide](https://takeruf.github.io/silkroad-mcp/en/clients/). Use the
[self-hosting guide](docs/SELF_HOSTING.en.md) for this project's deployment steps.

### New to the command line? Let an AI set it up

Copy the entire prompt below into Codex, Claude Code, or another coding AI that can use your
terminal and edit files. It asks the AI to inspect the environment, install the project,
configure your current MCP client, and prove the connection with a real query.

```text
Install and configure China Rail MCP on this computer until I can make a real Chinese railway
query from the AI client I currently use. Repository: https://github.com/TakeruF/china-rail-mcp

Perform the work instead of only giving me a tutorial, and follow these requirements:

1. Identify the operating system, current AI/MCP client, and whether Git, Node.js, and npm are
   available. If you cannot determine which client I want configured, ask me only that question.
2. Read the repository's latest README and self-hosting guide before acting. Explain in plain
   language and ask first if you need to install missing software, use administrator access,
   restart a GUI app, or change a security setting.
3. Clone the repository into a stable location that will not be casually deleted. If it already
   exists, inspect its state first and do not overwrite uncommitted files. Install dependencies,
   run `npm run verify`, and diagnose and fix any errors.
4. Use `command -v node` to find the absolute Node.js path and find the absolute path to
   `dist/index.js`. Add a local stdio MCP server named `china-rail` using the configuration format
   actually supported by the current client. Preserve every existing setting and do not guess the
   configuration file location.
5. Local mode needs no `.env`, 12306 account, user cookie, or secret. Do not ask me for any of
   them, and do not add booking, login, CAPTCHA, background polling, or restriction-bypass logic.
6. Reload the client configuration as required. Do not treat a silent foreground `npm start` as
   completion; the MCP client should launch the stdio server.
7. Prove the setup by calling tools from the configured MCP client: call `get_provider_status`,
   use `search_stations` for 上海虹桥, then search for trains from 上海虹桥 to 杭州东 on a date
   inside the current ticket-sales window. If the upstream service is temporarily unavailable,
   distinguish a working local connection from a failed live 12306 query and keep troubleshooting
   until the cause is clear. Do not declare success based only on a passing build.
8. When finished, report only the install location, the client configuration changed, offline
   verification result, actual MCP call result, and one example question I can ask next. Do not
   commit or push repository changes.
```

A real MCP tool call is the completion criterion. If the AI can use the terminal but cannot
reload or operate the target client, it should complete everything else and identify only the
final click that you must perform, rather than handing the whole installation back to you.

### Want to use it from a phone? Let an AI host a private server

Local stdio works only on the computer running the server. Phone access requires a continuously
reachable HTTPS deployment connected to an AI client that supports remote MCP. You need GitHub,
Vercel, and an account whose client supports custom remote MCP; service plan or usage charges may
apply.

Give the entire prompt below to a coding AI that can use both the terminal and a browser:

```text
Deploy China Rail MCP as a private, personal remote service, and continue until I can make a real
Chinese railway query from my phone's AI client.
Repository: https://github.com/TakeruF/china-rail-mcp

Perform the work instead of only giving me a tutorial, and follow these requirements:

1. Read the latest repository README, `docs/SELF_HOSTING.en.md`, and the current client's official
   remote MCP documentation. Confirm that my GitHub, Vercel, and AI client accounts have the
   required features. Explain the impact and ask before incurring charges, creating a cloud
   project, signing in to an account, or deploying to Production.
2. Clone the repository into a safe temporary or working directory, then run `npm ci` and
   `npm run verify`. Do not modify, commit, or push the project source.
3. Create a personal project with the repository's Vercel configuration. Generate a unique,
   strong `MCP_HTTP_BEARER_TOKEN` and store it only as a Vercel Production environment variable.
   Never put it in source, `.env`, Git, chat, screenshots, deployment logs, or the final report,
   and never ask me to paste it into chat. If I must enter it, have me paste it directly into a
   masked Vercel field or the deployed site's OAuth page.
4. Deploy the current `main` commit to Production and record its stable HTTPS hostname. Do not use
   a Preview URL as the final address. Run
   `npm run smoke:http -- https://ACTUAL_HOST/api`; verify that health, OAuth metadata, and
   protected-resource metadata return 200, while unauthenticated `/api/mcp` returns the expected
   401 with discovery information. At this stage, that 401 proves authentication is working; it
   is not a deployment failure.
5. Follow the remote-MCP connection flow actually supported by the current client, connect
   `https://ACTUAL_HOST/api/mcp` to my account, and complete OAuth. ChatGPT UI and feature
   availability may vary by account or version, so check current official documentation and the
   actual UI. Do not guess menu names or claim that every account is supported. If I must act,
   ask me only for the login, authorization, or final UI step.
6. First call `get_provider_status` and `search_stations` from the web or desktop client. Then open
   a new conversation on my phone with the same account, enable the connection, and make a real
   train search from 上海虹桥 to 杭州东 on a date inside the current ticket-sales window. Record
   “deployment succeeded,” “account connection succeeded,” and “mobile tool call succeeded”
   separately; never infer the third result from the first two.
7. If the connection is absent on mobile, check the app version, account, workspace permissions,
   and current product support. Do not make the server public or disable authentication as a
   workaround. If the account or mobile app does not currently support it, report that product
   limitation clearly while leaving the safely hosted service available to supported clients.
8. Report only the Vercel project name and HTTPS MCP URL without secrets, Production deployment
   status, smoke-test result, web/desktop call result, mobile call result, possible cost points,
   and how to rotate or revoke access. Never display `MCP_HTTP_BEARER_TOKEN`.
```

A successful deployment does not automatically prove mobile availability. [Current OpenAI
documentation](https://learn.chatgpt.com/docs/plugins) says that plugins available to an account
can be used in ChatGPT on web, desktop, and mobile. This project's private developer connection
is not a plugin published in the public directory, however, so its appearance on mobile still
depends on the current client, account, and workspace. Treat a real tool call on the phone as the
proof. See the [self-hosting guide](docs/SELF_HOSTING.en.md) for the complete server procedure.

### Manual installation

Requires Git, Node.js 20 or later, and npm 10 or later. Local stdio use requires no 12306
account, cookie, secret, or `.env` file.

```sh
git clone https://github.com/TakeruF/china-rail-mcp.git
cd china-rail-mcp
npm ci
npm run verify
npm start
```

`npm run verify` is an offline-upstream quality gate: it checks the environment, lint, types,
fixture tests, build, formatting, production dependencies, and a real stdio MCP initialization.
`npm start` speaks JSON-RPC over standard input/output and normally waits silently for an MCP
client. To include a point-in-time check against the current public 12306 service, run:

```sh
npm run verify:live
```

Live verification depends on the network and current upstream behavior and is not reproducible
offline.

## Current live-data status

As most recently re-verified on 2026-09-03, the official 12306 station, timetable, remaining-ticket,
fare, train-number, and stop-sequence routes work without login. Timetable queries
require short-lived anonymous cookies issued by the official query page. The server
keeps those cookies only in process memory, never accepts user/account cookies, and
never persists or returns cookie values.

| Capability        | Status    | Freshness/caching                                         |
| ----------------- | --------- | --------------------------------------------------------- |
| Station search    | Supported | Official station asset; in-process cache up to 24 hours   |
| Timetable         | Supported | Live official query; exact station-code results only      |
| Train stops       | Supported | Live official train-number and stop-sequence query        |
| Fares             | Supported | Current compact fare data from the official ticket result |
| Seat availability | Supported | Live official result; not cached as current               |

See [docs/upstream-12306.md](docs/upstream-12306.md) for dated, live-upstream
observations and failure modes. All dates and timetable times are China Standard
Time (`Asia/Shanghai`). Public endpoints are undocumented; verify important travel
information with official channels.

## Scope

China Rail MCP exposes public railway data to MCP-compatible clients such as Codex, Claude
Desktop, and ChatGPT integrations. It is deliberately read-only: it does **not** log in,
accept user cookies, handle SMS or CAPTCHAs, store identity data, book tickets, submit
waitlists, snatch tickets, make payments, or change/cancel bookings. Anonymous cookies from
the official query page are memory-only and expire from the provider after ten minutes.

## Install and client configuration

`npm run test:integration` is the separate opt-in check against the current public 12306 service.
For Docker and a private Vercel deployment, see
[Self-hosting China Rail MCP](docs/SELF_HOSTING.en.md).

After publication, the package executable will be usable as `npx china-rail-mcp`.

For a local MCP client, configure stdio (adjust the absolute path):

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

Alternatively, build the Docker image and use it as the stdio command:

```sh
docker build -t china-rail-mcp:local .
```

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

For a client that requires a public HTTPS URL, deploy the repository to your own Vercel project
and protect it with a unique `MCP_HTTP_BEARER_TOKEN`. The complete endpoint checks and ChatGPT
Developer Mode instructions are in the
[self-hosting guide](docs/SELF_HOSTING.en.md).

Development commands: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run build`. `npm run test:integration` is opt-in and is never run by CI because it calls a
changing external service.

After the npm package is published, clients can start it without a checkout:

```sh
npx -y china-rail-mcp
```

Its MCP Registry identity is `io.github.takeruf/china-rail-mcp`; `server.json` contains the
matching package metadata.

### EdgeOne Makers

The optional `cloud-functions/mcp.ts` entry exposes stateless Streamable HTTP at `/mcp`, and
`cloud-functions/health.ts` exposes `/health`. Deploy it as an EdgeOne Makers Node.js Cloud
Function and set the secret environment variable `MCP_HTTP_BEARER_TOKEN`; without that variable,
the MCP route returns `503` rather than becoming anonymously callable. The same secret is the
single-user connection password for the bundled OAuth 2.1 Authorization Code + PKCE flow used by
ChatGPT custom apps. OAuth clients receive one-hour access tokens and renewable 30-day refresh
tokens; the original connection password is submitted only to this deployment's `/authorize`
route and is not stored by ChatGPT. Existing clients may continue to use the static bearer token.
The official anonymous 12306 session remains process-memory-only and is never exposed to clients.

## Tools

| Tool                  | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `get_provider_status` | Return verified capabilities and the anonymous-session safety policy.                 |
| `search_stations`     | Find stations and their 12306 codes. A city is never silently treated as one station. |
| `search_trains`       | Return paginated exact-station timetables, fares, and remaining-ticket data.          |
| `get_train_details`   | Resolve an exact train number and return its complete official stop sequence.         |
| `get_availability`    | Return normalized availability for an exact station pair, train, and date.            |
| `compare_trains`      | Filter/sort paginated journeys; it does not make subjective recommendations.          |

Example prompts:

- What 12306 station code corresponds to Shanghai Hongqiao?
- Search stations matching 杭州东.
- Show trains from 上海虹桥 to 杭州东 three days from now.
- Show only D trains from 上海虹桥 to 宁波 three days from now.
- Show the complete stop sequence for G1 on a specified date.
- What public-data capabilities does the configured provider currently support?

`search_trains` returns 20 journeys by default and `compare_trains` returns 10. Both accept
`limit` (1-50) and `offset`; filters and comparison sorting are applied before paging. Their
response includes `total`, `returned`, `hasMore`, `nextOffset`, and `journeys`, so clients can
continue without requesting an unbounded payload.

Train-type filters are case-insensitive and accept `G`, `D`, `C`, `S`, `Z`, `T`, `K`, `L`, `Y`,
and `OTHER`. Each journey includes both the normalized `trainType` and a Chinese
`trainTypeLabel`; an unrecognized or numeric prefix is classified as `OTHER` while retaining its
original prefix in `upstreamTrainType`. Seat classes keep `dynamic_sleeper` (`动卧`),
`advanced_soft_sleeper` (`高级软卧`), and `soft_sleeper` (`软卧`) distinct.

## Architecture

The MCP adapter in `src/server.ts` depends only on the `RailProvider` interface.
`Rail12306Provider` explicitly advertises its capabilities and contains official-endpoint
parsing, a single-flight anonymous-session initializer, exact station filtering, timeout/retry
behavior, and a station-metadata cache; domain types remain provider-neutral.

All travel dates (`YYYY-MM-DD`) and timetable times are interpreted as China Standard Time
(`Asia/Shanghai`), never the host computer timezone. Route, fare, and availability queries are
accepted only for the current official 15-day ticket-query window (today plus 14 days). A future
date outside it returns `DATE_OUTSIDE_TICKET_WINDOW` without contacting the ticket endpoint,
including `expectedSalesOpenDate`/`retryFrom` metadata and a reminder that a timetable may already
be available. Past dates continue to return `DATE_OUTSIDE_QUERY_WINDOW`. Fares are normalized to
CNY; availability includes both a normalized state and the original upstream value.

`get_train_details` uses the separate official train-number and stop endpoints. If 12306 has
already published the requested date-specific timetable, it can therefore return the stop
sequence before ticket sales open, with `timetableStatus: "published"`,
`bookingStatus: "not_on_sale"`, `availability: null`, and the expected sales-opening date. If a
future date is outside the ticket window and the official train search returns no exact match, the
tool returns `TIMETABLE_NOT_YET_PUBLISHED` instead of claiming that the train is cancelled or does
not operate. The timetable publication horizon is undocumented and must not be assumed to be
fixed.

## Provider limits and freshness

The station master script is cached for 24 hours. Timetable and availability results are not
cached as current. An anonymous query session is reused in memory for at most ten minutes; a
redirected ticket query refreshes the session once. If both queries redirect, the provider
returns `UPSTREAM_QUERY_REJECTED` rather than claiming session initialization failed. Network and
5xx failures receive at most one
transient retry. The server does not continuously poll, evade rate limits, or follow an upstream
redirect outside the allowlisted official query route.

The official query can include other stations in the same city even when exact station codes are
sent. The provider filters the response's actual departure and arrival codes, so `上海虹桥` is
not silently broadened to all Shanghai stations. Public web endpoints are undocumented and may
change or reject requests. Displayed fares are reference values; verify important travel and
payment information with official channels. The 12306 site publishes its own service terms and
states that similar third-party sites/apps are not authorized.

No secrets, telemetry, user cookies, or personal-data collection are required or implemented.
See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Release and registry preparation

The package metadata, repository URL, and npm `files` allowlist are ready for a future npm
release; this project has not been published. Before publishing, verify the intended commit is
present on the public remote, run `npm pack --dry-run`, and publish only with explicit approval.

The MCP Registry identity is `io.github.takeruf/china-rail-mcp`, and `server.json` contains
matching metadata. Registration still requires the npm package to be published publicly and the
metadata to be revalidated against the registry schema current at that time. Installation and
verification scripts never publish or register the project automatically.

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This is an independent open-source project. It does not use official branding and does not
imply endorsement by China Railway, 12306, or any railway operator.
