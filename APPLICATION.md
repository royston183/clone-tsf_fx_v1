# TSF_FX

- **Project name:** TSF_FX
- **Slug:** tsf-fx
- **Target folder:** D:\Application B\TSF_FX
- **Reference project:** D:\SAP Tool\TSF - FX Application
- **Application type:** FE + BE + DB (`docs/stack-and-structure.md`)
- **UI template:** Tile theme
- **System:** DS4_100_TFSIN (DS4 / client 100)
- **Template:** SAP Standalone Application @ f36965f
- **Requested by:** karth
- **Started:** 2026-11-04 19:55
<!-- fs-sprint:begin status -->
- **Status:** UI approved
<!-- fs-sprint:end status -->

Status is one of: Started · UI approved · SAP connected · Live-checked · Handed over · Retired. What each one needs
is in `docs/application-status.md`.

## Purpose

TSF FX converts the FX side of the TSF - FX Application (SLC) into the Application B structure: master contracts, the FX
blotter and Deal IDs, mid-office confirmation and invoicing, Deal ID settlement and month-end MTM, plus the FX reports.
The SLC side of the reference (OTTK, DTTK, ICL, SBLC, limits) is out of scope. Since 2026-11-05 the app also has
Master Data (commodity master) and Trade Flows (upload, list with price and value, commodity prices), on new SAP tables
behind ZFS_SB_TRADEFLOW_O4_API (`records/worklog/2026-11/2026-11-05-1204-trade-flows.md`). SAP is read and written from
the browser through the relay. The current implementation reads the shared Azure SLC middleware through the
BackEnd's REST/reference routes. Application-owned local tables use SQLite (Azure MySQL when deployed).

## Modules

| Module id | Kind | Title | Gallery items | Source | Service key | Status |
|---|---|---|---|---|---|---|
| `fx-overview` | dashboard | TSF FX Overview | B-overview (tiles, flow, donut, bar list, table) | master-contract and tsf-deals aggregation | tsf-deals | service binding corrected; browser flow checked |
| `master-contract` | object | FO: Create Master Contract (ZSGTSFP001) | T-large-list, T-object, D-form, F-amount, F-dateRange, B-badges | `rest`, shared middleware | master-contract | reads connected; writes built, not live-validated |
| `tsf-deals` | report (line items) | View List of TSF Deals (ZSGTSF_RFX_BLOTTER_COMP) | T-line-report, B-report-selection, B-report-overview | `sap`, relay | tsf-deals | live reads connected in prior session |
| page `fx-blotter` | custom page | DE6: TSF FX Blotter (ZSGTSFP008) | DataTable, Modal, D-wizard, B-toast, B-badges | SAP relay + middleware masters | fx, trmfxapp | live; Auto-create Deals and Release to MO (pair) post to SAP, run live 2026-11-07 |
| page `trader-workbench` | custom page | FO: Trader Workbench (ZSGTSFR100) | DataTable, Modal, B-toast, B-badges | SAP relay + middleware masters | fx, trmfxapp | live reads; posting not connected |
| page `deal-confirmation` | custom page | TSF MO Deal Confirmation - FX & Options (ZSGTSFR024) | SelectionPanel, DataTable, D-review, B-toast | SAP relay | fx, trmfxapp | live; Match & Release run live 2026-11-07 |
| page `execute-settlement` | custom page | MO: Execute Settlement for Deal ID (ZSGTSFR060) | DataTable, Modal, D-form, B-toast | SAP relay + middleware | fx, trmfxapp | reads connected; settlement writes partial, not live-validated |
| pages `ref-*` | custom pages | 39 remaining implemented reference FX menu entries | Reference components and scoped screen styles | SAP relay + middleware/local table compatibility routes; source limitations preserved | `FrontEnd/src/ref/port-manifest.json` | ported; navigation, themes and responsive layout checked |
| page `planned` | custom page | Seven menu tiles with no implemented screen in the reference, plus Manage Tradeflows (logic to come) | — | — | — | unavailable in reference |
| `commodity` | table | Maintain Commodity | Workbench, D-form, F-code, F-select | `sap`, relay (NIIF) | tradeflow | UI approved 2026-11-05; live read + write PASS (TC-006) |
| `commodity-price` | table | Update Price | Workbench, F-select, F-date, F-amount | `sap`, relay (NIIF) | tradeflow | UI approved 2026-11-05; live read + write PASS (TC-006) |
| `tradeflow` | object (read-only) | Tradeflows List | T-large-list, T-object, B-badges | `sap`, relay (NIIF) | tradeflow | UI approved 2026-11-05; live read + write PASS (TC-006) |
| `tradeflow-upload` | upload | Tradeflows Upload | T-upload, D-upload | `sap`, relay (NIIF) | tradeflow | UI approved 2026-11-05; live read + write PASS (TC-006) |

## Screens

| # | Screen | Gallery items | Fields (type) | Screenshots (light / dark) |
|---|---|---|---|---|
| 0 | Login (TSF FX branding, captcha kept) | login | username, password, captcha | `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/00-login.png` |
| 1 | Overview | B-overview | key date (date), company (segmented) | `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/01-overview.png` |
| 2 | FX Structure / FX Front-Office tiles | tiles | — | `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/02-fx-structure.png`, `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/03-front-office.png` |
| 3 | DE6: TSF FX Blotter | DataTable (editable), D-wizard | trade date, company, bank, txn type, currencies, Amount 1 (amount), rate (decimal 4), value date, NDF fields | `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/04-fx-blotter.png` / `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/14-fx-blotter-dark.png` |
| 4 | FO: Trader Workbench + Deal popup | DataTable, Modal | settlement date range, model, Deal ID, status; rate inputs (4 dp) | `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/05-trader-workbench.png`, `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/06-workbench-deal.png`, narrow `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/15-workbench-narrow.png` |
| 5 | TSF MO Deal Confirmation + review | SelectionPanel, D-review | company from/to, upto blotter date, trader, display type; ext/int ref, MO remarks | `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/07-deal-confirmation.png`, `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/08-confirm-dialog.png` |
| 6 | MO: Execute Settlement for Deal ID | DataTable, Modal | Deal ID; bank/house bank/account per leg | `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/09-execute-settlement.png` |
| 7 | FO: Create Master Contract (list, record page, child contracts) | T-large-list, T-object | origin (select), MC date, amount USD (amount), rate (decimal 4), tolerance, commodity, shipment window (dateRange), payment terms, ports, FX model | `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/10-master-contracts.png`, `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/11-master-contract-page.png`, `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/12-child-contracts.png` |
| 8 | View List of TSF Deals | T-line-report | company (suggest), blotter date (dateRange), trader (select) | `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/13-tsf-deals.png` |
| 9 | Master Data / Trade Flows tiles | tiles | — | `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/01-master-data-light.png`, `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/02-trade-flows-light.png` (and `-dark`) |
| 10 | Maintain Commodity + pop-up | Workbench, D-form | commodity (code 20), description (text 60), unit (select LBS/KG/MTS), currency (code) | `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/03-commodity-list-light.png` (and `-dark`) |
| 11 | Update Price + Add pop-up | Workbench, D-form | commodity (select), effective from (date), price (amount 4 dp); currency and unit shown from the commodity | `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/05-update-price-light.png`, `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/06-update-price-add-light.png` (and `-dark`) |
| 12 | Tradeflows List + trade flow pop-up with Bill of Lading tab | T-large-list, T-object | filters TF date, commodity, TF No; Price and Value ("No price" amber tag) | `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/07-tradeflows-list-light.png`, `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/08-tradeflow-popup-light.png`, `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/09-tradeflow-bl-dark.png`, narrow `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/13-tradeflows-list-narrow-light.png` |
| 13 | Tradeflows Upload + review of TF.xlsx | T-upload | the 13 TF.xlsx columns (dates, codes, quantity decimal 3 dp, unit select) | `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/10-upload-light.png`, `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/11-upload-preview-light.png` (and `-dark`) |
| 14 | Manage Tradeflows (placeholder) | planned | — | `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/12-manage-tradeflows-light.png` |

## Approvals

<!-- fs-sprint:begin approvals -->
| Gate | What was shown | Answer (verbatim) | By | Date |
|---|---|---|---|---|
| UI | v001: 16 screenshots (`records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/`) + http://127.0.0.1:3100 — Overview, FX menu tiles, FX Blotter, Trader Workbench, MO Deal Confirmation, Execute Settlement, Master Contract, TSF Deals report | "approved." | karth | 2026-11-04 |
| Reference port | Remaining FX screens copied as-is; review together after the port, recovered from the interrupted Claude session | "port all as-is from reference, show me at the end" | karth | 2026-11-04 |
| UI changes requested | Catalogue, Master Contract-style layouts, exports, modal spacing and page headings; full instructions in `records/worklog/2026-11/2026-11-05-ui-refinement.md` | "remove the sample page"; "rmove zname from the tiles"; "in any screen which you are showing the logo inside the page remove it ssame like Create Master Contract" | karth | 2026-11-05 |
| Design (trade flows) | Master Data + Trade Flows design, `docs/superpowers/specs/2026-11-05-trade-flows-design.md` | "approved, go ahead" | karth | 2026-11-05 |
| UI (trade flows) | Master Data + Trade Flows screens on sample data (`records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/`, tiles in `records/worklog/2026-11/evidence/2026-11-05-1204-trade-flows/tiles/`), layout/export removed from Overview and entry tables, fixed 280×120 tiles; http://127.0.0.1:3100 | "UI approved" | karth | 2026-11-05 |
| SAP objects before UI approval (trade flows) | Tables + RAP + ZFS_SB_TRADEFLOW_O4_API in ZFS_SLC_APP / DS4K907209, built in parallel with the screens (no data writes) | "can u start the table creation and odata creation as the separate agent if no dependency ?" | karth | 2026-11-05 |
| Design (Manage + Propose Tradeflows) | `docs/superpowers/specs/2026-11-05-manage-propose-tradeflows-design.md`: split BLs with delete flag, AI-ranked BL proposals per Deal ID (hybrid, Claude via the BackEnd), USD ±1%, TSF FX Commodity mapping; data sent to Anthropic listed in the design | "go ahead" (design and data to Anthropic) | karth | 2026-11-05 |
| UI (Manage + Propose Tradeflows, tile figures) | `records/worklog/2026-11/evidence/2026-11-05-manage-propose/` (light, dark, 390 px) + http://127.0.0.1:3100: Manage list/record/split/delete flag, Propose deals/proposals/no-rate; live tile figures | "approved go ahead" | karth | 2026-11-05 |
| SAP writes (commodity master) | Create the 13 TSF FX commodities of ZSGTSFTR_COMODIT in Maintain Commodity (code = TSF code, TSF FX Commodity = itself, LBS / USD) and map ALMOND to C001 Multiple Commodities | "update the commodity in maintain commodity as per sap data" + choice "Add SAP's 13, map ALMOND" | karth | 2026-11-05 |
| SAP writes (per module) | | | | |
| SAP writes (trade flows, live test) | Create commodity ALMOND (LBS, USD), price 2.15 from today, upload the 10 rows of TF.xlsx on NIIF (draws 10 numbers each from ZSGTSFNR02 / ZSGTSFNR05); re-upload must refuse all 10 | "yes run the live write test" | karth | 2026-11-05 |
| Middleware writes (master-contract) | One live test on the shared SLC middleware: create → edit → Send to M.O. on a contract labelled "TSF_FX TEST" (draws a real number from ZSGTSFNR03; visible in the TSF - FX Application) | "yes" | karth | 2026-11-04 |
| Template change | Browser dashboards may read `app`/`rest` modules through the BackEnd API (Overview) | "yes" | karth | 2026-11-04 |
<!-- fs-sprint:end approvals -->

An approval given only in chat is lost: it belongs in this table. A rejected version stays as a row ("Not approved",
then the feedback).

## SAP services

<!-- fs-sprint:begin sap-services -->
| Service key | Binding | Service path | Entity sets | Read / write | RAP objects (worklog) | Verdict |
|---|---|---|---|---|---|---|
| tsf-deals | ZFS_SB_TSFDEAL_O4_API | `/sap/opu/odata4/sap/zfs_sb_tsfdeal_o4_api/srvd_a2x/sap/zfs_sd_tsfdeal/0001/` | TsfDeal | read | `records/worklog/2026-11/2026-11-04-1955-tsf-fx-build.md` | live read 2026-11-04: 127 rows, 7 in Nov-2026 (no TC yet) |
| slc-middleware (REST) | — (Azure SLC middleware) | `https://slc-middleware-…azurewebsites.net/api/v1/data/masterContract` (+ comp, commodity, fxModel, paymentTerm, mcStatus) | masterContract | read (write built, not yet run live) | — | live read 2026-11-04: 55 contracts (no TC yet) |
| tradeflow | ZFS_SB_TRADEFLOW_O4_API (NIIF vhnlqds4ap01 / 100; published in /IWFND/V4_ADMIN 2026-11-05) | `/sap/opu/odata4/sap/zfs_sb_tradeflow_o4_api/srvd_a2x/sap/zfs_sd_tradeflow/0001/` | Commodity, CommodityPrice, TradeFlow (+ _BillOfLading), BillOfLading | read + write (CRUD); live write test PASS | `records/worklog/2026-11/2026-11-05-1204-trade-flows.md` | $metadata 200; live reads and live write PASS 2026-11-05 (TC-006: 10 TF + 10 BL numbered, priced and valued; re-upload refused 10/10) |
<!-- fs-sprint:end sap-services -->

RAP objects are listed in this app's worklog Object list. The services themselves are in `FrontEnd/src/config/services.json`
(paths only); the browser calls them through the SAP relay.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | Which part of the reference? | FX only (FX Structure + FX reports) | 2026-11-04 |
| 2 | First UI round? | Shell + key screens (6), the rest in batches | 2026-11-04 |
| 3 | Where does the Azure middleware data live? | The app's own DB (BackEnd + SQLite, Azure MySQL deployed), one-time copy of the rows | 2026-11-04 |

## Status history

<!-- fs-sprint:begin status-history -->
| Date | Status | What happened | Evidence |
|---|---|---|---|
| 2026-11-04 | Started | Copied from the template @ f36965f | `records/worklog/2026-11/2026-11-04-1955-tsf-fx-build.md` |
| 2026-11-04 | UI approved | v001 approved ("approved."): shell, Overview and six key FX screens on sample data | `records/worklog/2026-11/evidence/2026-11-04-1955-tsf-fx-build/` |
| 2026-11-05 | UI approved | Master Data + Trade Flows screens approved ("UI approved") on sample data | `records/worklog/2026-11/2026-11-05-1204-trade-flows.md` |
| 2026-11-07 | SAP connected | DE6 Auto-create Deals and Release to MO write to SAP; FO → MO chain run live: Deal ID 7000000083 created, settled (07) and confirmed (02) | `records/worklog/2026-11/2026-11-07-0930-fx-chain-propose-ai-look.md` |
<!-- fs-sprint:end status-history -->

Stand-alone, every line here is also added to the template's `docs/application-log.md` (row and status history).

## Handover

- **UI QA:** `records/test-cases/TC-005-ui-refinement.md` — 112/112 Playwright tests passed; all 73 remaining routes checked at desktop/phone widths in both themes (292 captures, no clipping or page overflow findings). Root verification passed 20 deployment checks, 249 backend tests and 777 frontend tests, including typechecks, lint and builds. Live Overview source failures are documented below. Recheck screenshots with `node scripts/audit-ui.mjs` while dev servers run.
- **Tables:** All 140 data-table locations support sortable data columns, the shared Master Contract-style Layout picker/Change Layout/Save Layout controls, content-based single-line widths and Excel. Existing report/Deal Dump exports are reused without a duplicate button. New generic table layouts persist in this browser; existing ALV layouts retain their storage. Wide tables scroll within their containers.
- **Catalogue and headings:** Samples is absent from development/release navigation and routes; framework examples are mounted only by test builds. Tiles omit transaction-code labels, and page/record content omits 39 decorative logos. Master/FO/MO/BO tiles use equal-width, aligned cards.
- **Overview:** Source data is still read from SAP/middleware. Results are reused for up to 30 seconds within this tab and selection/account scope; Refresh forces a new read. Object changes, account changes and sign-out clear the result cache.
- **Live Overview source issue (2026-11-05):** TsfDeal read returned HTTP 502 after 21.04s; the middleware master-contract query returned 200 in 0.23s. SAP-dependent sections show Retry, while middleware-backed sections remain available. Evidence: `records/results/overview-live-state.json`.
- **Run:** `npm run install:all` · `npm run dev` · `npm run verify` · `npm run e2e` · `npm run test:live` (through the relay) · structure and stack: `docs/stack-and-structure.md`
- **Secrets:** come from the process environment (FS Sprint supplies them) or, when run stand-alone, from `.env.local`. Never write secrets into any other file.
- **Known limits:** Seven reference menu tiles have no implemented screen; imported reference API gaps and sample-data limitations remain. Existing Workbench/Blotter posting is not connected, and live writes are unvalidated. Use Node 22.23.4 for verification. Continuation record: `records/worklog/2026-11/2026-11-05-continue-reference-port.md`.
