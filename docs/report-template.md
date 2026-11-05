# Report and dialog design for applications B and C

The shared frontend follows SAP Reporting (reference, when present on this PC: `D:\SAP Tool\SAP - Reporting`).
Keep these conventions when adding reports or custom pages, in either navigation theme:

These are the default frontend design rules for both B and C. A person's explicit request for their own design or
an outside reference takes precedence over the default look and composition. Build that design in custom React
pages/components with scoped CSS; keep reusable amount, table, validation, responsive and keyboard behavior where
compatible. An ordinary screen change keeps the template design. The shared table conformance check covers the
template's component kit; custom pages can implement an explicitly requested alternative.

- **Layouts on the right.** Use `LayoutControls` as the final group of a report or list toolbar. Keep its picker,
  Change Layout, Save Layout and Delete together. At smaller widths the group wraps to its own right-aligned row.
- **Separate, collapsible inputs.** Wrap report and dashboard input fields in `SelectionPanel`, outside the results
  card. It can collapse before the first run, during a run and afterwards. Hiding inputs keeps drafts and results;
  the summary and Change selection button stay visible. Running remains explicit.
- **A flow overview on every report.** `ReportOverview` connects selections, the report and its results. Supply the
  report's own selection summary and output description/count. Its labelled status reflects waiting, running,
  success and errors. Custom business diagrams can supplement this overview with their own connected hierarchy,
  like Reporting's group structure; never invent business relationships or values.
- **Modal input sections.** Compose related inputs with `DialogSection` or `FieldGroup`. Give each group a clear
  title and optional explanation. Keep actions in `Modal`'s footer and scroll long content inside its body. The
  shared focus handling and responsive sizing apply to every modal. General dialogs use a compact blue gradient
  header; record dialogs use a plain header with the record key and status, key facts, and keyboard-friendly tabs.
- **Wizard progress.** Use `WizardSteps` for real multi-stage workflows (file → review → post, edit → review → save).
  The owning screen validates each stage and blocks posting/saving while busy. A single form needs named sections,
  not artificial steps. Keep Enter, Escape, Ctrl+S, Back and focus return behavior.
- **Compact, data-sized forms.** Use `FieldControl` inside `FormGrid` so dates, codes, currencies and rates keep compact
  widths, date ranges stay together and long text can use the full row. Fields wrap in their original reading order;
  never force a date range across an entire wide dialog. `formSize` can override the inferred `short`, `normal`,
  `long` or `full` size when a business field needs it. Do not add empty grid cells or fixed-height form bodies.
- **Amount shorthand everywhere.** Every amount input, in forms, editable cells and From/To list filters, accepts shortcuts: `1L` (lakh),
  `2Cr` (crore), `500K` (thousand), `1M` (million), `1B` (billion) and `1T` (trillion), including full words,
  decimals and case-insensitive suffixes. Enter or blur expands the full amount with en-IN comma grouping and right
  alignment; there is no input unit dropdown. The same field behavior normalizes grid paste and saved values.
  Conversion uses decimal strings, retaining the currency's scale without rounding. Use `AmountValue` for
  read-only amount facts; review and upload dialogs have a shared amount-unit picker. Mark upload amount columns
  with `type: 'amount'` (and `scale` where needed); conversion must never change posted file values. Rates, dates,
  counts, identifiers and currency codes are never scaled.
- **Traffic-light status tags.** Use `TrafficLightTag`: green for ready/success/connected, amber for waiting,
  running/review/sample data, red for errors/rejections/breaches. Always include a readable status label; colour
  and the dot supplement text. Counts and ordinary metadata may use a neutral pill.
- **One table component for every table.** Render `DataTable` from `components/table/DataTable` instead of a native
  `<table>` in reports, lists, dialogs, lookup tables and custom pages. It uses one column plan for headings, data,
  subheaders and totals. Pass `columnsFor(columns, fields)` from the module schema, including any selection or action
  columns in the same order. Amounts and numbers align right, dates/codes/text left, flags/actions centrally; an
  explicit column `align` or `width` takes precedence. Sort/filter buttons retain their column's alignment and
  padding. Widths follow visible values, labels and field types: short data stays compact, descriptions wrap, and
  wide tables scroll in a `table-wrap`/`ds-grid-wrap` container rather than squeezing or stretching every column.
  Layout changes, sorting, paging, uploads and unit conversion recalculate the same column plan. The conformance
  check rejects native tables outside this component so new B/C applications retain this behavior.

Table columns, report columns and display fields can set `statusTone: row => 'green' | 'amber' | 'red'` to use
the same tags through `StatusValue`. Choose tones from the module's business rules; labels, sorting and exports
keep their original text values. The Deals sample shows New in amber and Released in green.

`ReportWorkbench` applies the report conventions to formatted and line-item reports; `DashboardView` applies
the same input and overview conventions to dashboards. The Gallery includes `B-report-overview`,
`B-report-selection`, `D-wizard` and `B-badges` as reusable examples. Styles live in
`FrontEnd/src/styles/report-template.css`, after the ALM baseline. Check light and dark themes, a narrow screen,
and keyboard navigation when extending them.

Transaction-number hyperlinks use `TransactionLink` and the workspace's `TransactionProvider` by default. Its
`TransactionModal` frame and FTR display layout follow `SAP - Reporting`: the same 1040px popup, blue gradient
header, compact SAP label/value rows, tab order, fieldset groups, cash-flow grids and footer actions. Securities,
money-market and security-class displays use this shared frame. Register transaction sources through
`src/config/transactions.ts`; do not build a separate popup for each report or module. An explicit human redesign
request can customize the design as described above.

The home Overview can name a dashboard module on its catalogue node (`type: 'overview', module: '<the app's Overview module>'`).
`DashboardView` loads an `autoRun` dashboard with its `defaults`, or the selection in the URL. Its `overview` options
enable the Reporting-style key date and scope controls. Sections support company cards (`entities`), KPI tiles,
connected lifecycle steps (`flow`), bar lists (`barList`), share bars (`share`), donuts with named measures, series
charts and summary tables. Add sections and their loaders without replacing the home shell. The template's
`FrontEnd/src/modules/samples/portfolio/` is a sample treasury portfolio and a pattern only; an application registers
its own Overview module and loaders to read its own data. A catalogue may have no `type: 'overview'` page, and then
`/` opens its first page. Sample figures are labelled as sample data, never as live SAP data.

Use `defaultUnit` for the initial amount unit. Summary columns can declare `format: 'count' | 'percent' | 'text'`
so only amount columns scale. A summary can include a total row, `footnote` and an `explore` screen target. Loaders
share memoised `ctx.rows`, `ctx.count` and `ctx.report` reads; SAP reads use the existing relay and module contract.
New components are demonstrated by `B-overview` in the Gallery. `dashboard-template.css` styles these parts and
`spacing-template.css` applies the shared 4/8/12/16/20/24 spacing scale after the baseline styles.

FS Sprint derives C from B's committed frontend. Update and verify this shared template, commit only the intended
template changes, then run `npm run pack:sapfsnxt` and `npm run pack:standalone` in the desktop project to refresh
both encrypted bundles. Existing application copies retain their own files until explicitly updated.
