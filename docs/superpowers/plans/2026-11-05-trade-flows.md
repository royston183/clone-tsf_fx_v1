# Master Data and Trade Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Master Data and Trade Flows rail pages to TSF_FX:
- Master Data: one tile, Maintain Commodity.
- Trade Flows: four tiles, Tradeflows Upload, Tradeflows List, Update Price and Manage Tradeflows (placeholder).
- All of it backed by new SAP tables and one CRUD OData V4 service in ZFS_SLC_APP / DS4K907209.

**Architecture:**
- Four standard modules on the template's engine:
  - `commodity` (table)
  - `commodity-price` (table)
  - `tradeflow` (object, read-only list + pop-up with a BL tab)
  - `tradeflow-upload` (upload)
- Part A builds them on sample data and stops for UI approval.
- Part B creates the RAP objects (four tables, three BOs, one service), gives the modules `source: 'sap'`, and checks
  them live.

**Tech Stack:** Vite + React 19 + TypeScript, Vitest, Playwright, SAP RAP (managed, OData V4 Web API) via the ADT MCP tools.

**Spec:** `docs/superpowers/specs/2026-11-05-trade-flows-design.md` (read its "Adjustments found while planning" section).

## Global Constraints

- **Work location:** work in `D:\Application B\TSF_FX` only, never in the template.
- **Commands:** run them from `D:\Application B\TSF_FX`. Unit tests: `npm --prefix FrontEnd exec vitest run <file>`.
  The full gate is `npm run verify`.
- **Commits:** the repository has no commits yet, so committing is the user's call. Instead of committing, each task
  ends with its tests green.
- **UI approval gate:** Part B starts only after the user approves the Part A screens. Record the verbatim answer in
  `APPLICATION.md` Approvals.
- **SAP writes:** any live SAP data write (including drawing numbers from ZSGTSFNR02 / ZSGTSFNR05) needs a separate
  explicit yes from the user.
- **SAP objects:**
  - Package `ZFS_SLC_APP`, transport `DS4K907209`, never `$TMP`.
  - Each name is checked against `docs/naming-conventions.md` just before it is created, with a `NAMING:` line in the
    worklog Object list.
- **OData:** `sap-client=100` on every call, `srvd_a2x` service URLs, binding `ZFS_SB_TRADEFLOW_O4_API`, decimals as
  JSON numbers, ETag from `@odata.etag`.
- **Record openings:** every object and table module sets `opens`. Each choice and a one-line reason go in
  `records/tsf-fx-spec.md`.
- **Lint:** React Compiler lint rules are errors. Navigation only through `FrontEnd/src/lib/client/nav.tsx`.
- **Upload headings, exactly** (the `#` column is ignored): BL Notify Party, BL Number, BL Date, ETD, ETA, Contract
  Ref, Contract Date, Invoice Ref, Invoice date, Main Commodity, Goods Details (Description), Quantity,
  Kg / LBs / Mts.
- **Units:** `LBS`, `KG`, `MTS`.
- **Price rule:** the latest `CommodityPrice` with `effectiveFrom <= tfDate` for the trade flow's commodity. Value =
  price × quantity, rounded to 2 decimals.

## Review Focus

1. **Excel cells:** date cells (Excel datetimes) and long reference numbers (`1490004320`, `9230140002`) must arrive
   as ISO dates and as the exact digits. There must be no `1.49E+09` and no lost digits. *Test in Task 5.*
2. **Empty Contract Date** is accepted. Every other column is required. *Test in Task 5.*
3. **Commodity case:** `almond` in the file matches the maintained `ALMOND`. *Test in Task 5.*
4. **Effective-date boundaries:**
   - A price effective exactly on the TF date applies.
   - A price effective the day after doesn't.
   - A commodity with no price gives an empty Price and Value and an amber "No price" tag.

   *Test in Task 4.*
5. **Decimal quantity:** a quantity like `264554.93` keeps its decimals, and the value is exact to 2 decimals
   (264554.93 × 2.15 = 568793.10). *Test in Task 4.*

---

## Part A: screens on sample data (stop for approval at the end)

### Task 1: Catalogue pages and the Manage Tradeflows placeholder

**Files:**
- Modify: `FrontEnd/src/config/catalog.ts`. Insert two pages right after the `overview` entry, at line 44.
- Test: `FrontEnd/tests/unit/trade-flows-catalog.test.ts`

**Interfaces:**
- Produces these catalogue ids:
  - `master-data` page (icon `database`), with child `maintain-commodity` (module `commodity`, icon `database`).
  - `trade-flows` page (icon `workflow`), with these children:
    - `tradeflows-upload` (module `tradeflow-upload`, icon `upload`)
    - `tradeflows-list` (module `tradeflow`, icon `reports`)
    - `update-price` (module `commodity-price`, icon `interest`)
    - `manage-tradeflows` (page `planned`, icon `workflow`)
- Both pages: `type: 'folder'`, `code: 'TSF FX'`. Short labels `Master Data` and `Trade Flows`.
- Until Tasks 2–5 register the modules, keep the module tiles commented out, or do Task 1 last within Part A. The
  catalogue test requires every module to be registered.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { applicationPages } from '@/config/catalog';

describe('Master Data and Trade Flows pages', () => {
  it('follow Overview on the rail', () => {
    expect(applicationPages.slice(0, 3).map(p => p.id)).toEqual(['overview', 'master-data', 'trade-flows']);
  });
  it('have the requested tiles in order', () => {
    const kids = (id: string) => applicationPages.find(p => p.id === id)?.children?.map(c => c.title);
    expect(kids('master-data')).toEqual(['Maintain Commodity']);
    expect(kids('trade-flows')).toEqual(['Tradeflows Upload', 'Tradeflows List', 'Update Price', 'Manage Tradeflows']);
  });
  it('keeps Manage Tradeflows as a placeholder', () => {
    const tf = applicationPages.find(p => p.id === 'trade-flows');
    expect(tf?.children?.find(c => c.id === 'manage-tradeflows')?.page).toBe('planned');
  });
});
```

- [ ] **Step 2:** Run `npm --prefix FrontEnd exec vitest run tests/unit/trade-flows-catalog.test.ts`. Expected: FAIL (ids missing).
- [ ] **Step 3:** Add the two pages. Each child gets a one-sentence `description`.
- [ ] **Step 4:** Run that test plus `tests/unit/catalog.test.ts` (sibling icons unique). Expected: PASS.

### Task 2: `commodity` module (Maintain Commodity)

**Files:**
- Create:
  - `FrontEnd/src/modules/commodity/definition.ts`
  - `FrontEnd/src/modules/commodity/contract.ts`
  - `FrontEnd/src/modules/commodity/seed.ts`
- Modify:
  - `FrontEnd/src/modules/registry.ts`
  - `FrontEnd/src/modules/server-registry.ts` (no `source` yet)
- Test: `FrontEnd/tests/unit/commodity.test.ts`

**Interfaces:**
- Produces: `export const commodity: ModuleDef<CommodityLookups>`. It has one tab, id `commodities`, with key
  `commodity`. The fields are:
  - `commodity`: type `code`, max 20, key, required, uppercase.
  - `description`: type `text`, max 60, required.
  - `unit`: type `select`, options `UNITS`, required.
  - `currency`: type `code`, max 5, required, 3 uppercase letters.
- Produces: `export const UNITS: Option[]` (`LBS`, `KG`, `MTS`). Task 5 uses it.
- `opens: { create: 'popup', open: 'popup' }`. The reason, for `tsf-fx-spec.md`: four fields, no tabs or items.
- Contract: service `ZFS_SB_TRADEFLOW_O4_API`, `naming: 'pascal'`, `etag: true`, table
  `commodities: { entitySet: 'Commodity' }`, plus the stamp field mapping.
- Seed: `ALMOND` (Almonds, LBS, USD), `COTTON` (Cotton, KG, USD), `CASHEW` (Cashew kernels, MTS, USD).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { commodity, UNITS } from '@/modules/commodity/definition';
import { MODULES } from '@/modules/registry';

const tab = commodity.tabs[0];
const lk = commodity.lookups(undefined);
const ok = { commodity: 'ALMOND', description: 'Almonds', unit: 'LBS', currency: 'USD' };

describe('commodity module', () => {
  it('is registered and opens in a pop-up', () => {
    expect(MODULES.commodity).toBe(commodity);
    expect(commodity.opens).toEqual({ create: 'popup', open: 'popup' });
  });
  it('offers the three units', () => expect(UNITS.map(u => u.value)).toEqual(['LBS', 'KG', 'MTS']));
  it('accepts a complete row', () => expect(Object.values(tab.check(ok, lk, 'add')).filter(Boolean)).toEqual([]));
  it('refuses an unknown unit and a bad currency', () => {
    expect(tab.check({ ...ok, unit: 'TON', currency: 'US' }, lk, 'add')).toMatchObject({
      unit: "Unit 'TON' must be LBS, KG or MTS.", currency: 'Currency must be a 3-letter code, e.g. USD.'
    });
  });
});
```

- [ ] **Step 2:** Run it. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the definition, contract and seed, modelled on `modules/time-buckets/` and the minimal
  table tab in `docs/how-to-add-an-application.md` §2a. Register it in both registries.
- [ ] **Step 4:** Run it, plus `tests/unit/definitions.test.ts` and `tests/unit/conformance.test.ts`. Expected: PASS.

### Task 3: `commodity-price` module (Update Price)

**Files:**
- Create: `FrontEnd/src/modules/commodity-price/{definition,contract,seed}.ts`
- Modify: both registries
- Test: `FrontEnd/tests/unit/commodity-price.test.ts`

**Interfaces:**
- Consumes: the `commodity` seed rows, as this module's `commodities` lookup.
- Produces: `export const commodityPrice: ModuleDef<PriceLookups>`. It has one tab, `prices`, with keys
  `['commodity', 'effectiveFrom']`. The fields are:
  - `commodity`: type `select`, options from `lk.commodities`, labelled "ALMOND - Almonds".
  - `effectiveFrom`: type `date`, required.
  - `price`: type `amount`, `currencyField: 'currency'`, required.
  - `currency`: display only. It is filled by `enrich` from the commodity, with `unit` alongside, and is never typed.
- The tab has a filter by commodity and `defaultSort: { col: 'effectiveFrom', dir: -1 }`.
- `opens: { create: 'popup', open: 'popup' }`. The reason: three fields.
- Contract: table `prices: { entitySet: 'CommodityPrice' }`, `numbers: ['price']`, and lookup
  `commodities: { entitySet: 'Commodity', fields: { commodity: 'Commodity', description: 'Description', unit: 'Unit', currency: 'Currency' } }`.
- Seed prices:
  - ALMOND: 2.10 from 2026-10-01 and 2.15 from 2026-11-01.
  - COTTON: 1.80 from 2026-09-15.
  - CASHEW: none, so the "No price" case shows up.

- [ ] **Step 1: Write the failing test.** Assertions:
  - `check({commodity:'ALMOND', effectiveFrom:'2026-11-05', price:'2.15'})` has no messages.
  - `price: '0'` → `price: 'Price must be greater than zero.'`.
  - `commodity: 'GOLD'` → `commodity: "Commodity 'GOLD' is not maintained."`.
  - `enrich('prices', {commodity:'ALMOND', …}, lk)` → `{ currency: 'USD', unit: 'LBS' }`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement and register.
- [ ] **Step 4:** Run it with `definitions.test.ts`. Expected: PASS.

### Task 4: Pricing rule and the `tradeflow` module (Tradeflows List)

**Files:**
- Create:
  - `FrontEnd/src/modules/tradeflow/pricing.ts`
  - `FrontEnd/src/modules/tradeflow/{definition,contract,seed}.ts`
- Modify: both registries
- Test: `FrontEnd/tests/unit/tradeflow.test.ts`

**Interfaces:**
- Produces: `export function priceOn(prices: Row[], commodity: string, tfDate: string): string`. It returns the
  price string, or `''` when there is none.
- Produces: `export function valueOf(price: string, quantity: string): string`, with 2 decimals, or `''`.
- Produces the shared field list `TF_FIELDS`, which Task 5 reuses as its upload columns:

| Field | Label | Type |
|---|---|---|
| `notifyParty` | BL Notify Party | text, max 80 |
| `blNumber` | BL Number | code, max 35 |
| `blDate` | BL Date | date |
| `etd` | ETD | date |
| `eta` | ETA | date |
| `contractRef` | Contract Ref | code, max 20 |
| `contractDate` | Contract Date | date, optional |
| `invoiceRef` | Invoice Ref | code, max 20 |
| `invoiceDate` | Invoice date | date |
| `commodity` | Main Commodity | code, max 20 |
| `goods` | Goods Details (Description) | text, max 120 |
| `quantity` | Quantity | decimal, 3 dp |
| `unit` | Kg / LBs / Mts | select over `UNITS` |

- Produces: `export const tradeflow: ObjectModuleDef<TfLookups>`, set up as follows.
  - **Basics:** `opens: { create: 'popup', open: 'popup' }` (the reason: read-only view of one record with one BL),
    and `canCreate: false`, `canEdit: false`, `canDelete: false`.
  - **List:**
    - entity `tradeflows`, keys `['tfNo', 'tfDate']`.
    - Columns: TF No, TF Date, BL No (`blNo`), then every `TF_FIELDS` column, then Price (amount, `currencyField: 'currency'`) and Value (amount).
    - Filters: `tfDate`, `commodity`, `tfNo`. Search: `tfNo`, `blNumber`, `contractRef`, `invoiceRef`.
    - `defaultSort: { field: 'tfDate', dir: -1 }`, `layouts: {}`.
    - The Price column's `statusTone` is amber, with a "No price" text, when `price` is empty.
  - **Tabs:**
    - `fields`: groups Shipment, Contract & invoice, Goods & value.
    - `items` tab `bl`, labelled "Bill of Lading", table `bl`, keys `['tfNo', 'tfDate', 'blNo']`, read-only.
- Contract:
  - Tables: `tradeflows: { entitySet: 'TradeFlow' }` and `bl: { entitySet: 'BillOfLading' }`.
  - `object.items.bl.navigation: '_BillOfLading'`, `itemEtag: 'parent'`.
  - `numbers: ['quantity', 'price', 'value']`, `keyTypes: { tfDate: 'date' }`.
- Seed: about 8 trade flows built from the rows of `TF.xlsx`. TF numbers `TF0000000001…`, BL numbers
  `BL0000000001…`. TF dates 2026-10-15, 2026-11-01, 2026-11-05 and one CASHEW row. Price and value are filled by
  `priceOn`/`valueOf` against the Task 3 seed.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { priceOn, valueOf } from '@/modules/tradeflow/pricing';

const prices = [
  { commodity: 'ALMOND', effectiveFrom: '2026-10-01', price: '2.10' },
  { commodity: 'ALMOND', effectiveFrom: '2026-11-01', price: '2.15' }
];
describe('trade flow pricing', () => {
  it('takes the latest price on or before the TF date', () => {
    expect(priceOn(prices, 'ALMOND', '2026-10-31')).toBe('2.10');
    expect(priceOn(prices, 'ALMOND', '2026-11-01')).toBe('2.15');
    expect(priceOn(prices, 'ALMOND', '2026-09-30')).toBe('');
    expect(priceOn(prices, 'CASHEW', '2026-11-05')).toBe('');
  });
  it('values exactly to two decimals', () => {
    expect(valueOf('2.15', '264554.93')).toBe('568793.10');
    expect(valueOf('', '44000')).toBe('');
  });
});
```

  Add module assertions:
  - `MODULES.tradeflow` is registered.
  - `canCreate`, `canEdit` and `canDelete` are all false.
  - The list columns end with `price`, `value`.
  - Every seed row's `value` equals `valueOf(priceOn(...))`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `pricing.ts`. Compare dates as ISO strings, and do the money math in integer
  thousandths so nothing is lost to floating point. Then the definition, contract and seed. Register it.
- [ ] **Step 4:** Run it with `definitions.test.ts` and `object.test.ts`. Expected: PASS.

### Task 5: `tradeflow-upload` module (Tradeflows Upload)

**Files:**
- Create: `FrontEnd/src/modules/tradeflow-upload/{definition,contract,seed}.ts`
- Modify: both registries
- Test: `FrontEnd/tests/unit/tradeflow-upload.test.ts`

**Interfaces:**
- Consumes: `TF_FIELDS` (Task 4) and `UNITS` (Task 2).
- Produces: `export const tradeflowUpload: UploadModuleDef<UploadLookups>`, set up as follows.
  - **Basics:** `entity: 'tradeflows'`, `keys: ['blNumber']`, `mode: 'create'`, `strict: false`, `maxRows: 1000`.
  - **Columns:** `TF_FIELDS`, with every label exactly as in Global Constraints. Required is marked by `required: true`,
    not by `*` in the label.
  - **`check(rows, lk)`:**
    - Commodity not in `lk.commodities`: `Commodity 'X' is not maintained. Add it in Maintain Commodity first.`
    - Unit differs from the commodity's unit: `Unit LBS does not match ALMOND's unit KG.`
    - Quantity ≤ 0: `Quantity must be greater than zero.`
  - Duplicate BL Number (within the file or already stored) comes from the upload engine's key check, via
    `keys: ['blNumber']`.
- Contract: the same service. `tradeflows: { entitySet: 'TradeFlow' }`, plus the `commodities` lookup from Task 3.
- The engine posts only the TF fields. SAP assigns TF No / TF Date / BL No and creates the BL (Part B).
- The upload result shows its created count. Add a catalogue-description line that points to Tradeflows List.

- [ ] **Step 1: Write the failing test.** Use `matchColumns` (`@/lib/upload/columns`) on a table whose header row is
  the exact `TF.xlsx` headings (including `#`), and then `tradeflowUpload.check`. Assertions:
  - Every field is matched, and `ignored` equals `['#']`.
  - `contractRef` reads `'1490004320'`.
  - An empty Contract Date gives no problem.
  - `almond` is accepted as `ALMOND`.
  - Unit `KG` on ALMOND gives the unit message.
  - Quantity `0` gives the quantity message.
  - Run the rows through `uploadService(...).check` on sample data. Two rows with BL Number `NAM6036645` give
    `Same key as row 1.` on row 2.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement and register. If `readUpload` gives Excel dates as serials or datetimes, check that the
  `date` field's paste converts them. Add a case reading `C:\Users\karth\Downloads\TF.xlsx` through
  `lib/client/xlsx.ts` (copy it to `FrontEnd/tests/fixtures/tf-sample.xlsx`). Its first row must give `blDate`
  `'2023-02-07'` and `quantity` `'44000'`.
- [ ] **Step 4:** Run it. Then run `npm run verify` (whole gate). Expected: PASS.

### Task 6: Screens, records and UI approval (STOP)

**Files:**
- Modify:
  - `FrontEnd/tests/e2e/workspace.spec.ts`: open each new tile, and on Upload, upload `tf-sample.xlsx` and see the
    preview.
  - `APPLICATION.md`: Purpose (trade flows now in scope), Modules table, Screens table.
  - `records/tsf-fx-spec.md`: `opens` choices with their reasons.
- Create: a worklog `records/worklog/2026-11/2026-11-05-HHmm-trade-flows.md` with evidence beside it.

- [ ] **Step 1:** Run `npm run e2e`. Expected: PASS.
- [ ] **Step 2:** Run `npm run dev`. Take light and dark screenshots of:
  - the rail with both pages
  - each tile page
  - Commodity list + its pop-up
  - Update Price + its pop-up
  - Tradeflows List + record pop-up (BL tab)
  - Upload preview of `TF.xlsx`

  Also take one narrow-screen shot of the list. Save them under the worklog's evidence folder.
- [ ] **Step 3:** Show the screenshots and `http://127.0.0.1:3100` to the user, and **stop until they approve**.
  Record the verbatim answer in `APPLICATION.md` Approvals. Changes go back to the owning task.

---

## Part B: SAP (only after UI approval)

**Tools:** use the ADT MCP tools: `searchObject`/`validateNewObject` before each create, `createObject`,
`setObjectSource`, `syntaxCheckCode`, `activateByName`, `publishServiceBinding`, `tableContents`, `runQuery`.

### Task 7: Number ranges and DDIC tables

**Files (SAP):**
- `ZFS_T_SLC_CMDTY`: commodity, key `client, commodity`.
- `ZFS_T_SLC_CMPRC`: price, key `client, commodity, effective_from`.
- `ZFS_T_SLC_TFLOW`: trade flow, key `client, tf_no, tf_date`.
- `ZFS_T_SLC_TFBL`: BL, key `client, bl_no, bl_date`, plus `tf_no`, `tf_date`.

Every table also gets `created_by`, `created_at`, `last_changed_by`, `last_changed_at` and `local_last_changed_at`.

- [ ] **Step 1:** Read `NRIV` for objects `ZSGTSFNR02` and `ZSGTSFNR05` (`tableContents`). Note the interval number
  (expected `01`), the current number and the length in the worklog.
- [ ] **Step 2: Naming check.** `SLC` is not in the naming-conventions area list. Before creating anything, ask the
  user whether `SLC` is the right area code; the package is `ZFS_SLC_APP`. If they say no, stop and use the area
  they give.
- [ ] **Step 3:** Create the four tables. Field types:
  - Character fields as in Task 4's lengths.
  - Quantity `DEC 15,3`, price `DEC 15,4`, currency `WAERS` (CUKY reference on price).
  - Unit `CHAR 3`, dates `DATS`.
  - TF No / BL No `CHAR 10`, or the NRIV length if it differs.
- [ ] **Step 4:** Activate them. Expected: no errors. Add them to the worklog Object list.

### Task 8: Commodity and CommodityPrice business objects

**Files (SAP):**
- Views: `ZFS_R_CommodityTP`, `ZFS_C_CommodityTP`, `ZFS_R_CommodityPriceTP`, `ZFS_C_CommodityPriceTP`.
- Behaviour definitions: same names as the root views.
- Behaviour pools: `ZBP_FS_COMMODITYTP`, `ZBP_FS_COMMODITYPRICETP`.

**Behaviour:**
- Both BOs: managed, `strict ( 2 )`, `etag master LocalLastChangedAt`, `lock master`, create / update / delete.
- Commodity:
  - Validation `validateFields`: unit in LBS/KG/MTS, and the currency exists in `I_Currency`.
  - Validation `validateLocks`: unit or currency changed while a price or trade flow refers to the commodity →
    error "Unit and currency cannot change: commodity is in use."
  - `delete ( precheck )`: refused while referenced, with "Commodity is in use by prices or trade flows."
- CommodityPrice:
  - Determination `on modify { create; field Commodity; }` copies the currency from the commodity.
  - Validation: the commodity exists and price > 0.
- All messages through message class `ZFS_TRM_MSG` (the only message class allowed). Add new message numbers there.

- [ ] **Step 1:** Create the objects, syntax-check and activate them. Expected: active, no errors.
- [ ] **Step 2:** Add an ABAP Unit test class `LTC_COMMODITY` in each behaviour pool, run with `unitTestRun`:
  - Create ALMOND/LBS/USD, then change its unit while a price exists → failed with the lock message.
  - Price 0 → failed.

  Expected: tests pass, and the test data is rolled back.

### Task 9: TradeFlow business object (with BL child) and the price view

**Files (SAP):**
- `ZFS_I_TradeFlowPrice`: a read-only view entity giving `TfNo, TfDate, Price, Currency, TfValue`. Build it from a
  helper view `ZFS_I_TradeFlowPriceDate`, which computes `max(EffectiveFrom)` per trade flow where
  `EffectiveFrom <= TfDate` and the commodity matches, joined back to the price table.
- Root and projection views: `ZFS_R_TradeFlowTP`, `ZFS_C_TradeFlowTP`.
- Child views: `ZFS_R_BillOfLadingTP` (child), `ZFS_C_BillOfLadingTP`.
- Behaviour definition `ZFS_R_TradeFlowTP` and pool `ZBP_FS_TRADEFLOWTP`.
- The root view exposes `_Price.Price`, `_Price.Currency`, `_Price.TfValue` as read-only `Price`, `Currency`,
  `Value`.

**Behaviour:**
- Managed, `strict ( 2 )`. TradeFlow is the root, with `composition [0..1] of ZFS_R_BillOfLadingTP as _BillOfLading`.
- `early numbering` on both entities:
  - `earlynumbering_create` sets `TfNo` from `cl_numberrange_runtime=>number_get( nr_range_nr = '<interval>', object = 'ZSGTSFNR02' )` and `TfDate = cl_abap_context_info=>get_system_date( )`.
  - `earlynumbering_cba_Billoflading` does the same with `ZSGTSFNR05` for `BlNo` / `BlDate`.
- Determination `createBl on modify { create; }`: `MODIFY ENTITIES … IN LOCAL MODE CREATE BY \_BillOfLading`. It
  copies every shipment field from the trade flow.
- Validation `validateTradeFlow on save { create; update; }`. Each failure gives its error:
  - The commodity exists.
  - The unit equals the commodity's unit.
  - Quantity > 0.
  - Required fields are present.
  - No other trade flow has the same `BlNumber`. Error: "BL Number &1 already exists in trade flow &2."
- `etag master LocalLastChangedAt`. BL is `etag dependent by _TradeFlow` and `lock dependent`.
- Full CRUD on both, as the user asked.

- [ ] **Step 1:** Create the objects, syntax-check and activate them. Expected: active.
- [ ] **Step 2:** ABAP Unit `LTC_TRADEFLOW`. Use a test double for the number range, or skip numbering assertions
  when the test environment can't draw numbers; never commit them.
  - Create → one BL child with the same BL Number.
  - Duplicate BL Number → failed.
  - Wrong unit → failed.
  - Price view: the latest price on or before the TF date. Seed prices with the CDS test double framework
    (`cl_cds_test_environment`).

  Expected: pass.

### Task 10: Service, binding and connecting the four modules

**Files:**
- SAP:
  - Service definition `ZFS_SD_TRADEFLOW`, exposing `ZFS_C_CommodityTP as Commodity`,
    `ZFS_C_CommodityPriceTP as CommodityPrice`, `ZFS_C_TradeFlowTP as TradeFlow` and
    `ZFS_C_BillOfLadingTP as BillOfLading`.
  - Binding `ZFS_SB_TRADEFLOW_O4_API` (OData V4 Web API), published.
- Modify:
  - `FrontEnd/src/config/services.json`: key `tradeflow`, path
    `/sap/opu/odata4/sap/zfs_sb_tradeflow_o4_api/srvd_a2x/sap/zfs_sd_tradeflow/0001/`.
  - The four modules' `serviceKey: 'tradeflow'`.
  - `server-registry.ts`: `source: 'sap'` on all four.
  - `FrontEnd/tests/support/mock-sap.ts`: entity sets `Commodity`, `CommodityPrice`, `TradeFlow` (with
    `_BillOfLading` expand) and `BillOfLading`.
- Test: `FrontEnd/tests/unit/tradeflow-odata.test.ts`, with cases copied from `module-service.test.ts`.

- [ ] **Step 1:** Write the OData tests against the mock:
  - The commodity list reads `Commodity`.
  - A price add posts one `$batch` changeset with `Price` as a JSON number.
  - The upload post sends one changeset of `POST TradeFlow` without `TfNo`/`TfDate`.
  - The trade flow pop-up reads `_BillOfLading`.

  Run them. Expected: FAIL.
- [ ] **Step 2:** Make the changes above. Check each contract's property names against the service's live
  `$metadata` (read through the relay).
- [ ] **Step 3:** Run `npm run verify`. Expected: PASS.

### Task 11: Live check and records

- [ ] **Step 1:** Live, read only, through the relay, with `npm run test:live` plus a browser walk-through. Open
  each screen and confirm each read answers 200 with the expected shape. Record a run in `records/results/`.
- [ ] **Step 2:** Ask the user for the write test, exactly: "Live write test: create commodity ALMOND (LBS, USD),
  price 2.15 from today, and upload the 10 rows of TF.xlsx. This draws 10 real numbers each from ZSGTSFNR02 and
  ZSGTSFNR05. Go ahead?" Only on yes, run it and check the following:
  - 10 TF No + BL No are assigned, each BL a copy of its row.
  - Price 2.15 and Value = quantity × 2.15.
  - Re-uploading the same file rejects all 10 rows as duplicates.
- [ ] **Step 3:** Update the records:
  - `APPLICATION.md`: SAP services row, Approvals, and status history line "SAP connected".
  - The worklog Object list (every RAP object with its `NAMING:` line).
  - `records/test-cases/`: one TC per screen.
  - The lessons ledger.
  - The template's `docs/application-log.md` row and status line.
- [ ] **Step 4:** Ask the deployment question exactly as in CLAUDE.md, once `npm run verify` is green.
