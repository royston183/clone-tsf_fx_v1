# TC-005 · Catalogue, layouts, exports, modals and Overview

- Date: 2026-11-05
- Writes to SAP/middleware: none
- Specs: ui-refinement.spec.ts, universal-tables.spec.ts, reference-port.spec.ts,
  catalog.test.ts, dashboard-cache.test.ts and the complete regression suite.

Assertions:
1. The application catalogue excludes Samples and its routes; test examples remain isolated
   to test-mode builds so shared component CRUD/report regression checks still run.
2. Generic tables use the same Layout picker, Change Layout and Save Layout components as
   Create Master Contract; hide, reorder, save a named default, reload and return to Standard.
3. Existing report and Deal Dump Excel exports appear once. Dialog tables still export.
4. Auto-create Deals first-row inputs align within one pixel in both themes; the amount
   remains editable with shortcuts. Phone modal content stays within its frame.
5. Master/FO/MO/BO tiles have equal row widths and aligned headings, without phone overflow.
6. Overview shares concurrent loads and reuses results for 30 seconds in the same tab,
   scoped by selection/account. Refresh, object changes, account changes and sign-out clear
   the cache. Failed reads are retried.
7. All remaining routes render at desktop/phone widths in light/dark; imported preset
   fields are superseded by shared layout controls.
8. Tiles omit SAP transaction-code names and imported screen/record headers omit all
   39 decorative company logos. Titles, Back buttons and actions stay aligned.

Run history (2026-11-05): 112/112 Playwright tests passed in 4.9 minutes (exit 0).
Root verification passed 20 deployment checks, 249 backend tests and 777 frontend tests,
plus schema, typechecks, lint and production builds (exit 0). Visual audit covered all
73 routes in four variants (292 captures), with zero browser errors, clipped controls,
clipped headings, broken images or page overflows. Modal screenshots were also reviewed
in light/dark and on phone. No live SAP/middleware write was attempted.

Live data limitation: the SAP TsfDeal read returned HTTP 502 after 21.04 seconds in the
final live check; the master-contract read returned HTTP 200 in 0.23 seconds. The Overview
source-error state was checked in all four variants, with Retry notices and the available
middleware sections visible. This is an unresolved live SAP/relay availability issue,
distinct from the passing UI regression suite, whose background reads use fixtures.
Evidence: records/results/refinement-final-verify.log, records/results/refinement-full-e2e.log,
records/evidence/screen-audit/audit.json, records/results/overview-live-state.json.
