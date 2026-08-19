# China Rail MCP

China Rail MCP is an unofficial, read-only MCP server for querying Chinese railway
information.

This project is not affiliated with, endorsed by, or sponsored by China Railway or 12306. It does not provide ticket purchasing, booking automation, account login
automation, or ticket-sniping functionality.

## Current live-data status

As verified on 2026-08-19, only the official unauthenticated station metadata asset
works. The server can resolve and search `上海虹桥` (AOH) and `杭州东` (HGH). Timetable,
train-stop, fare, and seat-availability data have no verified normal unauthenticated
route, so their tools return `PROVIDER_CAPABILITY_UNAVAILABLE` without retrying or
calling a known-unavailable endpoint.

| Capability        | Status      | Freshness/caching                                       |
| ----------------- | ----------- | ------------------------------------------------------- |
| Station search    | Supported   | Official station asset; in-process cache up to 24 hours |
| Timetable         | Unsupported | No value is returned                                    |
| Train stops       | Unsupported | No value is returned                                    |
| Fares             | Unsupported | No value is returned                                    |
| Seat availability | Unsupported | Never cached or presented as fresh                      |

See [docs/upstream-12306.md](docs/upstream-12306.md) for dated, live-upstream
observations and failure modes. All dates and timetable times are China Standard
Time (`Asia/Shanghai`). Public endpoints are undocumented; verify important travel
information with official channels.

## Scope

China Rail MCP exposes public railway data to MCP-compatible clients such as Codex, Claude
Desktop, and ChatGPT integrations. It is deliberately read-only: it does **not** log in,
use cookies, handle SMS or CAPTCHAs, store identity data, book tickets, submit waitlists,
snatch tickets, make payments, or change/cancel bookings.

## Install and run

Requires Node.js 20 or later.

```sh
npm install
npm run build
npm start
```

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

Development commands: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run build`. `npm run test:integration` is opt-in and is never run by CI.

## Tools

| Tool                  | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `get_provider_status` | Return verified capabilities for the configured public provider.                      |
| `search_stations`     | Find stations and their 12306 codes. A city is never silently treated as one station. |
| `search_trains`       | Return timetables only when the provider has a verified public capability.            |
| `get_train_details`   | Return a complete stop sequence only when supported.                                  |
| `get_availability`    | Return normalized public seat availability only when supported.                       |
| `compare_trains`      | Filter/sort supported journeys; it does not make subjective recommendations.          |

Example prompts:

- What 12306 station code corresponds to Shanghai Hongqiao?
- Search stations matching 杭州东.
- What public-data capabilities does the configured provider currently support?

## Architecture

The MCP adapter in `src/server.ts` depends only on the `RailProvider` interface.
`Rail12306Provider` explicitly advertises its capabilities, contains public-endpoint parsing,
timeout/retry behavior, and a station-metadata cache; domain types remain provider-neutral.

All travel dates (`YYYY-MM-DD`) and timetable times are interpreted as China Standard Time
(`Asia/Shanghai`), never the host computer timezone. Fares are normalized to CNY; availability
includes both a normalized state and the original upstream value.

## Provider limits and freshness

The station master script is cached for 24 hours. On 2026-08-19, public unauthenticated
`leftTicket/query` redirected to `queryB`, which redirected to an official error page. The
train-number page showed a CAPTCHA and the fare query returned a system-busy response.
Accordingly, the provider reports a clear capability error rather than adding authentication,
cookies, endpoint workarounds, or rate-limit evasion. Unsupported availability is never cached.

Public endpoints are undocumented and may change or reject requests. Data can be stale or
incomplete; verify important travel details with official channels. No secrets, telemetry, or
personal data collection are required or implemented. See [SECURITY.md](SECURITY.md) for
private vulnerability reporting.

## Release and registry preparation

The package metadata and npm `files` allowlist are ready for a future npm release; this project
has not been published. Before publishing, establish the repository URL, verify `npm pack
--dry-run`, and publish only with explicit approval.

The official MCP Registry currently requires a public package, a namespace-owned `mcpName`, and
a conforming `server.json`. Neither is added here because the npm package and GitHub namespace
are not established. Once they are, generate metadata with `mcp-publisher init` and validate it
against the current registry schema before an explicitly approved publication.

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This is an independent open-source project. It does not use official branding and does not
imply endorsement by China Railway, 12306, or any railway operator.
