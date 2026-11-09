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

### L-010 · A tolerance-only matcher returns nothing on real data; always offer the closest and say why

- **Date:** 2026-11-06
- **Source:** live failure
- **Raised during:** `records/worklog/2026-11/2026-11-06-1508-propose-closest.md`
- **What happened:** Propose Tradeflows showed "No combination … within 1%" for every live deal: the only C112 BLs
  were larger than the 100,000 USD deal, and the C110 deals had no BLs of their commodity at all. The sample data had
  been built so that exact matches existed, so the gap never showed before the live check.
- **Lesson:** A matching screen needs a fallback (closest under / closest over, with a capped last item) and a
  reason when there is nothing to propose (no candidates vs. preferences excluding them). Test with live-shaped data
  where nothing fits, not only with sample data that fits.
- **Applies to:** this application (template candidate for any matching or proposal screen)

### L-011 · "Fewest items" must only rank complete answers; partial fills rank by how full they are

- **Date:** 2026-11-06
- **Source:** live probe
- **Raised during:** `records/worklog/2026-11/2026-11-06-1508-propose-closest.md`
- **What happened:** With "Fewest BLs, bigger first", deal 7000000080 (more than all free C110 BLs together) ranked a
  64-BL partial fill above the 65-BL one, because the fewest-count key also applied to proposals that do not complete
  the amount.
- **Lesson:** Order in two tiers: proposals that complete the amount (fewest items first), then partial ones (fullest
  first). Probe orderings on live-shaped data where nothing completes, not only where something does.
- **Applies to:** this application (template candidate for matching / proposal screens)

### L-012 · A report that lists only transactions with a Deal ID hides the legs waiting for one

- **Date:** 2026-11-07
- **Source:** live run
- **Raised during:** `records/worklog/2026-11/2026-11-07-0930-fx-chain-propose-ai-look.md`
- **What happened:** Legs created by DE6 Auto-create Deals (TrmFxApp 01, no Deal ID yet) never showed on the blotter: the
  TsfDeal report (ZFS_CE_TsfDeal) returns only transactions that carry a TSF Deal ID, so they could not be released.
- **Lesson:** Check what a read-only report leaves out before building a screen's list on it; read the application
  data (TrmFxApp for the blotter date) and complete it from the source entity for what the report omits.
- **Applies to:** this application (template candidate: verify report coverage in the live check)

### L-013 · Transaction numbers are per company code; never order legs of two companies by number

- **Date:** 2026-11-07
- **Source:** live run
- **Raised during:** `records/worklog/2026-11/2026-11-07-0930-fx-chain-propose-ai-look.md`
- **What happened:** Deal 1 (IN11 3000000000061) sorted after Deal 2 (SG03 2000000000087) because each company code has
  its own number range; the pair would have been released the wrong way round.
- **Lesson:** Order D1/D2 by the business rule (the FX model's Deal 1 entity), then value date; let the person swap.
- **Applies to:** every application that pairs SAP financial transactions (template candidate)

### L-014 · Prove the SAP account on a service the system has published

- **Date:** 2026-11-07
- **Source:** live failure
- **Raised during:** `records/worklog/2026-11/2026-11-07-0930-fx-chain-propose-ai-look.md`
- **What happened:** The top bar showed "SAP not tested" (and a test would fail) because the connection check used the
  first configured service, Time Buckets, which is not published on this system (404), while the app's own services work.
- **Lesson:** Skip services that answer 404 (not published) and prove the account on the first that answers; stop at
  once on 401 so a wrong password is never sent twice. Run the check once after sign-in.
- **Applies to:** every application on this template (template candidate: `checkAnyService`)

## L-015 Bulk test data: check the values in SAP after creating them (2026-11-07)
- **What happened:** The bulk script drew the x1000 multiplier and the /1000 divisor for decimal quantities
  independently, so 515 of 3,500 BLs were stored 1,000 times too large (e.g. 12,317,997 LBS) and 471 1,000 times too small (e.g. 57.430 LBS). The matcher then built
  proposals from them.
- **Lesson:** After creating test data, read it back and check ranges (quantity, value per commodity) before testing on
  it; correct with PATCH on the composite key (`BillOfLading(BlNo='…',BlRecordDate=…)`, then the trade flow; when raising a quantity, the trade flow first, since SAP checks the BLs against it).
- **Applies to:** every bulk test-data load on this application

## L-016 Test deals must look like real ones: one deal takes 200-300 BLs (2026-11-07)
- **What happened:** The test deals were 1,000-4,00,000 USD, so one BL could equal a deal and proposals had 1-3 BLs.
  The user: a deal takes 200-300 BLs; that is why the app proposes them.
- **Lesson:** Size test deals from the BL pool (200-300 x the commodity's average BL value) and the proposal limits to
  match (MAX_BLS 500; the AI request carries BL details only up to 1,000 rows).
- **Applies to:** Propose Tradeflow test data and limits

## L-017 Python edit scripts and regex escapes (2026-11-07)
- **What happened:** Python strings turned `\b` into a backspace byte and `\d` warnings into wrong regexes (twice: in an
  e2e locator and a query edit); a removed-verb cleanup also cut "No" out of "Northwind".
- **Lesson:** Edit regex-heavy TypeScript with the Edit tool, not Python heredocs; after any scripted edit grep for
  `\b`. Optional suffixes after a removed word need a word boundary (`(?!\w)`).
- **Applies to:** every scripted edit in this application

## L-018 Two screens, one figure (2026-11-07)
- **What happened:** the Invoice Finalisation Blotter read the BLs through its own module-level cache. It showed the
  BLs of its first visit (it missed assignments made in Propose since), and it had no deal figures.
- **Lesson:** a screen that shows what another screen computes reads it through that screen's own source and
  calculation (here `liveProposeData` + `dealRows`), fresh on each visit and on Refresh. No module-level cache of rows
  that another screen writes.
- **Applies to:** every screen showing Propose / BL assignment figures

## L-019 Probe the bar with what people type; no native datalist (2026-11-08)
- **What happened:** the bar used "quantity" to read "BL quantity more than 200", then reported "quantity" as not
  understood. "exclude BLs under 30K" was refused. The invoice screen's datalist popup drew the Deal ID over its
  description.
- **Lesson:** test a free-text reader with a list of everyday phrases (not only the ones it was built for). Words that
  name a subject or a unit are spent with the condition, and exclude inverts a comparison. Use our own combobox, not
  `<datalist>`: browsers draw its options however they like.
- **Applies to:** the Propose bar, every Deal ID / value-help input
