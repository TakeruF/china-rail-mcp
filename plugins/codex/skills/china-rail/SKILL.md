---
name: china-rail
description: Query official public China Railway 12306 schedules, fares, stops, and seat availability with the China Rail MCP tools.
---

# China Rail

Use the China Rail tools for user-requested Chinese railway lookups. Start with `search_stations` when a station name is ambiguous; never replace a requested station with another station in the same city without asking.

- Use dates in `YYYY-MM-DD` and interpret departure and arrival times in China Standard Time (Asia/Shanghai).
- Use `search_trains` for route, fare, and availability searches; use `compare_trains` when the user requests sorting or comparison.
- Use `get_train_details` for an exact train number's published stop sequence. A timetable may be published before ticket sales open.
- Use `get_availability` for an exact train and station pair.
- Explain when the requested date is outside the current ticket-query window or the timetable is not published.
- Treat fares and availability as time-sensitive reference data. Recommend verifying important travel and payment details through official 12306 channels.
- The integration is read-only. It does not book, cancel, pay, log in, use personal cookies, or poll automatically.
