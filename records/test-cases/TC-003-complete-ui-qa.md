# TC-003 · Complete browser suite and visual acceptance

- **Case id:** TC-003
- **Lane:** e2e and read-only visual audit
- **Application:** TSF_FX
- **Author:** Codex
- **Created:** 2026-11-05
- **Status:** active
- **Writes to SAP:** no

## Coverage

The complete Playwright suite runs the production frontend and backend on isolated
ports 3300/3301, with an in-memory database and a fake SAP relay on 3399. The real relay
on 3001 is blocked. Tests cover login/captcha, navigation, keyboard dialogs, records,
editable items, review/save/delete flows, layouts, pagination/sorting/filtering,
dashboards and drills, reports/exports, upload, transaction dialogs, workspace settings,
and rendering of all 39 imported reference screens. Upstream write responses are fakes.

The visual audit visits all 82 routes in the development catalogue, including menus,
settings, samples and the gallery. It captures 1440px and 390px in light and dark mode,
retains full-size images and generates 28 contact sheets. The gallery capture is limited
to its viewport; its remaining controls and dialogs are exercised by the browser suite.
Record forms also have automated layout checks at 320px, 390px and 1440px.

## Commands and evidence

| Command | Evidence |
| --- | --- |
| `npm run verify` using Node 22.23.4 | `records/results/final-verify.log` |
| `npm run e2e` using Node 22.23.4 | `records/results/final-e2e.log` |
| With dev servers running, `node scripts/audit-ui.mjs` | `records/evidence/screen-audit/audit.json`, 328 PNGs, 28 contact sheets |
| Optional focused recheck: set `AUDIT_IDS` to comma-separated catalogue IDs | Replaces those screens in the existing audit and regenerates sheets |

Screenshots and raw run logs are ignored by Git because live reads can contain business
data. The audit blocks mutations; the backend POST list-query endpoint is allowed because
it only reads. No live write was attempted in the final audit.

## Visual acceptance

The final audit found zero uncaught page errors, failed route visits, document-width
overflow, clipped controls/headings or broken images across all 328 variants. All 28
contact sheets were reviewed, with full-size review of the corrected screens. Business
tables scroll within their own containers when their columns exceed the phone width.

## Limits

Seven catalogue entries have no reference implementation. Existing WAITING FOR API
messages and disabled posting actions are preserved. The settlement-list screen's
informational missing-API dialog was recorded and dismissed for visual inspection.
This case verifies UI behavior and layout; it does not certify unimplemented business
APIs or live SAP/middleware posting.

## Run history

- 2026-11-05 · PASS · 105/105 Playwright tests in Edge, 4.9 minutes, no skips/retries.
- 2026-11-05 · PASS · 82 routes × 4 visual variants = 328 captures; zero layout,
  broken-image or page-error findings. No live write attempted.
- 2026-11-05 · PASS · Root verification: 20 deployment checks, schema current,
  249 backend tests, 770 frontend tests, type checking, lint and both production builds.
