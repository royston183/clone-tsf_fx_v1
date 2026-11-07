# FX FO → MO chain live, Propose AI conditions, Duplicate status, Update Price on a date, TSF_FX look

- **Date:** 2026-11-06 / 2026-11-07
- **Started:** 20:00 (2026-11-06), continued 2026-11-07
- **Application:** TSF_FX
- **System:** DS4_100_TFSIN (DS4 / client 100); SAP reached through the local relay; NIIF host
- **Modules / pages:** fx-blotter (DE6), deal-confirmation (ZSGTSFR024), ref-mo-confirm-fx-deal-id (ZSGTSFP002), propose-tradeflows, update-price (new page over commodity-price), upload (shared), shell (top bar), DataTable (shared)
- **Requested by:** user (verbatim excerpts):
  - "there is some bug while creating the fx deals … correct DE6 efficently … the deal ID should be cobnfirmed make sure the process runs smooth"
  - Enhancement requirements: "Propose Tradeflow – AI-Based Filtering and BL Allocation", "Deal Status – Rename Invalid to Duplicate", "Update Price – Replace Commodity Filter with Effective Date Filter"
  - "remove the column effictive from make this FROM the perspective of date where i will input date and check if the commodites that i have have the value if not then i will update this"
  - "keep everything multiple selection here and make the font small and spacious … the proposals are incorrect the colour looks bad there are proposals with same amount … inclusion or exculsion of the BL"
  - "here i dont want the card structure in the right let it be the report structiure line by line like a list"
  - "look at this UI and adjust the whole application like this" (scope answer: "Both now")
  - "why is this sap not tested change that make the ui same as my previous screen shot"
  - "make the UI as simple as possible make sure everthing is working as expected … test it throuhjly and fix the issues"

## Scope

1. DE6 FX Blotter wrote nothing to SAP (Auto-create Deals and Release to MO changed the page only; Deal ID from a local
   counter). Connected to SAP through the reference program's own calls (`pages/fx-blotter/sap.ts`): Auto-create Deals
   books Deal 1 / Deal 2 (FxTransaction POST + TrmFxApp 01, MC reference, trader); Release to MO of the pair draws the
   Deal ID (middleware tsfDealId, range ZSGTSFNR01), links D1/D2, moves the MC to 04 and writes 03 on both legs.
   Decision: the Deal ID is created at Release to MO ("At Release to MO (Recommended)").
2. MO Deal Confirmation: the trader filter no longer hides released deals without a trader code.
3. Propose Tradeflow: typed conditions (deal vs BL amount with strict >, 50K+ = ≥, K/L/M/Cr units, include / only /
   exclude BL and trade flow numbers, commodity, trade-flow dates, number of BLs, order) read deterministically
   (`lib/propose/query.ts`), the AI (`POST /api/ai/interpret`) only for what the reader cannot place, validated;
   proposals only from real free BLs; "No matching deals or available BLs found for the selected criteria." with the
   reason, never unrelated proposals; acceptance re-read from SAP and checked (duplicates, taken / deleted BLs, value,
   over-allocation, repeats) and written with the fresh ETags; multiple-choice options; one proposal per amount;
   closest proposals first (tightening search); report-style lists.
4. Upload preview: rows already stored (or repeated in the file) show **Duplicate**; other failures stay **Invalid**.
5. Update Price: a page from the perspective of a date (As of in the top bar): every commodity with its price for the
   day or Missing, typed prices saved as Effective From = the day; price history of the chosen commodity on the right.
6. TSF_FX look: slim top bar ("/" breadcrumb, page controls slot, SAP status, theme, refresh), bold titles, one KPI
   strip, report tables with sort + filter (funnel) headers and bold totals; master–detail on Propose, Update Price,
   Manage Tradeflows.
7. "SAP not tested": the check used the first configured service (Time Buckets), which is not published on this system
   (404). The check now skips unpublished services and runs once by itself after sign-in.

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | When is the Deal ID created? | "At Release to MO (Recommended)" | 2026-11-06 |
| 2 | May the chain run live in DS4 / 100? | "Yes, run it live" (MC named before the first write: 2000000040) | 2026-11-06 |
| 3 | "Invalid" → "Duplicate": where? | "while uploading the preview of the data if data is already uploaded the status should be duplicate and not invalid" | 2026-11-06 |
| 4 | Reference UI scope | "Both now" | 2026-11-07 |
| 5 | Trader masters disagree (wb-masters C27 = Akshay Mohnot, C28 = Nidhi Singh; ZSGTRMTR_TRADER C27 = Antony N, C29 / C = Nidhi S, no C28) | open: master data to align in SAP; the code chosen on the blotter is what is saved | — |

## Live run (DS4 / 100, 2026-11-07) — writes approved

| Step | Screen | Result in SAP / middleware |
|---|---|---|
| 1 | DE6 Auto-create Deals, MC 2000000040 (M032), trader C27, 1,00,000 USD @ 88.70 | Deal 1 **3000000000061** (IN11, 619 forward), Deal 2 **2000000000087** (SG03, 631 NDF); TrmFxApp 01, MC ref, Ztrcode C27, BlotterDate 2026-11-07 |
| 2 | DE6 Release to MO (pair) | Deal ID **7000000083** (FX/FX1, 01, slots IN11/…061 and SG03/…087, M032, C27, 100000 USD); MC 2000000040 → **04**; both legs **03**, D1 / D2 |
| 3 | TSF MO Deal Confirmation: Match & Release | both settled (ActivityCategory **30**), status **07** |
| 4 | MO: Confirm FX Deal ID | Deal ID **02**, ZCONFIRM X, P&L 0.00 USD @ 95.1110 (TCURR M 2026-11-07); invRef T1/T2/T3 |

Bugs found and fixed during the run: legs without a Deal ID never showed on the blotter (the TsfDeal report lists only
transactions with a Deal ID) → the blotter also reads the day's TrmFxApp + FxTransaction; Deal 1 / Deal 2 were ordered
by transaction number (one range per company code) → ordered by the MC's FX model (Deal 1 = model D1 entity), with a
Swap; the MC picker had no search (10 per page) → search added.

## Todo

- [x] DE6 writes (Auto-create Deals, Release to MO) through the reference calls; unit tests `fx-blotter-sap.test.ts`
- [x] MO queue trader filter; test in `deal-confirmation.test.ts`
- [x] Propose conditions, AI interpret route, revalidated acceptance; tests `propose-query`, `propose-criteria`, `ai-proposals`
- [x] Duplicate status in upload preview; tests `upload-service`, `tradeflow-upload`, `tradeflow-odata`, e2e Tradeflows Upload
- [x] Update Price on a date; tests `update-price-sheet`, e2e Update Price
- [x] DataTable column filter; top bar slot; TSF_FX look; master–detail screens
- [x] SAP check skips unpublished services; `sap-check-any-service.test.ts`; e2e workspace
- [x] Live run of the FX chain (table above)
- [ ] UI approval of the redesigned screens (screenshots in `evidence/2026-11-06-2000-propose-conditions/` and the live shots)
- [ ] Commit / deploy (on request)

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `FrontEnd/src/pages/fx-blotter/sap.ts`, `SapDialogs.tsx` | PAGE logic | app | — | new |
| `FrontEnd/src/lib/propose/query.ts` | FE logic | app | — | new |
| `FrontEnd/src/pages/update-price/` | PAGE | app | — | new (over module commodity-price, now internal) |
| `FrontEnd/src/components/shell/TopbarSlot.tsx` | shell | app | — | new |
| `FrontEnd/src/styles/sap-look.css` | styles (after ALM) | app | — | new |
| `BackEnd/src/ai/proposals.ts` | BE routes | app | — | `POST /api/ai/ask`, `POST /api/ai/interpret` |
| No RAP object created | — | — | — | — |

## Bulk data, fill options, clean look (2026-11-07 afternoon)

- SAP test data: 3,500 bulk BLs created (approved); 515 wrong quantities (x1000, script bug) corrected by PATCH on the
  BL and its trade flow. Pool now 3,516 BLs, all 2,000-60,000 LBS (L-015).
- Fill options search separately (`findFewest`, `findTight`, `findOldest`); "Oldest trade flows" keeps widening up to
  two steps so it offers several proposals, oldest first. Live: 7000000050 and 7000000080 give 3 different best
  proposals; 7000000007 and 7000000033 agree because one planted exact set is fewest, closest and oldest.
- TC-007 rerun on 3,516 BLs: 7/12 unchanged, 5 expectations updated (better answers in the bigger pool).
- Clean look after the ECB Loan Creation Workbench (`sap-look.css`, "Clean" section): blue-bar section titles,
  underlined tabs with counts (Propose, Update Price), grey table header with sort/filter icons on hover/focus,
  quiet status tags in tables. KPI cards not brought back (removed on request).
- Unit 949/950 (Node 22 check only), e2e 119/119.
- 471 more bulk BLs were 1,000x too small; corrected (trade flow first). All 3,516 BLs 2,000-60,000 LBS.
- Deals rearranged (on request) to 1 deal : 200-300 BLs: 40 unconfirmed deals' ZDEAL_AMT changed in the middleware
  (backup kept); 37 FX-confirmed deals untouched. MAX_BLS 300 -> 500 (FE and BackEnd AI limits); AI request sends BL
  details only up to 1,000 rows. Live: every deal 100-245 BLs, 3 distinct bests per deal (TC-007, L-016).
- BackEnd 264/264, FE unit 949/950 (Node 22 check only), e2e 119/119.

## Bar, data for 300-500 BL deals, invoice review (2026-11-07 evening)

- SAP test data (approved as test data): prices 0.38-1.05 USD/LBS (COFARABICA 1.05, COFROBUSTA 0.38, COCBUTTER 0.92,
  COCLIQUOR 0.64); BLs reshaped to 40,000-86,000 LBS (trade flow first, then BL); 8 contracts, 6 notify parties and BL
  dates 01-08..01-11-2026 spread over the 3,500 bulk BLs; the 40 deals not confirmed in FX resized so even "Fewest BLs"
  needs 300+ BLs (middleware ZDEAL_AMT; old amounts in the scratchpad backups). 37 FX-confirmed deals untouched.
- Propose: command bar (type anything, Apply; Try chips apply at once; an empty bar applies the example it shows;
  "What can I type?"); stacked removable conditions; reader reads BL date / ETD / ETA, BL ranges, contract / notify party /
  invoice / BL reference, names alone from the data, "don't use", "older than N days", month ranges, fill N% / amount.
  Fill with: Fewest BLs, Closest amount, Oldest (taking turns, labelled alt. N, last one cannot be turned off);
  contracts / parties / overflow chips removed (cap + partial stay on). Proposals 1 per way + alternatives that differ
  by 20%+ BLs. Modal: BL reference, BL date, quantity total, untick + re-propose. Tabs Proposals / Assigned BLs; With BLs
  fixed; deal change clears its conditions. Unassign removed everywhere. MAX_BLS 600.
- Look: cocoa/coffee/nuts/spices/dairy loader (no technical words); compact column plan (columns at content width, a
  last left column takes the rest); single workbench tab strip hidden; quiet table headers.
- Invoice Finalisation Blotter (UI for approval): panel "BLs assigned to this Deal ID" (read-only, SAP BillOfLading by
  DealId) and the review modal before the existing compliance + save (1 Review BLs, 2 Check amounts, 3 Confirm). No new
  write path.
- Demo script: records/test-cases/TC-008-propose-demo-script.md.

## Delivery checks

- [x] No SAP object created; SAP writes only those approved (table above)
- [x] `npm run verify`: everything green except `conformance › runs on Node 22 LTS` (this PC runs Node 26.13.0)
- [x] `npm run e2e`: green (see final run in the session)
- [x] ALM stylesheets unchanged (new look in `styles/sap-look.css`, loaded last)
- [x] `.env.local`, `DB/app.db` not committed (nothing committed)
