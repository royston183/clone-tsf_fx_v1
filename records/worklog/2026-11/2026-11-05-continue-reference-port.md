# Continue the FX reference port after Claude's usage limit

- Date: 2026-11-05 (Asia/Calcutta)
- Application: TSF_FX
- Request: "wherever claude stops due to limit continue from there"
- Recovered stopping point: frontend compatibility layer, after backend reference
  routes were implemented. Claude's last session stopped at its five-hour limit.
- Earlier user direction recovered from that session: "port all as-is from reference,
  show me at the end" (2026-11-04).

## Scope and progress

- [x] Preserve the existing shell, login/captcha, six principal live screens and data modules.
- [x] Import the remaining 39 implemented FX catalogue entries from the reference.
- [x] Carry across feature dependencies without importing the reference gateway/server.
- [x] Route imported SAP calls through the relay, and middleware/table calls through the backend.
- [x] Record seven reference menu entries with no implemented React feature.
- [x] Complete type, lint, unit, build and schema verification on Node 22.
- [x] Check navigation, light/dark rendering and representative dialogs in the browser.
- [x] Record results and remaining reference limitations.

The import includes 42 feature folders (some are dependencies of other screens).
`FrontEnd/src/ref/port-manifest.json` is the screen-by-screen inventory.
SAP and middleware writes are not exercised during this continuation.

## Reference limitations

There is no reference React screen for option-blotter, view-short-straddle,
bo-settlement-tsf-fx, option-premium-settlement, ndo-cash-settlement,
corporate-mtm-rates or option-premium-deferral. Some implemented reference screens
also contain sample data or disabled actions pending an API; those limitations are
preserved rather than represented as completed live integrations.

## Validation

`npm run verify` passed on Node 22.23.4: 20 deployment tests, schema up to date,
249 backend tests, 770 frontend tests, type checking, lint and both production builds
in the final run after the browser corrections.
The focused compatibility suites passed all 17 tests (TC-001).

Read-only browser review captured four live pages and two dark-mode modal views in
`records/evidence/reference-port/`; no write request was attempted and no uncaught
browser error occurred. Visual review found a collision between the workspace's
`.app { display: flex }` and the reference's generic `.app` containers. A scoped host
stylesheet restores the reference document flow, with a browser regression asserting
that the limit list remains below its page header. Final visual/browser validation
of that adjustment passed.

## Browser review and corrections

The follow-up request was: "after the complete ensure u peformed whole end to end
testing in playscirpt ensure no alignment issue, no page issue and make it look better
after testing from ur side through palscript". Browser automation uses Playwright in Edge.

- Audited all 82 routes, including catalogue menus, settings, samples and the gallery,
  at 1440px and 390px, in both themes: 328 captures and 28 review sheets. No remaining
  document overflow, clipped controls/headings, broken images, route failure or uncaught
  browser error in the final audit. Wide business tables retain their internal scroll.
- Fixed reference/workspace class collisions, duplicate page gutters, phone toolbar
  wrapping, frozen-column behavior, numeric heading alignment, and oversized metric cards.
- Corrected the FX Overview service key to the configured TSF Deals binding; checked
  dashboard loading, key date, units and the full-report link in the browser.
- Fixed two-column record-form edges and date-range width at desktop and phone sizes.
- Restored the binary logo without text conversion and removed remote logo dependencies.
- Fixed an NDF action row overlapping its filters and a short-straddle heading clipping.
- Kept XLSX download URLs alive long enough for Edge to finish the download.
- Corrected sample-record test cleanup to include the current ETag, keeping tests isolated.
- Full-suite review exposed a real list bug: blur expands `8000000` to `8000000.00`,
  and its delayed filter update could return page 2 to page 1. Queries now normalize
  amount values and compare the effective filters, so formatting preserves pagination.

The focused run covering all imported screens, phone headings/NDF actions and amount
pagination passed 8 tests. The final complete suite is recorded after its run below.

## Final browser result

The final production-build Playwright suite passed **105/105** in Microsoft Edge in
4.9 minutes, with no skips or retries. See TC-002 and TC-003 for scope and the expected
reference/API gaps. The raw browser log is `records/results/final-e2e.log`.
The reusable read-only screenshot audit is `scripts/audit-ui.mjs`; its final report is
`records/evidence/screen-audit/audit.json`. The preview remains on http://127.0.0.1:3100.

The final root `npm run verify` also passed: 20 deployment checks, current schema,
249 backend tests, 770 frontend tests, type checking, lint and production builds.
The complete verification log is `records/results/final-verify.log`. No deployment
or live posting was performed; the inherited reference limitations listed above remain.
