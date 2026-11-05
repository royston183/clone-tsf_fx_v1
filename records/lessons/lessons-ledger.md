# Lessons ledger

Append-only. Every instruction the human asks to be noted, every correction to how work is done, and every
non-obvious SAP or framework behaviour becomes an entry here, in the same turn. Never renumber or delete: supersede
an entry with a new one and add `Superseded by L-nnn` to the old one. A lesson that applies to the template is also
written into the template's `CLAUDE.md` or `docs/` in the same turn.

## Entry format

```markdown
### L-nnn · <one-line title>

- **Date:** YYYY-MM-DD
- **Source:** human instruction | build finding | review finding
- **Raised during:** `records/worklog/<YYYY-MM>/<stem>.md`
- **Instruction (verbatim):** "..."   (human instructions only)
- **Lesson:** what to do differently, stated as a rule
- **Applies to:** this application | template
```

## Entries

Numbering starts at L-001.

### L-001 · Resume from recorded work and preserve the reference boundaries

- **Date:** 2026-11-05
- **Source:** human instruction
- **Raised during:** `records/worklog/2026-11/2026-11-05-continue-reference-port.md`
- **Instruction (verbatim):** "wherever claude stops due to limit continue from there"
- **Lesson:** Recover the last session's actual stopping point and saved changes before
  continuing. For this reference port, keep SAP calls in the browser relay and route the
  middleware through the application's backend; record missing reference screens explicitly.
- **Applies to:** this application

### L-002 · Use the current installed Node 22 LTS runtime for SQLite verification

- **Date:** 2026-11-05
- **Source:** build finding
- **Raised during:** `records/worklog/2026-11/2026-11-05-continue-reference-port.md`
- **Lesson:** The backend's rollback guard uses `DatabaseSync.isTransaction`, which is absent
  in Node 22.13. Verification passed on Node 22.23.4; the older runtime produced 11 transaction
  failures. Use the current Node 22 runtime rather than weakening the rollback tests.
- **Applies to:** this application; template runtime compatibility candidate

### L-003 · Review screenshots as well as browser assertions

- **Date:** 2026-11-05
- **Source:** human instruction
- **Raised during:** `records/worklog/2026-11/2026-11-05-continue-reference-port.md`
- **Instruction (verbatim):** "after the complete ensure u peformed whole end to end testing in playscirpt ensure no alignment issue, no page issue and make it look better after testing from ur side through palscript"
- **Lesson:** Run the complete Playwright suite and capture every route in both themes
  at desktop and phone widths. Review the captures for wrapping and overlap; measurements
  alone missed an absolutely positioned NDF action row. Fix findings and rerun regressions.
- **Applies to:** this application

### L-004 · Preserve binary files during reference imports

- **Date:** 2026-11-05
- **Source:** review finding
- **Raised during:** `records/worklog/2026-11/2026-11-05-continue-reference-port.md`
- **Lesson:** Copy image bytes directly; restrict UTF-8 rewriting to known text formats.
  Browser smoke checks should verify decoded image dimensions, because a successful
  asset response does not prove that its contents can be displayed.
- **Applies to:** this application

### L-005 · Amount formatting must preserve list pagination

- **Date:** 2026-11-05
- **Source:** build finding
- **Raised during:** `records/worklog/2026-11/2026-11-05-continue-reference-port.md`
- **Lesson:** Compare the effective normalized filters before resetting a list to page 1.
  Expanding an amount on blur can finish after the user sorts or clicks Next; equivalent
  values such as `8000000`, `8000000.00` and `8M` must not reset that navigation.
- **Applies to:** this application

### L-006 · Shared table requirements include reference screens and dialogs

- **Date:** 2026-11-05
- **Source:** human instruction
- **Raised during:** `records/worklog/2026-11/2026-11-05-universal-tables.md`
- **Instruction (verbatim):** "every table columns should have sorting option and have layout option"; "all the tables ensure the columns are optimised based on the data automatically . in the tables every row data show it in a single row dont show the data 1 below the the other"; "ensure export excel button also there in all the tables"
- **Lesson:** Route data tables through the shared control, including imported and modal
  tables. Supply sortable data headers, layouts, content-based widths, single-line rows
  and Excel for the current view. Preserve React row/cell ownership when applying layouts.
- **Applies to:** this application; reusable table controls recorded as a template candidate

### L-007 · Reuse the application's established layouts and exports

- **Date:** 2026-11-05
- **Source:** human instruction
- **Raised during:** `records/worklog/2026-11/2026-11-05-ui-refinement.md`
- **Instruction (verbatim):** "remove the table layout everywhere and replace it with as per the same like Create Master Contract layout"; "if already export excel is there then remove the nex export excel button it"; "some modals still the alignment issue is still there like in Auto-create Deals modal amount 1 is not showing in the same row of other fields"
- **Lesson:** Reuse shared ALV controls instead of a second layout interaction. Declare
  an existing export so the universal table does not duplicate it. Check actual input
  coordinates in modal rows: helper text and grid sibling margins can misalign controls
  even when the page has no horizontal overflow. Profile data reads and repeat navigation
  separately before claiming Overview performance improvements.
- **Applies to:** this application; template candidates remain application-local

### L-008 · Keep catalogue cards and page headings free of repeated branding

- **Date:** 2026-11-05
- **Source:** human instruction
- **Raised during:** `records/worklog/2026-11/2026-11-05-ui-refinement.md`
- **Instruction (verbatim):** "rmove zname from the tiles"; "in any screen which you are showing the logo inside the page remove it ssame like Create Master Contract"
- **Lesson:** Keep technical transaction codes in the catalogue configuration rather than
  on tile faces. Use page titles and actions without repeating the workspace's logo in
  imported headers; remove decorative SVG/CSS marks as well as logo images.
- **Applies to:** this application

### L-009 · OData V4 amounts with a currency must have 2 decimals; publish V4 groups in /IWFND/V4_ADMIN

- **Date:** 2026-11-05
- **Source:** live failure
- **Raised during:** `records/worklog/2026-11/2026-11-05-1204-trade-flows.md`
- **What happened:** $metadata failed with SADL_GW_EXPOSURE/083 "Property PRICE with currency decimals not equal to
  two is not supported" for a CURR 15,4 price. Separately, ADT could not publish the binding: "(Un-)Publishing of SRVB
  … in Customizing Client not allowed".
- **Lesson:** Keep a unit price with more than 2 decimals as a plain DEC, with the currency as a separate field and no
  `@Semantics.amount.currencyCode`. Publish a new V4 binding in client 100 through /IWFND/V4_ADMIN → Publish Service
  Groups (system alias LOCAL).
- **Also:** check which system an ADT MCP server points at before creating objects. The relay's `config.json`
  `sapBaseUrl` is the app's real system (here NIIF, vhnlqds4ap01), not the system label in `.env.local`.
- **Applies to:** every application on this template (template candidate)
