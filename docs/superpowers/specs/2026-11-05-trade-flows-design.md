# Master Data and Trade Flows: design

Date: 2026-11-05 · Application: TSF_FX (`D:\Application B\TSF_FX`, Tile theme, FE + BE + DB) · SAP: DS4 client 100

## Intent

TSF_FX gets two new rail pages after **Overview**: **Master Data** and **Trade Flows**. Users maintain commodities
and their prices, upload shipments from an Excel file as trade flows (one trade flow and one bill of lading per row,
numbered by SAP), and see the trade flows priced and valued. All four record types live in new SAP tables behind
CRUD OData V4 APIs, created in package **ZFS_SLC_APP** on transport **DS4K907209**.

This widens the app's scope. `APPLICATION.md` currently says trade flows are out of scope, so its Purpose gets
updated.

## Goals

1. Rail order: Overview → **Master Data** → **Trade Flows** → (existing pages).
2. **Master Data** has one tile: **Maintain Commodity**.
3. **Trade Flows** has four tiles: **Tradeflows Upload**, **Tradeflows List**, **Update Price**, **Manage Tradeflows**.
4. SAP tables and CRUD OData V4 APIs for commodity, commodity price, trade flow and BL.

## Non-goals

- **Manage Tradeflows logic.** The user will define it later. For now the tile opens the existing `planned` page.
- Storing price or value on trade flows. Both are calculated when the list loads, from the price table.
- More than one BL per trade flow.
- Changing Overview or any existing FX screen.

## Decided by the user

- **One Excel row = one trade flow + one BL.**
- **Trade flow key: TF No + TF Date.** TF No comes from SNRO object **ZSGTSFNR02**. TF Date is the upload date.
- **BL record: all of the row's fields again, plus BL No.** The key is **BL No + BL date**. BL No comes from SNRO
  object **ZSGTSFNR05**, and the BL date is also the upload date.
- **The Excel "BL Number" column** (the shipping line's number, e.g. NAM6036645) is kept as a separate field on
  both records. It is not the generated BL No.
- **Update Price** takes a commodity (dropdown from the commodity master), an effective-from date and a price, and
  stores them in the price table. Nothing else changes.
- **Tradeflows List** adds two columns:
  - **Price:** the latest price of the trade flow's commodity whose effective-from date is on or before the TF date.
  - **Value:** Price × Quantity.
- **Commodity fields:** code (key, e.g. ALMOND), description, unit (LBS / KG / MTS), currency.
- **Upload validation:** a row whose commodity is not in the commodity master is rejected.

## Upload file format (`Downloads\TF.xlsx`, Sheet1)

These are the template's columns, in this order: `#`, BL Notify Party, BL Number, BL Date, ETD, ETA, Contract Ref,
Contract Date, Invoice Ref, Invoice date, Main Commodity, Goods Details (Description), Quantity, Kg / LBs / Mts.

- `#` is only a row counter and is not stored.
- Contract Ref and Invoice Ref are long numbers (e.g. 1490004320). They are stored as text so no digits are lost.
- Contract Date may be empty.
- The downloadable template uses exactly these headings, so the user's existing file uploads unchanged.

## Screens

The look and controls follow the template (`docs/report-template.md`, ALM classes, shared components). The record
openings below are set per module and written into `records/tsf-fx-spec.md`.

| Tile | What it is | Opens |
|---|---|---|
| Maintain Commodity | Object list of commodities with create, edit and delete. | `popup`: four fields, no tabs, no items. |
| Tradeflows Upload | The template's upload workbench (`UploadWorkbench`). You download the template, upload a file, preview it with each row's status and problems, and post the valid rows. The result lists the TF No and BL No that SAP assigned to each posted row. | upload flow, as is |
| Tradeflows List | A read-only report. Selections: TF date range, commodity, TF No. Columns: TF No, TF Date, BL No, every Excel field, then Price and Value. Value is shown in the commodity's currency. Layouts and export as in the template. | breakdown `popup`: one trade flow with its BL record. |
| Update Price | A form with Commodity (dropdown), Effective from (date) and Price (amount, labelled with the commodity's currency and unit, e.g. "USD per LBS"). Below it, that commodity's price history. Saving a date that already exists for that commodity changes that price. | `popup` for editing a history row |
| Manage Tradeflows | Placeholder: the existing `planned` page. | — |

### Upload rules

A row is **rejected** when any of the following is true:
- Its commodity is not maintained.
- A required field is missing. Everything except Contract Date is required.
- A date doesn't parse.
- Quantity is not greater than 0.
- Its unit is not LBS, KG or MTS.
- **Its shipping BL Number is a duplicate** (decided by the user): it already exists in SAP, or it appears twice in
  the file. SAP enforces the same check at save.

**Volume:** about hundreds of rows per upload, so thousands of trade flows a year. Tradeflows List therefore reads
by TF date range on the server (default: the current month) rather than loading everything.

## SAP side

**Sequence:**
1. The screens are built on sample data and shown for UI approval (screenshots and the local URL).
2. The SAP objects are created only after that approval.
3. Any live data write, which includes drawing real numbers from ZSGTSFNR02 and ZSGTSFNR05, needs the user's
   explicit yes first. That yes is recorded in `APPLICATION.md` Approvals.

**Tables.** Each table has the client and admin fields (created/changed by and at, plus a local last-changed
timestamp for the ETag).

| Table | Key | Other fields |
|---|---|---|
| Commodity | commodity code | description, unit, currency |
| Commodity price | commodity, effective-from date | price, currency |
| Trade flow | TF No, TF Date | every Excel field (shipping BL Number, BL Date, ETD, ETA, Contract Ref/Date, Invoice Ref/Date, commodity, goods description, quantity, unit) |
| BL | BL No, BL date | the same Excel fields, plus TF No and TF Date pointing to its trade flow |

**APIs:** OData V4 Web API bindings (`ZFS_SB_<Entity>_O4_API`, `srvd_a2x`, `sap-client=100`), full CRUD. They
follow `docs/naming-conventions.md`: each name is checked before it is created and listed in the worklog Object list.

**Numbering:** SAP assigns the numbers when the record is saved: TF No from ZSGTSFNR02 and BL No from ZSGTSFNR05.
The TF Date and BL date are the save date.

**Upload write:** one `$batch` with one changeset, creating every valid row's trade flow together with its BL.

## Builder's calls (not discussed with the user)

These are mine. The user can overturn any of them on reading.

1. **All or nothing on save:** if SAP refuses any row of the changeset, nothing is saved. The refused row and
   SAP's message are shown, and the user fixes the file and uploads again. The browser checks catch nearly
   everything first. *(The user wasn't asked directly.)*
2. **Unit mismatch:** a row whose unit differs from its commodity's unit is rejected, because Price × Quantity only
   means something in the same unit.
3. **Commodity delete** is blocked while any trade flow or price refers to the commodity.
4. **Price and Value** are calculated in the browser from the price table.
5. **Rows without a price:** a trade flow with no price on or before its TF date shows an empty Price and Value,
   and an amber "No price" tag.
6. **One business object:** trade flow and BL are one RAP business object, with BL as a composition child. That way
   the TF and its BL are created in one transaction.
7. **Rail icons:** `database` for Master Data and `workflow` for Trade Flows. Tile icons are picked by the business
   noun, and siblings never share one.
8. **Field lengths** are set by the builder from the sample: e.g. quantity with 3 decimals and price with 4 decimals.
9. **Dates and numbers come from SAP:**
   - TF Date and BL date are SAP's system date at save, never the browser's, and they can't be back-dated.
   - TF No and BL No are drawn in RAP early numbering. Gaps after a failed save are acceptable, as SNRO buffering
     already allows them.
10. **The price's currency is copied from the commodity**, so it is not entered separately. A commodity's unit and
    currency are locked once any price or trade flow refers to it.
11. **Trade flows and BLs get full CRUD**, as asked, with an ETag on each. No screen edits or deletes them until
    Manage Tradeflows is defined.
12. **No authorisation checks** in the APIs (demo), and one BL per trade flow.
13. **The sample file is consistent:** `TF.xlsx` has 10 rows, all ALMOND in LBS, with no duplicate BL Numbers. So
    call 2 rejects nothing in it.

## Adjustments found while planning (to fit the template's module kinds)

- **Tradeflows List is an object-module list, not a report.**
  - It keeps the TF date, commodity and TF No filters, search, ALV layouts and export.
  - SAP filters and pages it on the server, sorted newest TF first.
  - Opening a row shows a read-only pop-up with the trade flow and a BL tab.
  - Report rows have no hook for calculated columns, but object lists read fields straight from the entity.
- **Price and Value are calculated in SAP**, in a CDS helper view joined to the trade flow, not in the browser
  (this reverses call 4). It is the same rule: latest price on or before the TF date. While the screens run on
  sample data, the sample rows are priced by the same rule in TypeScript.
- **Update Price is a table-maintenance screen.**
  - Add opens a pop-up with Commodity (dropdown), Effective from and Price.
  - The table below is the price history, filterable by commodity.
  - A commodity + date that already exists is refused on Add with "already exists"; the user opens that row and
    changes its price.
- **The upload result** shows how many trade flows were created, with a link to Tradeflows List. The assigned TF No
  and BL No are visible there.
- **One OData service, `ZFS_SB_TRADEFLOW_O4_API`, exposes all four entity sets**, so the upload can read the
  commodity master as its value list from the same service.
- **SAP creates the BL record itself**, by a determination when a trade flow is created. The browser posts only
  trade flows.

## Left to the builder

- RAP object names, within the naming rules.
- The number-range interval: confirm it in SNRO.
- Data elements and domains.
- Exact field lengths.
- Sample data for the UI round.
- Test cases.
