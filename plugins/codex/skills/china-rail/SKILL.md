---
name: china-rail
description: Query official public China Railway 12306 schedules, fares, stops, and seat availability with the China Rail MCP tools.
---

# China Rail

Use the China Rail tools for user-requested Chinese railway lookups. Start with `search_stations` when a station name is ambiguous; never replace a requested station with another station in the same city without asking.

- Use dates in `YYYY-MM-DD` and interpret departure and arrival times in China Standard Time (Asia/Shanghai).
- Use `search_trains` for route, fare, and availability searches; use `compare_trains` when the user requests sorting or comparison.
- When the user specifies a city, use `scope: "city"`; do not restrict the search to a particular station. This searches every station in the official city group, including 上海虹桥, 上海南, and 上海 for 上海. Use `scope: "station"` (the default) for an exact station name or code. Set `fromScope`/`toScope` to override one endpoint for mixed city/station requests.
- Check `searchedStations` and `excludedStations` (each grouped by `from`/`to`) before describing the search coverage. A searched station with no returned journeys was still queried. City search results merge all station pairs before filtering and pagination; a failed pair makes the search fail rather than returning an apparently complete partial result.
- `isPotentialDetour` flags durations at least three times the shortest returned route and at least 120 minutes longer. The baseline uses all merged journeys before filters and pagination; `detourHeuristic` explains the thresholds. This is a duration-based indication, not proof of an actual detour. A single journey or uniformly slow results provide no faster baseline.
- Use `get_train_details` for an exact train number's published stop sequence. A timetable may be published before ticket sales open.
- Use `get_availability` for an exact train and station pair.
- Explain when the requested date is outside the current ticket-query window or the timetable is not published.
- Treat fares and availability as time-sensitive reference data. Recommend verifying important travel and payment details through official 12306 channels.
- The integration is read-only. It does not book, cancel, pay, log in, use personal cookies, or poll automatically.
