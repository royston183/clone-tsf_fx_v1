# TC-004 · Sorting, layouts, sizing and Excel for every table

- **Date:** 2026-11-05
- **Status:** active
- **Lanes:** unit, e2e (relay stub), visual/read-only
- **Specs:** `table-coverage.test.ts`, `table-model.test.tsx`, `table-layout.test.ts`,
  `universal-tables.spec.ts`, `reference-port.spec.ts`
- **Writes to SAP:** no

## Assertions

1. Every native table is created by shared DataTable; every data table supplies headers.
2. Every imported screen's table has layout and Excel controls and sortable data headings.
3. Hide and reorder columns, save, reload: saved visible order persists. Restore returns the standard.
4. Download XLSX: read it back, verify visible header order and exported data rows.
5. Sort formerly static imported amount columns ascending/descending; numbers compare numerically.
6. Server lists allow all displayed fields and retain working paging/sorting.
7. Editable/dialog tables retain Excel controls. No live transport is used.
8. Full content widths and no-wrap cells remain within a scrolling table, at 1440px and 390px.
9. Existing report/group totals, action handlers, keyboard dialogs and CRUD tests still pass.

## Limits

New table-specific layouts are saved on this browser. Existing ALV layouts retain personal/shared
storage. Table Excel exports the current displayed view; existing report exports retain their
broader report behavior. Sorting selection/action columns is not meaningful and is excluded.

## Run history

2026-11-05: final Playwright run passed 108/108 in 5.4 minutes. Excel files were
downloaded and read back to verify column order, amount headers and leading-zero IDs.
Root verification passed 20 deployment checks, 249 backend tests and 774 frontend tests,
plus schema, typechecks, lint and production builds.

Visual audit passed for 82 routes in four variants (328 captures): desktop/phone,
light/dark. Zero browser errors, clipped controls/headings, broken images or page
overflows remained. No live write was attempted. Local preview returned HTTP 200.

Evidence: `records/results/tables-full-e2e.log`, `records/results/tables-final-verify.log`,
`records/evidence/screen-audit/audit.json`. Re-run with `npm run e2e`, `npm run verify`
and `node scripts/audit-ui.mjs` while the development servers are running.
