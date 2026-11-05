# SAP connectivity

## System

| | |
|---|---|
| System | DS4_100_TFSIN, S/4HANA 2023 on-premise (SAP_BASIS 758), ABAP Cloud development model |
| Host | `https://vhtfqds4ap01.sap.tfsin.co.in:44300` (needs the hosts-file line `10.110.0.33 vhtfqds4ap01.sap.tfsin.co.in` and the VPN). Only the relay's own configuration names it. |
| Client | 100. Always sent as `sap-client=100`. Without it SAP uses client 050 and answers 401, which looks like a wrong password. |
| Services | OData V4 Web API bindings: `/sap/opu/odata4/sap/<binding>/srvd_a2x/sap/<srvd>/0001/` (`srvd`, not `srvd_a2x`, gives a misleading 403) |

## Secrets and environment

Secrets come from the process environment (FS Sprint supplies them) or, when run stand-alone, from `.env.local`. Never write secrets into any other file.

A value already in the process environment wins over `.env.local`, even an empty one: the BackEnd and the live tests
(`process.loadEnvFile`) and the FrontEnd build (Vite, `VITE_*` values only) fill only variables that are unset.
`npm run e2e` relies on this (it builds with an empty SAP account), and FS Sprint never writes `.env.local`.

The SAP settings are FrontEnd build settings, and Vite writes them into the page:

| Setting | Default | |
|---|---|---|
| `VITE_SAP_RELAY_URL` | `http://localhost:3001` (in the code) | The relay; builds made on GitHub Actions use the default |
| `VITE_SAP_CLIENT` | `100` | Sent as `sap-client` on every call |
| `VITE_SAP_SYSTEM_ID` | `SAP` | The system name shown on the screens |
| `VITE_SAP_TIMEOUT_MS` | `30000` | Per call |
| `VITE_SAP_USERNAME`, `VITE_SAP_PASSWORD` | empty | The default SAP account, for local builds only. The deploy pipeline never passes them: deployed users enter their own account in Settings → SAP Connection |

Service paths are in `FrontEnd/src/config/services.json` (paths only, no host).

## How the app talks to SAP

- **The browser calls SAP, through the relay**, in both application types: `FrontEnd/src/core/sap/client.ts` sends
  each call to `VITE_SAP_RELAY_URL` plus the service path, and the relay forwards it to SAP. The relay
  (`sap-relay.exe`) runs on the user's own PC, which is on the VPN; it is built separately. The BackEnd never calls
  SAP (deployed on Azure, it could not reach it).
- **Two logins.** The workspace login (`/login`, `demo` / `demo` and the captcha) is checked in the browser. The SAP
  account is separate: the build's default, or another user, password and client saved for the tab in
  Settings → SAP Connection → Test & save (checked through the relay first, kept in `sessionStorage`; Reset to
  default returns to the build's account). Sign-out forgets both. Every SAP call runs as that SAP user (HTTP Basic
  auth).
- **The acting user** for saved layouts and `createdBy` / `changedBy` stamps is the SAP user when one is set, else
  `DEMO`.
- **CSRF:** one token per service and SAP account. It is fetched with `X-CSRF-Token: Fetch` only before the first
  write. On `403` with `x-csrf-token: Required` it is fetched again and the write is retried once. The browser sends
  no cookies to the relay (`credentials: 'omit'`); the relay keeps SAP's session cookies.
- **Failed logon:** after a `401` that account is paused (no further calls) so SAP does not lock the user. Enter the
  right password in Settings → SAP Connection and choose Test & save, which tries once more.
- **Relay not running:** "Cannot reach the SAP relay at <url>. Start sap-relay and check the VPN."
- **Reads:** server-driven paging (`Prefer: odata.maxpagesize=5000`, then `@odata.nextLink`) for up to 50 pages, with
  `$count=true`. A longer list fails clearly instead of being cut.
- **Writes:** one row is a plain POST/PATCH/DELETE. Several rows go as one `multipart/mixed` `$batch` with a single
  changeset, so SAP saves all or none. A JSON `$batch` returns 415 on this gateway.
- **ETags:** read from `@odata.etag` in the response body (the header is empty on this gateway) and sent as
  `If-Match`. A stale ETag (412) becomes "This entry was changed by someone else". `If-Match` is never sent to an
  entity without an ETag.
- **Payloads:** Edm.Decimal values are JSON numbers, never quoted. Change an amount together with its currency.
- **Validation:** a module's `check()` rules run in the browser before every write; for SAP data, SAP's own
  validations are the authority and the screen shows SAP's messages.

## What the relay must provide

The relay is not part of this template. Every application needs it to:

- forward every request on the same path to the SAP host it is configured with (`<relay>/sap/opu/odata4/…` →
  `<SAP host>/sap/opu/odata4/…`, query string unchanged);
- keep SAP's session cookies per SAP user (per `Authorization` header), never one session for everyone;
- answer CORS for the application's origins: `http://127.0.0.1:3100`, `http://localhost:3100` and the deployed static
  site's origin, including the `OPTIONS` preflight, allowing the request headers the browser sends
  (`authorization`, `accept`, `x-csrf-token`, `content-type`, `if-match`, `prefer`) and the methods `GET`, `POST`,
  `PATCH`, `PUT` and `DELETE`, and exposing `x-csrf-token` and `etag`;
- send those CORS headers on **every** response, including `401` and every other 4xx and 5xx answer. Without them the
  browser hides the answer and the page sees a network error ("Cannot reach the SAP relay") instead of a rejected
  logon, so the rejected-account pause never starts and repeated calls can lock the SAP user;
- never pass an SAP `3xx` redirect through to the browser (for example to an SSO or logon page): answer it with an
  error status instead (for example `502` with the reason). The page asks with `redirect: 'manual'` and treats any redirect, which the browser shows it only as an
  opaque redirect, as an error ("SAP redirected the request"), so a redirected write is never reported as saved;
- allow calls from a deployed HTTPS site. The site calling `http://localhost:3001` is a call from a public origin to
  the local network, which falls under the browser's Private Network Access / Local Network Access rules: Chrome and
  Edge may ask the user for permission, or require the relay to answer the preflight that carries
  `Access-Control-Request-Private-Network: true` with `Access-Control-Allow-Private-Network: true` (and the usual
  CORS headers). Check the deployed site in the current Chrome and Edge, not only the local one on `127.0.0.1:3100`.

## Checking the connection

1. Connect the VPN; `Test-NetConnection vhtfqds4ap01.sap.tfsin.co.in -Port 44300` must succeed. Start the relay.
2. In the application: Settings → SAP Connection → Test & save with your SAP user, then Test connection per service.
3. Stand-alone, for the live check: put `VITE_SAP_USERNAME` and `VITE_SAP_PASSWORD` in `.env.local` (under FS Sprint
   they come from the process environment) and run `npm run test:live` (read-only, from the FrontEnd's test runner
   through the relay). Without an account, or with no relay answering, it is skipped with the reason. The process
   variables `SAP_RELAY_URL`, `SAP_USERNAME` and `SAP_PASSWORD` (also `SAP_CLIENT`, `SAP_TIMEOUT_MS`, `SAP_SYSTEM_ID`),
   when set, override the `VITE_SAP_*` values for this check only (`FrontEnd/tests/live/live.ts`), so another account
   or relay can be checked without changing `.env.local`.
