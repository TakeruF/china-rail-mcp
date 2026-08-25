# China Rail MCP

China Rail MCP is an unofficial, read-only MCP server for querying Chinese railway
information.

This project is not affiliated with, endorsed by, or sponsored by China Railway or 12306. It does not provide ticket purchasing, booking automation, account login
automation, or ticket-sniping functionality.

## Current live-data status

As verified on 2026-08-25, the official 12306 station, timetable, remaining-ticket,
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
| `get_provider_status` | Return verified capabilities and the anonymous-session safety policy.                 |
| `search_stations`     | Find stations and their 12306 codes. A city is never silently treated as one station. |
| `search_trains`       | Return exact-station timetables, fares, and normalized remaining-ticket data.         |
| `get_train_details`   | Resolve an exact train number and return its complete official stop sequence.         |
| `get_availability`    | Return normalized availability for an exact station pair, train, and date.            |
| `compare_trains`      | Filter/sort supported journeys; it does not make subjective recommendations.          |

Example prompts:

- What 12306 station code corresponds to Shanghai Hongqiao?
- Search stations matching 杭州东.
- Show trains from 上海虹桥 to 杭州东 three days from now.
- Show the complete stop sequence for G1 on a specified date.
- What public-data capabilities does the configured provider currently support?

## Architecture

The MCP adapter in `src/server.ts` depends only on the `RailProvider` interface.
`Rail12306Provider` explicitly advertises its capabilities and contains official-endpoint
parsing, a single-flight anonymous-session initializer, exact station filtering, timeout/retry
behavior, and a station-metadata cache; domain types remain provider-neutral.

All travel dates (`YYYY-MM-DD`) and timetable times are interpreted as China Standard Time
(`Asia/Shanghai`), never the host computer timezone. Fares are normalized to CNY; availability
includes both a normalized state and the original upstream value.

## Provider limits and freshness

The station master script is cached for 24 hours. Timetable and availability results are not
cached as current. An anonymous query session is reused in memory for at most ten minutes; a
redirected or rejected session is refreshed once. Network and 5xx failures receive at most one
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

The official MCP Registry currently requires a public package, a namespace-owned `mcpName`, and
a conforming `server.json`. Neither is added here because the npm package and GitHub namespace
are not established. Once they are, generate metadata with `mcp-publisher init` and validate it
against the current registry schema before an explicitly approved publication.

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This is an independent open-source project. It does not use official branding and does not
imply endorsement by China Railway, 12306, or any railway operator.
