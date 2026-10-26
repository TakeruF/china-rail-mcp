# MCP hub on EdgeOne

`https://mcp.takeruf.com` hosts the MCP directory and China Rail. This first version lists
only China Rail. Other MCP services are not migrated or exposed by this deployment.

| URL                                                                  | Purpose                                      |
| -------------------------------------------------------------------- | -------------------------------------------- |
| `/`                                                                  | Browser-language selection, English fallback |
| `/ja`, `/zh`, `/ko`, `/en`                                           | Localized directory, URL, and server health  |
| `/china-rail/mcp`                                                    | Authenticated, read-only MCP endpoint        |
| `/china-rail/health`                                                 | Server health; does not query 12306          |
| `/china-rail/register`, `/china-rail/authorize`, `/china-rail/token` | OAuth registration and authorization         |
| `/.well-known/oauth-authorization-server/china-rail`                 | Authorization-server metadata                |
| `/.well-known/oauth-protected-resource/china-rail/mcp`               | Protected-resource metadata                  |

The EdgeOne project is `takeruf-mcp` (`makers-tyekugxoemvr`), deployed to the overseas
availability zone with Cloud Functions in Hong Kong (`ap-hongkong`). The runtime limit is
120 seconds. Existing root-level endpoints remain available for compatibility, with distinct
OAuth resource URLs. A token issued for `/china-rail/mcp` is not accepted by `/mcp`.

## Languages

The directory uses the same language paths as takeruf.com: `/ja`, `/zh`, `/ko`, and `/en`.
The root chooses the first supported browser language, falling back to English, and preserves
query parameters and fragments. With JavaScript disabled, it displays links to all four languages.
Every localized page has a native language menu; an explicit locale URL takes precedence over
the browser preference. Portfolio links preserve that language. The MCP connection URL stays
`https://mcp.takeruf.com/china-rail/mcp` in every language.

The build renders `makers/templates/directory.html` with `makers/locales/{ja,zh,ko,en}.json`,
validates translation completeness, and generates canonical and alternate-language metadata.
CSS and directory JavaScript use content hashes in their URLs to avoid stale assets.
OAuth consent follows the browser's Accept-Language preference, with its own four-language
switcher. Switching preserves the client, redirect, state, resource, and PKCE parameters.

## Configuration

Set these production variables in the project's environment settings:

- `MCP_HTTP_BEARER_TOKEN`: a unique connection password, also used to sign OAuth tokens.
- `MCP_PUBLIC_ORIGIN`: `https://mcp.takeruf.com`, without a path or trailing slash.

The canonical public origin is needed because the Cloud Functions platform may pass an internal
HTTP URL to the handler. All OAuth issuer, resource, and discovery URLs must agree with the
public URL. Connecting a new domain requires a new OAuth connection in the MCP client.

This deployment's generated connection password is stored locally in the Git-ignored
`.env.edgeone.local` file with owner-only permissions. Do not put its value in commands,
logs, screenshots, documentation, or Git. Changing the password invalidates existing OAuth
clients and tokens for this deployment.

## Build and deploy

```sh
npm ci
npm run verify
npm run build:edgeone
npm run deploy:edgeone
```

The deployment command uses EdgeOne CLI 1.6.46 and its existing authenticated account. If login
is needed, use `npx --yes edgeone@1.6.46 login --site global` and complete the browser flow.
The default project is `takeruf-mcp`; pass a different intended project explicitly with
`npm run deploy:edgeone -- PROJECT_NAME`.

The build writes a standalone Node.js handler and public files to `makers/.output`. Internal
identifiers are shortened because the Makers builder injects an `onRequest` binding; preserving
an unrelated bundled function with that name causes a duplicate-declaration build error.

The deploy script packages only its explicit source/asset allowlist, including all four localized
pages and the root language redirect, into a ZIP. It excludes
`.env` files, local CLI metadata, and credentials. Raw CLI output can contain environment
values or temporary upload credentials, so the script prints only the public deployment result
and records it in `makers/.output/deployment.json`.

## Verification

```sh
npm run smoke:http -- https://mcp.takeruf.com/china-rail
```

Health and OAuth discovery must return 200. An unauthenticated MCP request must return 401 with
the namespaced resource metadata URL. Check authenticated initialization and `tools/list`
separately, then make a live train search within the current ticket window. Successful server
health does not prove 12306 availability.

Verify all four locale URLs after deployment: direct navigation, language switching, URL copying,
localized status messages, and mobile layout. The API and OAuth resource URLs must remain
language-independent.

The directory checks server health once on load and when the user presses refresh. It does not
poll 12306 or claim that a healthy server guarantees successful train queries.

The custom domain uses Name.com DNS. Add only the CNAME/ownership-verification records supplied
by EdgeOne for `mcp.takeruf.com`, then enable the free managed HTTPS certificate. Preserve all
other records and verify the final domain using normal TLS validation.
