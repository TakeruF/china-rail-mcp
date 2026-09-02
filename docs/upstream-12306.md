# 12306 Upstream Interfaces

Initial observation date: 2026-08-25; D-train coverage was rechecked on 2026-09-03. All requests below were low-frequency, read-only HTTPS GET
requests to official `12306.cn` domains. No login, user/account cookie, CAPTCHA handling,
browser automation, request-signature workaround, booking, or payment was used. Results are
point-in-time observations, not a stability promise or a supported developer API.

## Anonymous-session boundary

The official ticket-query page issues anonymous session and load-balancer cookies. The project
may use those cookies only under these restrictions:

- obtain them directly from `https://kyfw.12306.cn/otn/leftTicket/init?linktypeid=dc`;
- keep values only in process memory and never persist, log, expose, or accept them as input;
- never accept a user's 12306 cookie, account, credential, SMS code, or CAPTCHA result;
- send cookies only to the allowlisted official `kyfw.12306.cn` query route;
- reuse a session for no more than ten minutes and refresh it once after rejection;
- make only user-initiated read requests, with no continuous polling or rate-limit evasion.

On the observation date, the init page returned HTTP 200 and three anonymous cookie records. A
direct ticket query without them returned HTTP 302. Reusing the new anonymous cookies in the
same normal page flow returned HTTP 200 JSON with `status: true`. Cookie values were not
recorded.

## Station metadata

- Status: supported
- Source: `https://kyfw.12306.cn/otn/resources/js/framework/station_name.js`
- Method and parameters: `GET`; none
- Session: not required
- Observed behavior: HTTP 200 JavaScript assigning `station_names` to a delimited station list.
  The response contained `上海虹桥|AOH` and `杭州东|HGH`.
- Failure mode: non-200/network errors are normalized as
  `UPSTREAM_TEMPORARILY_UNAVAILABLE`; an unexpected script shape is
  `UPSTREAM_RESPONSE_CHANGED`.
- Project use: acceptable read-only metadata, cached in process for up to 24 hours.

## Timetable and remaining-ticket query

- Status: supported with an official anonymous session
- Source: `https://kyfw.12306.cn/otn/leftTicket/queryG`
- Parameters: `leftTicketDTO.train_date`, `leftTicketDTO.from_station`,
  `leftTicketDTO.to_station`, and `purpose_codes=ADULT`
- Session: short-lived memory-only anonymous cookies plus the official query-page referer
- Observed route: `上海虹桥 (AOH) → 杭州东 (HGH)`, 2026-08-30
- Observed response: HTTP 200 JSON, `status: true`, 369 city-area rows and 11 station codes
- Exact-pair result: 118 rows whose actual departure and arrival codes were `AOH → HGH`

The endpoint name `queryG` does not restrict results to G trains. On 2026-09-03, a query for
2026-09-06 from `上海虹桥 (AOH)` to `宁波 (NGH)` returned 33 exact-pair journeys: 21 G trains and
12 D trains. D3145 included first- and second-class fares and availability in the same row shape.

12306's official presale-period page reported a 15-day window including today on 2026-08-30.
The provider validates this window in `Asia/Shanghai` before contacting the ticket endpoint.
Past dates return `DATE_OUTSIDE_QUERY_WINDOW`; dates more than 14 days ahead return
`DATE_OUTSIDE_TICKET_WINDOW` with the expected sales-opening date and do not contact the ticket
endpoint.

The official response broadens a query to other stations in the same cities. It included, for
example, Shanghai South, Shanghai Songjiang, Hangzhou, Hangzhou West, and Hangzhou South. The
provider therefore filters row indexes 6 and 7 against the explicitly resolved station codes.
It never treats every station in a city as the requested exact station.

Remaining-ticket values are read from the current official row indexes and preserved as raw
values alongside normalized states:

| Row index | Seat type       |
| --------- | --------------- |
| 32        | Business        |
| 25        | Premium/special |
| 31        | First class     |
| 30        | Second class    |
| 21        | Advanced soft   |
| 23        | Soft sleeper    |
| 33        | Dynamic sleeper |
| 28        | Hard sleeper    |
| 24        | Soft seat       |
| 29        | Hard seat       |
| 26        | Standing        |

The normalized model keeps advanced soft sleeper, D-train sleeper, and soft sleeper separate as
`advanced_soft_sleeper`, `dynamic_sleeper`, and `soft_sleeper` respectively.

Known values such as `有`, `无`, and numeric counts are normalized. Unknown values remain
`unknown` with the exact upstream value; they are never guessed.

## Train-number search and stops

- Status: supported without a session
- Train search: `https://search.12306.cn/search/v1/train/search`
- Train-search parameters: exact public train code as `keyword`, date as `YYYYMMDD`
- Stop source: `https://kyfw.12306.cn/otn/czxx/queryByTrainNo`
- Stop parameters: resolved `train_no`, `from_station_telecode=BBB`,
  `to_station_telecode=BBB`, and `depart_date`

The train-search endpoint performs prefix matching, so the provider filters
`station_train_code` for an exact case-insensitive match before using an internal `train_no`.
On the observation date, G1 resolved successfully and its stop query returned seven stops from
Beijing South to Shanghai Hongqiao, including arrival, departure, and stopover times.
On 2026-09-03, D3145 also resolved successfully for 2026-09-06 and returned its 26-stop sequence.

The train-number endpoint can publish a date-specific timetable before that date enters the
ticket-query window. In that case `get_train_details` returns the official stops with
`bookingStatus: "not_on_sale"` and no availability claim. An empty exact-train result outside the
ticket window is classified as `TIMETABLE_NOT_YET_PUBLISHED`, not as cancellation or confirmed
non-operation. 12306 does not document a fixed timetable-publication horizon, so the provider does
not hard-code one.

## Fares

- Status: supported
- Search-row source: compact fare field at current row index 39
- Detail source used for verification:
  `https://kyfw.12306.cn/otn/leftTicket/queryTicketPrice`
- Detail parameters: `train_no`, `from_station_no`, `to_station_no`, `seat_types`, and
  `train_date`

The compact fare field consists of current ten-character seat/price chunks and avoids sending a
separate request for every returned train. Three exact-pair samples were cross-checked against
the official detail route:

| Train | Detail status | Observed latency | Example second-class fare |
| ----- | ------------- | ---------------- | ------------------------- |
| G4917 | HTTP 200      | 217 ms           | CNY 83.0                  |
| G7541 | HTTP 200      | 311 ms           | CNY 57.0                  |
| G1321 | HTTP 200      | 229 ms           | CNY 76.0                  |
| D3145 | Search row    | N/A              | CNY 116.0                 |

The official page describes displayed prices as reference values and says the payment-confirmed
price is authoritative. The MCP remains read-only and performs no payment or booking step.

## Failure handling and load limits

- A redirected ticket query discards its anonymous session and initializes once more.
- Two redirects become `UPSTREAM_QUERY_REJECTED`; a redirect alone is not described as proof
  that anonymous session initialization failed.
- HTTP 5xx and transient network failures receive at most one retry after 250 ms.
- HTTP 429 becomes `RATE_LIMITED`; the provider does not immediately retry it.
- Upstream alternate query paths are followed only when they match the allowlisted
  `leftTicket/query[A-Z]` form on the same official host.
- Timetable and availability are not cached as current. Each MCP request is user initiated; no
  background refresh or automatic polling exists.
- Every returned journey and availability result includes a retrieval timestamp.

## Scope decision

The official provider is technically usable for read-only station, timetable, remaining-ticket,
fare, train-number, and stop-sequence queries using only a short-lived anonymous web session.
The service remains undocumented and may change without notice. The official site publishes
service terms restricting unrecognized automated access and displays a notice that similar
third-party sites/apps have not been authorized. Operators are responsible for reviewing and
complying with the current terms before deployment.

APIHZ and other third-party sources are not used by the implementation. They do not improve
source accuracy over the official response, and no third-party cookie, shared credential, or
provider account is required.
