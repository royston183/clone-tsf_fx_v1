# Sorting, layouts, single-line rows and Excel for all tables

- **Date:** 2026-11-05 (client date, Asia/Calcutta)
- **Application:** TSF_FX
- **Requested by:** karth
- **Instructions:** "every table columns should have sorting option and have layout option";
  "all the tables ensure the columns are optimised based on the data automatically . in the tables every row data show it in a single row dont show the data 1 below the the other";
  "ensure export excel button also there in all the tables"

## Implementation

- Routed all 140 data-table locations through the shared React DataTable, including imported
  reference pages and dialogs. The gallery's field-cell example uses a div, since it is a form
  control demonstration rather than a data table.
- Added sorting to previously static data headers, including amounts, dates and Boolean
  values. Existing upstream sort handlers remain responsible for their paginated datasets.
  Other headers sort the rows in the current table view, keeping group/total rows in place.
- Enabled every displayed field in server-list sorting and the existing ALV layout options,
  with matching frontend/backend validation. Unknown fields remain rejected.
- Added Table Layout: show/hide, reorder, Apply, Save Layout, Restore. These new reference
  layouts persist in this browser by route/table; existing ALV personal/shared layouts keep
  their existing backend storage.
- Measured all rendered row values and headers for column widths; descriptions no longer
  shrink below their content. Codes, numeric values and dates remain aligned. Wide tables
  scroll within their containers. Inline cell details remain on the same line.
- Added Export Excel beside every table, including empty tables and dialog tables. Exports
  use the visible column order and current displayed rows, with edited inputs, numeric
  amount cells and text identifiers that retain leading zeros. Totals are included.
- Added missing headers to the key/value and empty-preview tables. React owns row and cell
  reordering, preserving record actions, selections and input handlers.

## Verification

- [x] Focused layout persistence, Excel download/read-back, previously static amount sorts,
  server column sorting and dialog export checks.
- [x] All 39 imported screen routes have shared controls; regression also checks each rendered
  table for a sorting button, layout control and Excel control.
- [x] Visual audit: 82 routes, desktop/phone, light/dark; 328 captures, no remaining findings.
- [x] Complete final Playwright suite: 108/108 passed (5.4 minutes).
- [x] Root verification: 20 deployment checks, 249 backend tests and 774 frontend tests;
  schema, typechecks, lint and production builds passed.
- [x] Preview responds HTTP 200; frontend and backend remain running on ports 3100/3200.

Evidence: `records/results/tables-full-e2e.log`, `records/results/tables-final-verify.log`,
`records/results/table-unit.log`, `records/evidence/screen-audit/audit.json`.
Final audit: 82 routes, 328 captures, zero browser errors, clipped controls/headings,
broken images or page overflows. No live SAP/middleware write or deployment.

## Template candidate

The shared DataTable controls, content sizing and sorting declaration helper are reusable
template candidates. The implementation remains in this application for this request.
