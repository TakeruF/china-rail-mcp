# Security policy

Please report vulnerabilities privately to the repository maintainers through GitHub's
private vulnerability reporting feature. Do not include credentials, cookies, ticketing
records, identity information, or request captures in a public issue. This project has no
need for credentials and deliberately does not support authenticated 12306 access.

The provider accepts no user-supplied cookies. Anonymous cookies issued by the official query
page are held only in process memory for a short session and must never be persisted, logged,
included in telemetry, or returned in an MCP response.
