# Catalogue, layouts, modal alignment and Overview refinement

User instructions (2026-11-05):
1. "remove the sample page"
2. "remove the table layout everywhere and replace it with as per the same like Create Master Contract layout"
3. "if already export excel is there then remove the nex export excel button it"
4. "some modals still the alignment issue is still there like in Auto-create Deals modal amount 1 is not showing in the same row of other fields"
5. "wherever u feel extra spaces and gaps remove it"
6. "why overview page is taking time to load"
7. "inside master, FO,MO,BO all the tiles are too clumsy and crowded , can u align and make it better"

Additional user instructions during QA:
8. "rmove zname from the tiles"
9. "in any screen which you are showing the logo inside the page remove it ssame like Create Master Contract"

Implementation and verification are in progress. Work is in D:\Application B\TSF_FX,
the recovered target application; no changes to the framework workspace or live SAP writes.

- Removed Samples from the development/release catalogue and removed its gallery links.
  Existing framework examples are available only in the isolated test build, to retain
  regression coverage for the shared components.
- Replaced the previous Table Layout/Restore UI with the exact shared Master Contract
  Layout picker, Change Layout and Save Layout dialogs. Generic table layouts remain
  browser-local; Master Contract/report personal/shared backend layouts remain in place.
- Reuse existing report and Deal Dump Excel exports; omit the added duplicate button.
- Align field groups at the top, remove sibling margins within grids and compact Auto-create
  Deals amounts. Retain the amount input's shortcut behavior.
- Wider adaptive tiles with aligned icons, text and footers; reduced heading/card gaps.
- Removed transaction-code footers from application tiles. Removed 39 decorative logos
  from imported page/record headings, including the SVG/CSS logo marks, and cleaned their
  unused imports. Workspace navigation and login branding remain outside page content.
- Overview profile before optimization: 8.76s including development module compilation;
  the master-contract API read took 2.01s. Existing dashboard context already deduplicates
  the five sections' source reads. Added development warmup and a 30-second tab-only
  result cache, shared concurrent reads, selection/account scoping and explicit Refresh
  invalidation. Object changes and sign-out clear it.

Final Playwright run: 112/112 passed (4.9 minutes, exit 0). Root verification passed
20 deployment checks, 249 backend tests, 777 frontend tests, schema/typechecks/lint/builds
(exit 0). The final audit covered all 73 routes and 292 captures with zero browser errors,
clipped controls/headings, broken images or page overflows. Overview's completed
source-error state was checked in all four variants and its source notices retained.
The revised Auto-create Deals screenshots were reviewed in both themes and on phone.

Live Overview diagnosis: master-contract query returned 200 in 230ms; the SAP TsfDeal
read took 21,044ms and returned HTTP 502. The page displays Retry notices for its three
SAP-dependent sections; middleware-backed sections remain available. This upstream
SAP/relay failure remains unresolved by the UI changes. Evidence is in
`records/results/overview-live-state.json` and `records/evidence/refinement/overview-live-state.png`.

Evidence: records/results/refinement-*.log, records/results/overview-profile-before.json
and records/evidence/refinement/. No live write, commit or deployment.
