# How to add an application

This project is the template for every new SAP web application. A new application is built in its own folder,
starting from a copy of this template. **When FS Sprint runs the template** (application SAP + FSNxt Development),
its New application form collects the project name, application type and reference project, makes the
copy and records it: skip the stand-alone start below. The application type is **FE + BE + DB** (`FrontEnd/`,
`BackEnd/`, `DB/`) or **Front end only** (`FrontEnd/` alone); the structure and stack of both are in
`docs/stack-and-structure.md`. **The app's theme is the **UI template** line in records/APPLICATION.md and `APP_THEME` in FrontEnd/src/runtime.ts: Tile theme (tile catalogue, rail) or Normal theme (the LAS look, components/normal/). Build pages for that theme; never change it.**
The theme's shell and shared controls are a starting point. Build a user's requested page layout or navigation
directly, without requiring another template selection or restricting the page to the available module kinds.
SAP Reporting mixes tile entry pages with custom dashboards, reports and group views
(reference, when present on this PC: `D:\SAP Tool\SAP - Reporting`).
Inside it, an application is a catalogue entry plus a module or a custom React page. A table-maintenance application (like Time
Buckets) needs no new UI code: the Workbench renders it from its definition. Copy `FrontEnd/src/modules/time-buckets/` as
the template.

## Start (stand-alone only): copy the template and open the records

Stand-alone, ask only for missing project name, target folder, application type and optional reference project, and
every application is recorded in `docs/application-log.md` when its build starts; its status there is updated at each
milestone (what proves each status: `docs/application-status.md`).

1. Commit any pending template changes: the script copies the committed template only.
2. Run, from this template:

   ```powershell
   .\scripts\new-application.ps1 -ProjectName "Deal Capture" -Target "C:\Apps\Deal Capture" -AppType FullStack
   # Tiles are the default. -AppType FrontEnd for a Front end only application;
   # -Reference "<path>" when modelled on another project
   ```

   It copies the template into the (new or empty) target folder without the files `template.json` lists in
   `bundleExclude` (the copy keeps its `CLAUDE.md`) and `scaffoldInputs`, shapes it by `-AppType` (`FullStack`:
   FrontEnd, BackEnd and DB; `FrontEnd`: FrontEnd alone, with the core in `FrontEnd/src/core`), writes `APPLICATION.md`, opens the first
   worklog `records/worklog/<YYYY-MM>/YYYY-MM-DD-HHmm-<slug>-build.md`, names the copy in its `package.json` files, `README.md`
   and `CLAUDE.md`, and adds the row from `records/_application-log-row.md` to `docs/application-log.md`. The system
   comes from `.env.example` (`VITE_SAP_SYSTEM_ID`, `VITE_SAP_CLIENT`); pass `-SystemId` and `-SystemLabel` for another one.
   Scaffolding does not commit, push or install. In an interactive terminal it then asks whether to deploy; only an
   explicit Yes installs and verifies, opens GitHub sign-in, pushes a private repository, deploys to Azure, and
   prints the live URL. Pass `-Deploy No` to suppress that prompt or `-Deploy Yes` for an automated confirmation.
   `-Theme Tiles|Normal` sets the theme (default Tiles; it sets `APP_THEME` in `FrontEnd/src/runtime.ts`). It does not limit individual page layouts. The records retain the `{{THEME}}` placeholder for existing FS Sprint integrations.
3. If deployment was skipped, commit the log row here; in the target run `git init`, `npm run install:all` and copy
   `.env.example` to `.env.local`. For deployment, add `PROVISIONER_KEY` only to that uncommitted local file.

From then on the application keeps its own records (kit in `records/`, same pattern as SAP-Project-Development V1
and SAP-Testing-Automation):

| Record | Where | Committed |
|---|---|---|
| Identity card: modules, screens, verbatim approvals, SAP services, status history | `APPLICATION.md` | yes |
| One worklog per activity, kept current, with Todo, Object list and Delivery checks | `records/worklog/<YYYY-MM>/` | yes |
| Evidence for an activity (screenshots on sample data) | `records/worklog/<YYYY-MM>/evidence/<worklog stem>/` | yes |
| Test cases with their Run history | `records/test-cases/TC-nnn-<module>-<slug>.md` | yes |
| One run record per run (PASS / FAIL / BLOCKED / PARTIAL) | `records/results/` | no (business data) |
| Screenshots with live SAP data | `records/evidence/` | no |
| Lessons, append-only, written in the same turn | `records/lessons/lessons-ledger.md` | yes |

Every status change goes in `APPLICATION.md` and, stand-alone, in this template's `docs/application-log.md` (under FS Sprint, FS Sprint records it).

## 0. Design and approve the UI (on sample data, before any SAP or database read)

1. List the requested screens and layouts. For each, name shared Gallery items where useful (open `/gallery` in development) and its fields with
   their types, e.g. *Create Deal: D-form (2 columns) · deal F-code · amount F-amount + currency F-suggest · validity
   F-dateRange*.
2. Build the screens on sample data: `definition.ts` with typed `grid` fields and `seed.json`, registered without a
   `source` (the sample data is kept in memory), or a custom page component with sample data (section 2c); no
   `contract.ts` and no own-data table yet. Use scoped CSS for layout or visuals the shared controls do not cover.
3. Run `npm run dev` (FrontEnd http://127.0.0.1:3100), take screenshots (light and dark), share them with the URL, and wait for approval. Changes go
   back to step 1.
4. After approval give each module its source, `sap` (section 1) or `app` (section 1a), and continue with sections
   2-4. A module that has its source never goes back to its sample data.

### UI kit pieces by Gallery ID

- **F-*** fields: one per field type (`F-text`, `F-amount`, `F-date`, `F-dateRange`, `F-period`, `F-suggest`, `F-file`, and more), in `FrontEnd/src/components/fields/FieldControl.tsx` (laid out with `FormGrid` and `FieldGroup` in `FrontEnd/src/components/fields/FormGrid.tsx`).
- **D-*** dialogs and panels: `D-form`, `D-confirm`, `D-delete`, `D-review`, `D-valuehelp`, `D-object`, `D-drawer`,
  `D-popover`, `D-upload`, in `FrontEnd/src/components/ui/`.
- **B-*** feedback: `B-toast`, `B-notice`, `B-empty`, `B-loading`, `B-badges`.

A new Gallery item must also be listed in `FrontEnd/src/components/gallery/ids.ts` (and a new section added to `GALLERY_SECTIONS`); `FrontEnd/tests/unit/gallery-ids.test.ts` and `galleryItem()` enforce it.

### Field types

Every grid or form field is a `FieldDef` (`FrontEnd/src/lib/fields/types.ts`) with a `type`:
`text, code, integer, amount, decimal, date, dateRange, period, select, suggest, multiSelect, flag, toggle, segmented,
textarea, file, display`. The type cleans pasted values, checks them before every write, formats them
in tables (amounts right-aligned, en-IN grouping; dates DD-MM-YYYY) and converts them for OData V4.

The engine runs the field-type checks automatically: `checkRow` in `FrontEnd/src/lib/grid/grid.ts` runs `checkFields` first and
then the module's `check()`, in the grid and again in the planner before every write. A non-empty message from `check()`
replaces the type message for that field. So `check()` only adds business rules. `FormDialog` applies the same rule
in the dialog only: whoever handles its `onSave` must write through the data client (`FrontEnd/src/lib/client/data.ts`),
whose services run the same checks (field types via `checkFields`/`checkRow`, plus the business rules) before the write.

## 1. The SAP service

1. Build or reuse an OData V4 RAP service binding (`ZFS_SB_<Entity>_O4_API`) and publish it. Naming and RAP rules:
   `docs/naming-conventions.md`. List every RAP object in the worklog Object list.
2. Add the service to `FrontEnd/src/config/services.json` (`path` is the service root, without a host):
   ```json
   { "key": "banks", "title": "Banks", "binding": "ZFS_SB_BANKMASTER_O4_API",
     "path": "/sap/opu/odata4/sap/<binding_lowercase>/srvd_a2x/sap/<srvd_lowercase>/0001/" }
   ```
3. Give the module its source in `FrontEnd/src/modules/server-registry.ts`:
   `SERVER_MODULES.banks = { def, contract, seed, source: 'sap' }`. The browser then calls the service through the relay
   (`VITE_SAP_RELAY_URL` + `path`; the SAP host lives only in the relay's configuration) as the SAP user of Settings →
   SAP Connection, as in SAP Reporting. Check it there with Test & save, then Test connection. Keep the login page.

## 1a. The application's own data

Data that does not live in SAP (notes, settings, a planning table) belongs to the application: `source: 'app'` in
`FrontEnd/src/modules/server-registry.ts`. The module keeps its definition, contract and seed (the seed fills the store
on first use). Where the rows live depends on the application type:

- **FE + BE + DB:** the BackEnd keeps them in tables of `DB/app.db` generated from the definition, one per module
  table (`<module>__<table>`; Azure MySQL once deployed), and answers `/api/modules/<id>/…` only for `app` modules.
  `npm run gen-schema` writes the migration (`DB/README.md`); never write SQL for module tables by hand. The browser
  calls it only through `FrontEnd/src/lib/client/backend-api.ts`. The BackEnd runs the module's `check()` again and
  is the authority.
- **Front end only:** browser storage (`localStorage`, per browser).

The Deals sample (`samples/deals`) is the template's `app` module.

## 1b. Data in an external REST data service

Data that another system keeps outside SAP and must stay there (shared with other applications), such as tables on the
SLC middleware in Azure, is `source: 'rest'` (FE + BE + DB only). The BackEnd reads and writes it on every call; the
browser reaches it only through the BackEnd (`backend-api.ts`), so the FrontEnd stays static. Nothing is copied into
`DB/` (no generated tables); saved ALV layouts of the module are still kept by the BackEnd.

1. List the service in `FrontEnd/src/config/rest-services.json`: `{ "key": "slc-middleware", "title": "SLC middleware",
   "base": "https://<host>/api/v1" }` (no secret in this file). The BackEnd environment's `REST_<KEY>_URL` overrides the
   base URL (`REST_SLC_MIDDLEWARE_URL`), and `REST_<KEY>_AUTHORIZATION`, when set, is sent as the Authorization header.
2. Give the module a `rest` contract next to its OData-style `contract` (`FrontEnd/src/modules/types.ts` `RestContract`):
   per table the `resource`, the `columns` (module field → the service's column, keys included), `numbers`, the key the
   service numbers itself (`assigned`, read back as `assignedNumber`) and the audit `stamps` columns.
   `lookups` read the value lists from the service's resources (`{ resource, filter?, columns }`; the module's
   `lookups(raw)` maps them), and a table's `derive(row, lookups)` returns the fields the BackEnd works out before every
   create and change from the whole row (descriptions other systems read from the same table, a converted amount).
3. Register it: `SERVER_MODULES.<id> = { def, contract, seed, source: 'rest', rest }`.

The protocol is the SLC middleware's: `GET data/<resource>?<COLUMN>=v&<COLUMN>[in]=a,b&limit=500&offset=n` → `{ rows }`,
`POST data/<resource> { data }` → `{ key, assignedNumber }`, `PATCH { key, changes }`, `DELETE { key }`; dates are
`YYYY-MM-DD`, decimals strings. The BackEnd runs the module's `check()` before every write, as for `app` data. A row's
ETag is a hash of its content, so a save on a row someone changed since it was read is refused (409). The service has no
transaction across rows: a write of several rows that fails part-way says how many were saved. Large lists are read
whole (at most 20,000 rows) and filtered, sorted and paged by the BackEnd.

## 2. The module folder `FrontEnd/src/modules/<name>/`

- `definition.ts`: a `ModuleDef<L>` with `tabs` (one per table), each with:
  - `columns`: the table columns, built with `col()`, `flagCol()` and `stampCols()`;
  - `grid`: the add/edit grid columns, each a typed field (`type`, `max`, `required`, `key`, `options`, `lookup`, `valueHelp`; legacy `clean`/`flag` still work);
  - `keys`, `filters`, `search`, `defaultSort`, `noun`;
  - `check(row, lk, mode)`: the validation rules. They run in the browser before every write, and again in the
    BackEnd for `app` modules;
  - `fields`: every field per table as read from SAP, including stamps;
  - `lookups(raw)`: value helps from the contract's `lookups`;
  - optional `enrich` (display texts) and `stamps`.
- `contract.ts`: an `ODataContract` that maps tables to entity sets, the property naming (`pascal`/`rap`) with
  per-field overrides, `numbers` (Edm.Decimal fields sent as JSON numbers), `etag`, `keyTypes` and `lookups`.
- `seed.json`: sample `tables` and `lookups`: the module's data while it has no `source` (UI approval), the first rows
  of an `app` module, and the fixtures of unit and e2e tests.

## 2a. Choose the module kind

Every standard module sets `kind` (table maintenance is the default). Reuse a matching sample from the Gallery
(`/gallery` → Templates) under `FrontEnd/src/modules/samples/` when it fits. Custom pages (section 2c) can compose
these screens or implement another layout entirely.

| Kind | Template | Sample | Use it for |
|---|---|---|---|
| `table` (default) | Workbench | Time Buckets | small customizing tables, loaded whole; add / edit grid / delete |
| `object` | T-large-list + T-object | `samples/deals` | one business object with items: list → pop-up, `?open=<key>` links |
| `items` | T-items | `samples/monthly` | amounts for a selection (company code, period): grid with totals per currency |
| `upload` | T-upload | `samples/budget` | .xlsx / .csv files checked row by row, then posted at once |
| `report` | T-report | `samples/liquidity`, `samples/cashflow` | read-only statement or line items with ALV layouts, breakdown, drill, export |
| `dashboard` | T-dashboard | `samples/treasury` | read-only tiles, charts and summary table, one loader per section |

The samples are Gallery-only: `devOnly: true`, `serviceKey: 'samples'`, on their sample data (Deals is the template's
`app` module). When you copy one, drop `devOnly`, use your own `serviceKey` (registered in
`FrontEnd/src/config/services.json`, step 2 of section 1), `id` and `storageKey`, add a contract and seed, and give it
its source.

**table** — the default kind; see section 2 and `FrontEnd/src/modules/time-buckets/`. A minimal tab:

```ts
export const banks: ModuleDef<Lookups> = {
  id: 'banks', title: 'Banks', noun: 'banks', serviceKey: 'banks', storageKey: 'app-banks', blankRows: 5, strict: true,
  tabs: [{
    id: 'banks', label: 'Banks', title: 'Banks', noun: ['bank', 'banks'], editable: true, keys: ['bankKey'],
    defaultSort: { col: 'bankKey', dir: 1 }, columns, search: r => [r.bankKey, r.bankName], filters: [],
    grid: [bankKey, bankName], check: () => ({})
  }],
  fields: { banks: ['bankKey', 'bankName'] }, lookups
};
```

A table-maintenance tab too large to load whole sets `large: true` and a `list` (its `entity` is the tab id): SAP
then searches, filters, sorts and pages it, and saves are planned against the rows sent.

**object** — the header entity, item navigations and bound actions come from the contract:

```ts
export const deals: ObjectModuleDef<DealLookups> = {
  kind: 'object', id: 'deals', title: 'Deals', noun: ['Deal', 'Deals'], serviceKey: 'deals', storageKey: 'app-deals',
  keyBySap: true,
  list: { entity: 'deals', keys: ['deal'], columns, fields, search: ['deal', 'name'], filters: ['product'], sort: ['deal'], defaultSort: { field: 'deal', dir: -1 } },
  header: [deal, name, product, amount, currency],
  tabs: [
    { kind: 'fields', id: 'basic', label: 'Basic Data', groups: [{ title: 'Terms', columns: 2, fields: [validity, rate] }] },
    { kind: 'items', id: 'flows', label: 'Cash Flows', table: 'flows', keys: ['deal', 'seq'], grid: flowGrid, columns: flowColumns, editable: true }
  ],
  actions: [{ id: 'release', label: 'Release', sapAction: 'Release', confirm: 'Release this deal?', when: h => h.status !== 'R' }],
  lookups
};
// contract: tables { deals: { entitySet: 'Deal' }, flows: { entitySet: 'DealFlow' } },
//           object: { items: { flows: { navigation: '_Flows' } }, actions: { release: '<qualified action name>' } }
```

Two contract rules for objects:

- `contract.object.items[tab].navigation` is required for every items tab. Nothing is guessed: a missing navigation
  is an error.
- `contract.object.itemEtag` is `'own'` (the default: each item carries its own ETag) or `'parent'` (RAP
  `etag dependent by _Parent`: the items share the header's ETag).

An object's `check(header, items, lk, mode)` returns `ObjectProblems` (`FrontEnd/src/modules/types.ts`): build the
header messages in a `Record<string, string>` and add a field only when it has a message, never as `{ amount: undefined }`
(the type has no optional values, so verify fails):

```ts
check: header => {
  const problems: Record<string, string> = {};
  if (header.amount && Number(header.amount) <= 0) problems.amount = 'Amount must be greater than zero.';
  return { header: problems, items: {}, messages: [] };
}
```

**items** — `keys` lists the selection fields first, then the item's own key:

```ts
export const amounts: ItemsModuleDef<Lookups> = {
  kind: 'items', id: 'amounts', title: 'Monthly Amounts', noun: ['amount', 'amounts'], serviceKey: 'amounts', storageKey: 'app-amounts',
  entity: 'amounts', keys: ['company', 'month', 'year', 'gl'],
  selection: [company, { field: 'month', label: 'Period *', type: 'period', yearField: 'year', required: true }],
  grid: [gl, amount, currency], totals: ['amount'], maxRows: 500, lookups
};
```

**upload** — `columns` are the template's columns, in order:

```ts
export const budget: UploadModuleDef<Lookups> = {
  kind: 'upload', id: 'budget', title: 'Budget Upload', noun: ['budget line', 'budget lines'], serviceKey: 'budget', storageKey: 'app-budget',
  entity: 'budget', keys: ['gl', 'costCenter', 'month', 'year'], columns: [gl, costCenter, period, amount, currency],
  mode: 'upsert', strict: false, lookups
};
```

`maxRows` defaults to 5000 for an upload and can be set per module (`maxBytes` defaults to 5 MB). An items module
sets its own `maxRows` too (the sample uses 500).

**NUMC integers.** An `integer` field that sets `max` and is not listed in `contract.numbers` is a NUMC field: it
is padded with zeros to `max` and compared as a string in filters and sorting. Keys are not padded: a key is sent
exactly as given, so it must arrive in SAP's stored form (e.g. `0001`). An integer without `max` has numeric
semantics. So every NUMC field must set `max`, and a real number field goes into `contract.numbers`.

**Checks.** The type checks and the module's rules run automatically through `checkRow` (type checks first, then
the module's `check()`) before every write. The authority is SAP for `sap` modules (the screen shows SAP's messages)
and the BackEnd for `app` modules (it runs `checkRow` again). A `FormDialog` `onSave` writes through the data client
too.

Register the module in `FrontEnd/src/modules/registry.ts` and `FrontEnd/src/modules/server-registry.ts` (with its contract and seed),
and add it to `FrontEnd/src/config/catalog.ts`. Every kind writes one `$batch` changeset per save, sends the row's ETag as
If-Match on updates and deletes, and turns SAP's 412 into "changed by someone else" (409). Objects and items use the
ETag the person saw and refuse a stale save with the same message before anything is sent, on SAP and on the application's
own store: an object whose ETag changed; a selection where a row was added, changed or deleted since Show (the browser
sends the key and ETag of every row it read).

## 2b. Reports and dashboards (read-only)

Neither kind writes to SAP. Both start with a typed selection bar; nothing is read until **Run** / **Show**, and the
selection travels in the URL as `s.<field>` so links and bookmarks run it again. Copy `samples/liquidity` (formatted),
`samples/cashflow` (line items) or `samples/treasury` (dashboard).

**report, formatted** — SAP builds the rows, their styles and the hierarchy:

```ts
export const statement: ReportModuleDef<Lookups> = {
  kind: 'report', id: 'liquidity', title: 'Liquidity Statement', serviceKey: 'liquidity', storageKey: 'app-liquidity',
  selection: [company, { field: 'month', label: 'Period *', type: 'period', yearField: 'year', required: true }],
  report: {
    variant: 'formatted', entity: 'statement', idField: 'id', idLabel: 'Group ID', orderBy: 'seq',
    columns: [{ id: 'name', label: 'Group Name', type: 'text' }, { id: 'b1', label: '1–7 days', subHeader: 'B1', type: 'amount', drillable: true }],
    style: r => styleOf(r.rowStyle),            // heading | level1 | normal | subtotal | total | percent | warn
    parent: { by: 'prefix', separator: ':' },   // or { by: 'field', field: 'parentId' }
    hideFlag: { field: 'split', label: 'Hide interest split rows' }, fields: ['rowStyle', 'split', 'product']
  },
  // column is null for the id cell, else the id of the amount column
  drill: row => styleOf(row.rowStyle) === 'heading'
    ? { kind: 'breakdown' }
    : { kind: 'screen', module: 'deals', filters: { product: row.product }, label: 'Open the deals' },   // or { kind: 'none' }
  lookups
};
```

`fields` lists every other entity field the rows carry (the OData codec maps only declared fields); `orderBy` is SAP's
row order. `units` (optional) replaces the display units Absolute / Thousands / Lakhs / Crores; `check` (optional)
adds selection rules that run before the report is read. A breakdown is computed by the report service from a fresh
read; a row that is gone answers 404 "This row is no longer in the report."

**report, line items** — SAP sends flat rows; ALV layouts arrange them:

```ts
report: {
  variant: 'lineItems', entity: 'flows', columns,       // code columns may name a textField (description); amount columns a scale (default 2)
  standard: { columns: [...], sort: [{ col: 'payDate', desc: false }], subtotals: ['company'], unit: null, subtotalsOnly: false },
  open: 'deals',                                         // an object module: a click on a line opens it
  layouts: { maxSort: 5, maxSubtotals: 3, sharedEditors: ['FINANCE01'] }   // omit sharedEditors: everyone may share
}
```

At most `maxRows` (default 20,000) rows are read; more is refused with "Too many rows (more than 20,000). Narrow the
selection." Subtotals and totals are exact and per currency; an amount column whose values carry more than 2 decimals
(KWD, BHD, OMR) declares `scale: 3`, or those lines would be left out of the sums. Excel and CSV export what is on
screen: in Excel amounts and percents are number cells (Excel can sum them), the rest text.

**ALV layouts** are also available on a large list (`layouts: {}` in the module's `list` definition, as in the Deals
sample): columns, sort and page size. They are stored by the BackEnd in the `layouts` table of `DB/app.db` (a Front
end only application: the browser's storage; a module still on sample data: memory) — shared ones for everyone (or for
`sharedEditors`), personal ones for the acting user only (the SAP user, else `DEMO`) — never in SAP. Every saved layout is checked against the module (unknown column, too many sorts, a subtotal on an amount →
400); a layout that names a column the module no longer has still opens without it.

**dashboard** — the definition names the sections (`tiles`, `bars`, `line`, `donut`, `table`); a loader part loads each:

```ts
export const overview: DashboardModuleDef<Lookups> = {
  kind: 'dashboard', id: 'treasury', title: 'Treasury Overview', serviceKey: 'treasury', storageKey: 'app-treasury',
  selection: [company, period], units, quarterStartMonth: 4,
  sections: [{ kind: 'tiles', id: 'kpis' }, { kind: 'bars', id: 'gap', title: 'Mismatch by month' }, { kind: 'table', id: 'summary', title: 'Summary' }],
  lookups
};
// dashboard.server.ts (it runs where the dashboard service runs): one loader per section, reading registered report modules through ctx.report().
export const overviewServer: DashboardServer = {
  sections: {
    kpis: async (sel, ctx) => ({ kind: 'tiles', tiles: [...] }),
    gap: async (sel, ctx, range) => ({ kind: 'series', format: 'percent', series: [...] }),   // range: '3m' | '6m' | '12m' | '4q'
    summary: async (sel, ctx) => ({ kind: 'table', columns, rows, drill })
  },
  chips: async (sel, ctx) => [{ label: 'Saved', tone: 'saved' }]   // optional status chips
};
```

Limits and RAG are decided in the loader part, never from the selection or other input. A tile meter is `{ value, limit }` with one
sign convention shared with the chart limit line (`Series.limit`): a mismatch of `-17.54` against a limit of `-15.00`;
the tile shows the share of the limit used ("117 % of limit used · limit -15.00 %"), 0 % while the signs differ.
A tile's status tone is `rag` (`'green' | 'amber' | 'red'`) or `tag: { label, tone }`. `tag` shows its own label (any
status that is not a limit: `{ label: 'Draft', tone: 'amber' }`) and wins over `rag`. `rag` keeps the limit wording
(Within limit / Near limit / Breach) only on a tile with a `meter`; a `rag` without a `meter` reads On track / Attention
/ Action needed.
Tiles and charts of amounts name the display unit whenever it is not Absolute ("246.00 Lakhs INR", "Amounts in
Lakhs"). `ctx.report` reads each report and selection once per request (sections share the rows: do not change them; `ctx.rows`
and `ctx.count` read a module's table the same way, see "Build the Overview"),
and lookups are cached for 60 s. A loader that throws (or returns the wrong
kind of data: tiles, series, slices or table) shows its own error with Retry; the other sections still load. A donut
section returns `{ kind: 'slices', slices }`. Register the loader part as
`SERVER_MODULES.<id> = { def, contract, seed, dashboard: overviewServer }` and give the definition a
`sampleSelection`: a selection that loads every section on its sample data (`FrontEnd/tests/unit/definitions.test.ts`
runs each dashboard with it and checks its click-through targets). A dashboard that only reads other modules still
registers a contract (empty `tables: {}`) and a seed (empty tables); the conformance test requires both.

**Where a dashboard runs, and which reports it can read.** `ctx.report` runs the report where the dashboard runs, and
a dashboard runs where its own data lives. In an FE + BE + DB application a dashboard with `source: 'app'` runs in the
BackEnd; any other dashboard (`sap`, or on sample data) runs in the browser. **A dashboard can read only reports whose
data lives on the same side: SAP and sample-data reports in the browser, app reports in the BackEnd.** Any other
combination fails with that message, naming the dashboard and the report (the section shows it with Retry). Give the
dashboard the side of its reports, or split it in two. A Front end only application keeps every report in the page, so
there any dashboard can read any report.

A dashboard in the browser of an FE + BE + DB application also reads the BackEnd's modules (`app`, `rest`): ctx.report,
ctx.rows and ctx.count go through the BackEnd's API (`Platform.remote`: the report run, the list query page by page at
the list's largest page size and with its declared filters, or a table module's tables whole). So an Overview can mix
SAP figures with the application's own or REST data. A dashboard in the BackEnd still reads only the BackEnd's modules.

**Drill parameters.** `drill` returns `{ kind: 'screen', module, filters, label }` to open another registered module
with `?f.<field>=<value>` and `from=<this page>`. The target checks every `f.*` like typed input (declared filter or
selection field, valid value; anything else is dropped with "Some drill filters were not applied."), shows "Opened from
…" with a Back link when `from` is a same-app path, and on the way back the report runs again and outlines the row
(`hl`). A breakdown stack lives in `?drill=` (browser Back closes one level). `u=<unit id>` carries the display unit:
a dashboard puts it into every click-through and into its `from`, a report into its own `from` links, so the target and
the way back show the same unit (Crores stays Crores). A report or dashboard takes `u` only when it is one of its own
`units` ids; any other value is dropped with the same notice and the page opens in its own unit. The definition test checks every drill
target against the registry; a drill to a table-maintenance module is refused (only object, items, report and
dashboard screens read `f.*`).

- With `f.*` (or `s.*`) in the URL the target uses exactly those values (the remembered selection is not applied) and
  runs by itself only when nothing was dropped and the selection passes its checks (required fields, the module's
  `check`); otherwise the bar is filled under the notice and the user presses Run / Show. This holds for reports,
  dashboards and items screens alike.
- Lookups must be loaded for `select` / `suggest` drill filters: with an empty list the option values cannot be
  checked and the filter is dropped.
- The donut chart uses ALM's `.ov-ch-pie` classes (slice separators, hover dimming, legend highlight); do not restyle it.

## Dashboard rows that open a record or page

A dashboard tile, bar, card, box, table row or `explore` link holds a target (`DrillTarget`):

```ts
{ kind: 'screen', module: 'deals', filters: { status: 'OPEN' }, label: 'Open deals' }          // a module list, filtered
{ kind: 'screen', module: 'deals', filters: {}, open: 'D-1001', label: 'Deal D-1001' }          // one record (?open=<key>)
{ kind: 'page', page: 'trends', params: { year: '2026' }, label: 'Trends' }                    // a custom page of the catalogue
```

- `open` is the record key of an object module; the screen opens with that record. `params` become the page's query.
- A summary table row can carry `open` (`TableData.rows[i].open`): the whole row is then clickable, and its label
  stays a button for keyboard use (one open per click). `TableData.explore`
  accepts either target kind and is rendered as a link under the table.
- Report `drill` functions may return page targets as well as screen targets.
- A target the catalogue cannot resolve (a module or page that is not registered) renders as plain text, never a dead link
  (tiles, bars, cards and rows); an unresolvable table `explore` link is hidden.
  Helpers in `FrontEnd/src/lib/drill/target.ts`: `targetHref`, `isLinkTarget`, `isClickable`; `hrefOfPage(pageId)` in
  `config/catalog.ts` gives a page's URL. `definitions.test.ts` checks every target of every definition.

## Report date ranges and windows

Two ways to limit a report by date, both turned into one `between` filter:

```ts
// 1. A date range selection field: the from date in `field`, the to date in `toField` (two selection fields).
selection: [{ field: 'postingFrom', label: 'Posting date', type: 'dateRange', toField: 'postingTo' }],

// 2. A rolling window: from a key date to the key date plus N days. `keyDate` and `days` name selection fields.
report: { /* ... */ window: { field: 'dueDate', keyDate: 'asOf', days: 'horizon' } },
```

The window filters only when both the key date and the days are filled (`field` is the entity date, `keyDate` a date
selection field, `days` an integer one); those two selection fields only feed the window and are not entity filters.
A single field used as from..to is not supported: a range always has a from field and a `toField`, and a `dateRange`
without `toField` silently applies no filter.

**Defaults, auto run and a source module** (all optional on a `report` definition):

```ts
defaults: lk => ({ asOf: today(), horizon: '60' }),   // today(): your own helper; merged under the saved or URL selection
autoRun: true,                                        // runs at once when the selection is valid
source: { module: 'deals' },                          // read that object module's header rows instead of an entity of its own
```

- `defaults` seed the selection form (`{ ...defaults(lk), ...saved }`; the URL selection wins). With `autoRun` the report
  runs at once when the merged selection passes its checks; "Use default selection" (in the empty "Choose a selection"
  panel) runs the report with `defaults`.
- `source` makes the report take its module's data source and side (sample, app data or SAP): no contract, seed or
  source of its own in the registry. `report.entity` must equal the source module's `list.entity` (the definitions test
  fails otherwise), and the lookups are read from the source module's data and mapped by the report's own `lookups`. On the wrong side the answer is 422, as for dashboards.

## Actions that ask for input

An object module action can ask for values before it runs:

```ts
actions: [{
  id: 'extend', label: 'Extend', sapAction: 'Extend', confirm: 'Extend the due date of this deal.',  // both required
  when: h => h.status === 'A',
  inputs: [{ field: 'days', label: 'Extra days', type: 'integer', required: true }],     // a form instead of a question
  apply: (header, values) => ({ dueDate: addDays(String(header.dueDate), Number(values.days)) }),  // app data (addDays: your own helper, not provided)
  mock: (header, values) => ({ ...header, dueDate: addDays(String(header.dueDate), Number(values.days)) }), // sample data
}],
```

- `confirm` becomes the description of the input form. `inputs` are ordinary fields, checked like any field. `apply` (the application's own data) and `mock` (sample data)
  receive the stored header and the entered `values`. SAP actions ignore the values and run their own action.
  Sample data also runs `apply` when the action has no `mock`.
- `apply` returns only changed stored header fields: anything else is a 500 definition error. The result is validated like
  an edit (422 when it leaves the record invalid) and saved with the client's ETag (409 when stale).
- Actions still need their own `when` to stay off records they must not touch (see the next section).

Two more optional parts, for rules on the inputs and for item rows:

```ts
check: (header, values) => (Number(values.days) > 90 ? { days: 'At most 90 days.' } : ({} as Record<string, string>)),   // field → message
applyItems: (header, items, values, user) => ({
  history: [...(items.history ?? []), { at: new Date().toISOString(), by: user, note: `Extended by ${values.days} days` }]
}),   // items tab id → every row the tab holds afterwards
```

- `check` returns field → message. The messages show only on fields in the action's `inputs` (the action needs `inputs`
  to show them), and the server runs it again (422 with the same messages).
- `applyItems` returns, per items tab, the full rows after the action. The rows are cleaned with the tab's grid fields
  and saved in the same write as the header change. It runs on its own or together with `apply`, and only where `apply` would run (app data, or
  sample data without a `mock`), never for SAP actions.

## Locking records and shown values

```ts
export const deals: ObjectModuleDef<Lookups> = {
  kind: 'object', /* ... */
  editableWhen: h => h.status !== 'R',          // false: Edit is hidden and an update is refused with 422
  deletableWhen: h => h.status === 'D',         // false: Delete is hidden and a delete is refused with 422
  // today(): your own helper, not provided
  header: { fields: [
    { field: 'status', label: 'Status', type: 'select', shown: (row, lk) => row.dueDate < today() ? 'Overdue' : lk.statuses[row.status] },
  ] },
};
```

- `initial()` and `lockedFields(header)`: see below.
- `editableWhen` / `deletableWhen` get the stored header. They do NOT gate actions: an action that must not run on a
  locked record needs its own `when`.
- `FieldDef.shown(row, lk)` sets the text a record shows for the field outside editing (for example a status that follows
  a date); editing still sets the stored value.

```ts
initial: () => ({ status: 'D' }),                                  // set by the server on create
lockedFields: h => (h.status === 'A' ? ['startDate', 'endDate'] : []),   // read-only in the edit form
```

- `initial()` fields are hidden on the create form and read-only on edit (the server refuses a change with 422); only
  actions change them. They are merged before validation, so a required hidden field passes, and `initial` wins over a
  value the client sends. The keys must be header or field-group fields: a key that is only in `list.fields`, or
  unknown, is dropped silently (unlike `apply`, where it is a 500 definition error).
- `lockedFields(header)` lists header fields that are read-only in the edit form (with a hint); a change is refused with
  422. Locking a range's `toField` locks the whole range control. Actions can still change locked fields.

## 2c. Build a custom page

Use a custom page when the user wants a layout or interaction beyond a standard module: a company tree, a dashboard,
a report with custom charts, a workflow, or a different landing page. Pages can have their own markup and scoped CSS;
reuse shared fields, tables, dialogs and data helpers where useful. Keep the login and the data client boundary.

1. Create `FrontEnd/src/pages/portfolio/PortfolioPage.tsx`. Export a component accepting `CustomPageProps` from
   `@/pages/registry`. It receives the current catalogue `node` and breadcrumb `trail`; router hooks provide query parameters.
2. Register it in `FrontEnd/src/pages/registry.ts`, optionally loading it lazily:

   ```ts
   import { lazy } from 'react';

   export const CUSTOM_PAGES: Record<string, ComponentType<CustomPageProps>> = {
     portfolio: lazy(() => import('./portfolio/PortfolioPage'))
   };
   ```

3. Add a catalogue entry in `FrontEnd/src/config/catalog.ts`:

   ```ts
   { id: 'portfolio', title: 'Portfolio', description: 'Your investment portfolio.',
     type: 'application', page: 'portfolio', heading: 'custom' }
   ```

   The folder still shows its tile; opening it renders the custom page within the signed-in workspace. The optional
   `heading: 'custom'` lets the page provide its own title and actions; omit it to keep the standard heading. `page`
   can also replace an overview, a folder or a settings screen and takes precedence over default content. A folder
   can retain children for navigation while its custom page decides how to display them. Catalogue search appears
   only on the default tile pages; a custom page controls its own search. The rail, breadcrumbs, deep links and
   browser Back continue to use the existing router.
4. Import page styles from the page component and scope selectors to its root class. Verify light and dark themes,
   narrow screens and keyboard interaction. Reusable controls may be added to the Gallery; a one-off page does not
   need a separate Gallery item or approval before the screen is built and shown.

A custom page does not require a dummy module, OData contract or seed. If it uses SAP data, register its services
and modules as needed and call the data client (`FrontEnd/src/lib/client/data.ts`); its checks and SAP's own
validations and authorizations still apply. The page never calls its own origin.

## 3. Register it

- `FrontEnd/src/modules/registry.ts`: `MODULES.<id> = definition`.
- `FrontEnd/src/modules/server-registry.ts`: `SERVER_MODULES.<id> = { def, contract, seed, source }` (`source` once
  the UI is approved: `'sap'` or `'app'`).
- `FrontEnd/src/config/catalog.ts`: add `{ id, title, description, type: 'application', icon, module: '<id>', service: '<key>' }`
  under a page or folder (use `section` to group tiles). A new left-rail page is a new entry in `pages`.
- A helper module that no catalogue entry opens (a report read only by a custom page or a dashboard) sets
  `internal: true` on its definition; every other registered module needs its catalogue entry.

**Icons.** Every page, folder and application sets `icon`, chosen by its business noun from the table below, and two
siblings (the rail pages, or the entries of one folder) never share one. `FrontEnd/tests/unit/catalog.test.ts`
checks both. The names are `IconName` in `catalog.ts`; `FrontEnd/src/components/ui/icons.ts` maps each to its lucide
icon. A noun with no fitting name is a template change first: add it to `IconName` and `ICONS` (an icon of
lucide-react 0.468.0 that no other name uses). Without `icon` a node falls back to its module's kind (report,
dashboard, upload…), then to its type (folder, application): fine for a lone entry, never for siblings.

| Business noun | `icon` | | Business noun | `icon` |
| --- | --- | --- | --- | --- |
| Overview, home | `overview` | | Loans, lending | `loans` |
| Dashboard, KPIs | `dashboard` | | Drawdowns, disbursements | `drawdowns` |
| Reports, statements | `reports` | | Collateral, pledges | `collateral` |
| Analytics, charts | `analytics` | | Treasury, investments, securities | `treasury` |
| Trends, forecasts | `trends` | | TRM deals, transactions | `deals` |
| Master data, tables | `database` | | Cash flows | `cashflow` |
| Settings | `settings` | | Collections, receipts | `collections` |
| SAP connection | `connection` | | Payments | `payments` |
| Service mappings | `services` | | Fees, charges | `fees` |
| Appearance | `appearance` | | Interest, rates | `interest` |
| Integrations, interfaces | `integrations` | | Accounting, GL | `accounting` |
| Workflow, process | `workflow` | | Journal entries, postings | `journal` |
| Notifications, alerts | `notifications` | | Documents, files | `documents` |
| Customers, borrowers | `customers` | | Entries, grids, monthly amounts | `entries` |
| Onboarding, new customers | `onboarding` | | Uploads, imports | `upload` |
| KYC, verification, compliance | `kyc` | | Facilities, limits lines | `facilities` |
| Approvals, sanctions | `approvals` | | Counterparties, partners | `counterparties` |
| Verified, checked items | `verified` | | Limits, risk, exposure | `limits` |
| A folder of mixed content | `folder` | | Schedules, buckets, ageing | `schedule` |
| An application of no listed noun | `application` | | Developer samples | `samples` |

**TRM transaction links.** A TRM transaction number shows as a link that opens SAP's FTR_DISPLAY pop-up (the SAP
Reporting transaction display: header, tab strip by product category, group boxes, cash flows, status), wherever a
list, report, object header or display field shows it (`components/ui/StatusValue.tsx`). Two ways, no screen code:

- By name: a column or field `FinancialTransaction`, `transactionNo` or `dealNumber` in a row that also has
  `companyCode` or `CompanyCode`.
- Declared: `transaction: { companyField: '<the row's company code field>' }` on the column (`Column`, `ReportColumn`)
  or field (`FieldDef`), with `kind: 'class'` for a security class (its pop-up lists the class's transactions).

The link shows only for a valid company code and number, keeps a row's own click (the link does not open the row),
and exports keep the plain number. `TransactionLookupButton` (`components/trm/TransactionProvider.tsx`) opens the
lookup by company code and number. The pop-up reads the transaction from its **source**, listed in
`FrontEnd/src/config/transactions.ts`: the template ships the NIIF Transaction set of `ZFS_SB_TRMPOSVAL26E_O4_API`
(services.json `trm-transactions`, product types 26A–26M, 28B and 35B). Another service, such as an application's
loans, is a source of its own, in front of NIIF: `matches(target)` says whether it may have the number (no read),
`read(target)` returns the transaction as the NIIF record (`lib/trm/types.ts` `TrmDeal`: SAP's property names and
`_Flow`; `FinancialInstrProductCategory: '550'` gives the Interest Rate Instrument screen), or `null` when it does not
have it, so the next source is asked. For example, loans from a drawdown service and their dues from an allocation
service (check the property names against each service's `$metadata`):

```ts
// FrontEnd/src/lib/trm/loans.ts
import { newSapConnection, readAll } from '@core/sap/client';
import { sapServiceOf } from '@core/sap/config';
import { odataString } from '@core/odata-string';
import { buildConfig, sapConnection, sapSettings } from '@/lib/client/sap-account';
import type { TransactionSource } from '@/lib/trm/sources';
import type { TrmValue } from '@/lib/trm/types';

const rows = (service: string, set: string, filter: string) =>
  readAll(sapSettings(), sapConnection() ?? newSapConnection('', ''), sapServiceOf(buildConfig(), service), set, { filter }) as Promise<Record<string, TrmValue>[]>;

export const loanTransactions: TransactionSource = {
  id: 'las-loans',
  matches: target => target.kind === 'deal',
  async read({ bukrs, deal }) {
    const key = `eq ${odataString(bukrs)}`;
    const [drawdown] = await rows('las-drawdown', 'LasDrawdown', `CompanyCode ${key} and TransactionNo eq ${odataString(deal)}`);
    if (!drawdown) return null;   // not a loan of this application: the NIIF source is asked next
    const dues = await rows('las-allocation', 'AllocationItem', `Zbukrs ${key} and ZdisburseRfha eq ${odataString(deal)}`);
    return {
      CompanyCode: bukrs, FinancialTransaction: deal, FinancialInstrProductCategory: '550', FinancialInstrumentProductType: drawdown.ProductType,
      ProductTypeName: 'Loan against shares', Counterparty: drawdown.BusinessPartner, TermStartDate: drawdown.StartDate, ActiveActivity: '',
      _Flow: dues.map((d, i) => ({
        FinTransFlowNumber: String(i + 1), FinTransFlowPaymentDate: d.ZdueDate, FinTransFlowType: d.Zflow, FinTransFlowTypeName: d.ZflowDesc,
        FinTransFlowPaytAmt: d.Zamt, FinTransFlowPaytAmtDirection: '+', FinTransFlowPaytAmtCrcy: d.Zcurr, FinTransFlowPostingStatusName: d.ZaFull ? 'Allocated' : 'Open'
      }))
    };
  }
};
```

and in `FrontEnd/src/config/transactions.ts`: `TRANSACTION_SOURCES = [loanTransactions, niifTransactions]`. A source's
own reads go through the relay like every SAP read; its tests stub `fetch` as `tests/unit/trm-sources.test.ts` does.

## Build the Overview

The catalogue's first page can point to a dashboard module: `{ type: 'overview', module: 'my-overview', ... }`.
The Overview is designed for each application from its own modules, planned with the person after the screens are
built; the parts are the dashboard section kinds listed below. `FrontEnd/src/modules/samples/portfolio/` shows every
part on sample data: it is a pattern, never an application's Overview. Label figures as sample data until your own
loaders read the application's modules. Set `autoRun: true`, provide valid `defaults` (key date and scope), and
optionally set `defaultUnit: 'CRORES'`. The first date and segmented selection fields become the key-date and
company-code controls when the definition has `overview: { description, fullReport, scopeLine }`.

Each section has an id and a matching loader in `DashboardServer.sections`. In addition to tiles, series charts,
donuts and tables, use `entities` for company cards, `flow` for connected lifecycle steps, `barList` for ranked
amounts, and `share` for a classification breakdown. A donut's `measures` switch reads each slice's `values` by
measure id. Summary columns declare `format: 'count' | 'percent' | 'text'` where appropriate; amount columns alone
scale with the unit. Add a `total` row, `footnote` and `explore` target to complete a summary.

Read the application's registered tables with `ctx.rows(moduleId, table, filters, max)` or
`ctx.count(moduleId, table, filters)`, and reports with `ctx.report(moduleId, selection)`. These reads share the
existing module backend and SAP relay. Follow the same-side rules above. Supply drill targets only for screens
that show those records. See `B-overview` in the Gallery and `docs/report-template.md` for the shared design.

## 4. Test it

- Copy `FrontEnd/tests/unit/time-buckets.test.ts` for the definition's rules.
- The status a test expects: a value the rules refuse (`check()`, a required field, a refused delete or action) is
  **422** with the field messages in `details`; **400** is only for a malformed request (bad JSON, a missing key or
  ETag); **409** a stale ETag (someone else saved first); **404** a key that does not exist; **403** a write without
  the `x-app-request` header or from an origin not listed.
- Add the entity sets to a mock in `FrontEnd/tests/support/mock-sap.ts` (SAP as the browser sees it through the relay)
  and copy the OData cases of `FrontEnd/tests/unit/module-service.test.ts`. An `app` module: copy the cases of
  `BackEnd/tests/integration/module-service.test.ts`.
- Extend `FrontEnd/tests/e2e/workspace.spec.ts` with the new screen.
- Run `npm run verify` and `npm run e2e`.

## Screens that are not one of the kinds

First check whether a kind fits: table maintenance, object, items, upload, report or dashboard. A custom screen gets
its own component in the module folder, rendered from `ModuleView` (`FrontEnd/src/components/shell/ModuleView.tsx`), and
reuses the building blocks: `ReportGrid`, `AlvGrid` with `FrontEnd/src/lib/layout`, `LayoutControls` / `LayoutPicker` /
`ChangeLayoutDialog` / `SaveLayoutDialog`, `BreakdownDialog`, `DrillFromBar`, `KpiTile`, `BarChart`, `LineChart`,
`DonutChart`, `SummaryTable`, `exportReport()` and `parseDrillParams()`, with ALM's class names, `Modal`, `Toast` and
`Notice`. It reads and writes through the data client (`FrontEnd/src/lib/client/data.ts`): SAP through the relay for
`sap` modules, the BackEnd (or browser storage) for `app` modules. It never calls its own origin.
