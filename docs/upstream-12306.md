# 12306 Upstream Interfaces

Observation date: 2026-08-19. All requests below were ordinary, unauthenticated
HTTPS GET requests to official `12306.cn` domains. They used no login, cookies,
CAPTCHA handling, browser automation, anti-bot workaround, or request-signature
workaround. Results are point-in-time observations, not a promise of stability.

## Station metadata

- Status: supported
- Source: `https://kyfw.12306.cn/otn/resources/js/framework/station_name.js`
- Method and parameters: `GET`; none
- Authentication/cookies: neither required or sent
- Observed behavior: HTTP 200 JavaScript assigning `station_names` to a delimited
  station list. The response contained `上海虹桥|AOH` and `杭州东|HGH`.
- Response format: JavaScript text, parsed only after locating the expected
  `station_names` assignment.
- Failure mode: non-200/network errors are normalized as
  `UPSTREAM_TEMPORARILY_UNAVAILABLE`; an unexpected script shape is
  `UPSTREAM_RESPONSE_CHANGED`.
- Apparent stability: comparatively stable static public asset, but undocumented.
  The provider caches it in process for 24 hours.
- Project use: acceptable, read-only public metadata.

## Timetable / remaining-ticket query

- Status: unsupported
- Candidate source: `https://kyfw.12306.cn/otn/leftTicket/query`
- Method and parameters: `GET` with `leftTicketDTO.train_date`,
  `leftTicketDTO.from_station`, `leftTicketDTO.to_station`, and `purpose_codes`.
- Authentication/cookies: none were sent.
- Observed behavior: for `上海虹桥 (AOH) → 杭州东 (HGH)`, date `2026-08-25`, the
  endpoint returned HTTP 302 and JSON naming `leftTicket/queryB`; direct `queryB`,
  `queryA`, and `queryZ` requests returned HTTP 302 to
  `https://www.12306.cn/mormhweb/logFiles/error.html`.
- Response format/failure mode: the initial response was a JSON redirect hint, not
  timetable data; the redirected candidates returned no structured data.
- Apparent stability: not usable from this normal unauthenticated environment.
- Project use: not acceptable. `timetable` and `availability` remain disabled; the
  server returns `PROVIDER_CAPABILITY_UNAVAILABLE` without repeatedly calling it.

## Train stops

- Status: unsupported
- Official public pages inspected:
  `https://kyfw.12306.cn/otn/queryTrainInfo/init` and
  `https://kyfw.12306.cn/otn/czxx/init`.
- Authentication/cookies: no login was attempted or used.
- Observed behavior: the official train-number query page presents a CAPTCHA; the
  station train query is a public page but its usable data query route was not
  verified without CAPTCHA/session state. A direct historical-style
  `/otn/czxx/query` request returned HTTP 404.
- Response format/failure mode: HTML form/CAPTCHA or 404, not a verified public
  structured stop sequence.
- Apparent stability: unsuitable for a server that must not handle CAPTCHAs or use
  session state.
- Project use: not acceptable. `trainStops` is disabled.

## Fares

- Status: unsupported
- Official public page: `https://kyfw.12306.cn/otn/leftTicketPrice/initPublicPrice`
- Candidate source: `https://kyfw.12306.cn/otn/leftTicketPrice/query`
- Method and parameters: historical `GET` route was checked with the standard
  route/date parameters only; no cookies were retained or replayed.
- Observed behavior: HTTP 200 JSON with `status: false` and the message
  `系统忙，请稍后重试` (system busy; try later). It did not provide a fare result.
- Response format/failure mode: JSON application response but no usable data.
- Apparent stability: route/page exists, but no verified unauthenticated fare
  response was obtained.
- Project use: not acceptable. `fares` is disabled.

## Seat availability

- Status: unsupported
- Source: same `leftTicket/query` family as the timetable query.
- Authentication/cookies: none were sent.
- Observed behavior: no ticket-result payload was obtained because the query chain
  redirected to the official error page.
- Response format/failure mode: no seat fields were available to normalize.
- Apparent stability: not usable from this normal unauthenticated environment.
- Project use: not acceptable. `availability` is disabled; no cached value is
  presented as current.

## Scope decision

Only the station metadata route satisfies the project's current public,
unauthenticated, read-only standard. Future support must begin with a fresh live
verification and retain this document's request-boundary rules. No third-party
source, shared cookie, account, CAPTCHA handling, or automation workaround is an
acceptable substitute.
