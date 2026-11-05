# Manage and Propose Tradeflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two new screens:
- **Manage Tradeflows:** split a trade flow into BLs, with a delete flag, within its quantity.
- **Propose Tradeflows:** the app finds exact BL combinations for a Deal ID's remaining USD amount (±1%); Claude ranks
  and explains them and turns free-text preferences into rules.

**Architecture:**
- **Manage** is a custom page over a new object module `tradeflow-manage` (TradeFlow with an editable BL items tab).
  - Its new BLs get SAP-assigned BL Nos through a small, generic extension: items tabs with `keyBySap`.
- **Propose** is a custom page with pure TypeScript matching (`lib/propose/`).
  - Data comes from Deal IDs and master contracts (middleware, through the BackEnd), BLs (an internal table module
    `bl-assign` over BillOfLading), commodities and exchange rates (SAP, through the relay).
  - A BackEnd route `/api/ai/proposals` calls the Anthropic Messages API with `fetch`.
- **SAP:** BL becomes [0..*] with a delete flag, AssignedUsd and value; Commodity gets TsfCommodity.

**Tech Stack:** React 19 + TypeScript (Vite), Vitest, Playwright, Fastify BackEnd (Node), SAP RAP OData V4 on NIIF,
Anthropic Messages API (`claude-opus-5-5`).

**Spec:** `docs/superpowers/specs/2026-11-05-manage-propose-tradeflows-design.md` (builds on
`2026-11-05-trade-flows-design.md`).

## Global Constraints

- **Location and commands:**
  - Work in `D:\Application B\TSF_FX`. The repo has commits now: commit after each task on a branch
    `feat/manage-propose` (create it from `master` before Task 1).
  - Unit tests run from `FrontEnd/`: `npx vitest run <file>`.
  - Gates: `npx tsc --noEmit`, `npx eslint src tests`, `npx playwright test <spec> --reporter=line`.
  - Known environment failure: conformance "runs on Node 22 LTS".
- **UI approval:** Part A (Tasks 1–6) runs on sample data, then STOP for UI approval. Part B only after it.
- **SAP:**
  - Changes are made by the SAP subagent (NIIF, `mcp__mcp-abap-abap-adt-api__*` / adt-mcp DS4_100_NIIF, package
    ZFS_SLC_APP, TR DS4K907209).
  - The 10 live TFs and BLs must survive every change.
  - Live writes (split, assign) only after the user's explicit yes.
- **Never delete BL rows.** Delete means `deletedFlag = 'X'` plus `deletedBy`/`deletedAt`.
- **Matching:**
  - USD, rate type M, today's date; tolerance ±1% of the target (the remaining USD).
  - At most 8 BLs per combination; at most 50 candidates; send the top 20 to Claude; show 5.
  - Candidate BLs are non-deleted, have no Deal ID, have a price, and their commodity's `tsfCommodity` equals the
    Deal ID's master-contract commodity.
- **AI:**
  - Model `claude-opus-5-5`; key `ANTHROPIC_API_KEY` in the BackEnd environment only.
  - Sent: dealId, tsfCommodity, deal USD amount, remaining USD, and per BL: blNo, tfNo, tfDate, quantity, usdValue,
    plus the preference text. Nothing else.
- **AI rule kinds** (the only ones applied):
  - `maxBls`, `minBls`;
  - `includeTf`, `excludeTf`, `includeBl`, `excludeBl`;
  - `preferOlder`, `preferNewer`, `preferFewerTfs`;
  - `tolerancePct` (≤ 1).
- **Record openings:** `tradeflow-manage` opens `page` (BL table with split actions). Record it in
  `records/tsf-fx-spec.md`.

## Review Focus

1. **Split arithmetic:** quantities with 3 decimals that don't divide evenly (100.000 / 3) give 33.334 + 33.333 +
   33.333; the total never exceeds the source. *Test in Task 2.*
2. **USD conversion of non-USD deals:** an INR Deal Amount with rate 0.0120 gives the right USD figure, and a deal
   with no rate gives no proposals and shows "No USD rate". *Test in Task 3.*
3. **Combination bounds:** 300 candidate BLs finish under 1 second and return ≤ 50 combinations, all within ±1%.
   *Test in Task 3.*
4. **AI output that breaks the rules:** unknown rule kinds, a tolerance > 1, or BL Nos not among the candidates are
   ignored and reported as "not understood". The AI never changes amounts. *Test in Task 8.*
5. **Assigned BLs are locked in Manage:** a BL with a Deal ID can't be split or deleted; Propose can unassign it.
   *Test in Task 2.*

---

## Part A: screens on sample data

### Task 1: Items with SAP-assigned keys (template candidate)

**Files:**
- Modify:
  - `FrontEnd/src/modules/types.ts`: the `ObjectTab` items variant gets `keyBySap?: boolean`.
  - `FrontEnd/src/lib/object/object.ts` (`diffObject`): new rows without their own key go out as creates, one per
    row. They are never collapsed by an empty key.
  - `FrontEnd/src/core/server/odata-backend.ts`: an item create of a `keyBySap` tab leaves its own key fields out of
    the POST body.
  - `FrontEnd/src/core/server/local-store.ts`: sample data numbers such items (`nextNumber`).
- Test: `FrontEnd/tests/unit/object-items-keybysap.test.ts`

**Interfaces:**
- Produces: `ItemsTab.keyBySap`. Rows of such a tab with an empty own key are creates.

- [ ] **Step 1: Write the failing tests:**
  - `diffObject` with two new BL rows (`blNo: ''`) gives two `create` changes.
  - Against mock SAP (copy the setup of `object-service.test.ts`), the `$batch` holds two
    `POST TradeFlow(...)/_BillOfLading` operations whose bodies have no `BlNo`.
  - On sample data, the two rows get distinct BL Nos.
- [ ] **Step 2:** Run the tests. Expected: FAIL (collapsed into one create, and `"BlNo"` present).
- [ ] **Step 3:** Implement. A row whose own key is empty gets a client-only key `__new<n>` in the diff, which is
  stripped before sending.
- [ ] **Step 4:** Run the test, plus `object.test.ts` and `object-service.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: items tabs whose keys SAP assigns (keyBySap)`.

### Task 2: Split rules and the `tradeflow-manage` module

**Files:**
- Create:
  - `FrontEnd/src/modules/tradeflow-manage/split.ts`
  - `FrontEnd/src/modules/tradeflow-manage/definition.ts`, `contract.ts`, `seed.ts`
- Modify: `FrontEnd/src/modules/tradeflow/definition.ts`
  - Add `deletedFlag`, `deletedBy`, `deletedAt`, `assignedUsd`, `blValue`, and `blCount` on the header.
  - The list's BL No column shows `blNo` when `blCount` is 1, otherwise "<n> BLs".
- Modify: both registries.
- Test: `FrontEnd/tests/unit/tradeflow-manage.test.ts`

**Interfaces:**
- Produces:
  - `equalSplit(quantity: string, count: number): string[]`: 3 decimals; the remainder goes to the first BLs.
  - `openQuantity(tfQty: string, bls: Row[]): string`: the trade flow's quantity minus the non-deleted BLs'.
  - `splitProblems(source: Row | null, open: string, quantities: string[]): string[]`. Its messages:
    - `"BL <blNo> has Deal ID <id>: unassign it in Propose Tradeflows first."`
    - `"The BLs add up to <sum>, more than the <limit> available."`
    - `"Each BL needs a quantity greater than zero."`
- Produces: `tradeflowManage: ObjectModuleDef`, set up as follows.
  - **Basics:** id `tradeflow-manage`, same list as `tradeflow`, `canCreate: false`, `canDelete: false`.
  - **`editableWhen`:** always.
  - **Header fields:** read-only (`lockedFields` = every header field).
  - **Items tab `bl`:** `keyBySap: true`, keys `['tfNo', 'tfDate', 'blNo']`.
  - **Its `check()`:** non-deleted BLs total ≤ the trade flow's quantity; a BL with a Deal ID is unchanged.
  - **`opens`:** `{ create: 'page', open: 'page' }`.
- Contract: like `tradeflow`, with `object.items.bl.navigation '_BillOfLading'`, itemEtag `parent`.

- [ ] **Step 1: Write the failing tests:**
  - `equalSplit('100.000', 3)` → `['33.334', '33.333', '33.333']`.
  - `equalSplit('264554.930', 2)` → `['132277.465', '132277.465']`.
  - `openQuantity('100', [{ quantity: '60' }, { quantity: '30', deletedFlag: 'X' }])` → `'40.000'`.
  - `splitProblems` covers each of the three messages.
  - The module's `check` refuses a total above the trade flow and a change to a BL with a Deal ID.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement with integer thousandths, as `pricing.ts` does. Register.
- [ ] **Step 4:** Run with `definitions.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 3: Matching engine (`lib/propose`)

**Files:**
- Create: `FrontEnd/src/lib/propose/match.ts`
- Test: `FrontEnd/tests/unit/propose-match.test.ts`

**Interfaces:**
- Produces:
  - `toUsd(amount: string, currency: string, rates: Record<string, string>): string | null`. `rates` maps a
    currency to its USD rate (type M); USD itself is 1; it returns `null` when no rate exists.
  - `candidates(bls: Row[], tsfCommodity: string, commodities: Row[], rules: Rules): Row[]`.
  - `findCombinations(cands: Row[], targetUsd: string, rules: Rules): Combination[]`, where
    `Combination = { bls: string[]; totalUsd: string; diffPct: number; tfs: number }`. It is a bounded depth-first
    search over candidates sorted by value; the number of BLs is ≤ `rules.maxBls ?? 8`; it stops at 50 results.
  - `rankByCloseness(c: Combination[]): Combination[]`, the fallback when the AI is unavailable.
  - `type Rules = { maxBls?: number; minBls?: number; includeTf?: string[]; excludeTf?: string[]; includeBl?: string[]; excludeBl?: string[]; preferOlder?: boolean; preferNewer?: boolean; preferFewerTfs?: boolean; tolerancePct?: number }`.
  - `remaining(dealUsd: string, assigned: Row[]): string`, the deal's USD minus the `assignedUsd` of the non-deleted
    BLs carrying it.

- [ ] **Step 1: Write the failing tests:**
  - `toUsd('1000000', 'INR', { INR: '0.0120' })` → `'12000.00'`; an unknown currency → `null`.
  - With BL values 5000, 4000, 3000, 2000 and a target of 7000, the result includes {5000, 2000} and {4000, 3000},
    and every `diffPct` is ≤ 1.
  - `excludeBl` drops a BL; `maxBls: 1` returns only single BLs.
  - 300 random candidates finish in under 1000 ms and give ≤ 50 results.
  - `candidates` drops deleted, assigned, unpriced and other-commodity BLs.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Work in integer cents.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 4: TSF FX Commodity on Maintain Commodity, and the `bl-assign` module

**Files:**
- Modify: `FrontEnd/src/modules/commodity/definition.ts`
  - Add the field `tsfCommodity`: a select over the lookup `tsfCommodities`, optional.
  - In sample data the options come from `COMMODITIES` in `master-contract/lookups.ts`, plus an `C130 - ALMOND`
    sample entry.
- Modify: `FrontEnd/src/modules/commodity/seed.ts`.
- Create: `FrontEnd/src/modules/bl-assign/{definition,contract,seed}.ts`.
  - It is a table module with `internal: true` and one large tab, `bls`, over BillOfLading.
  - Its keys are `['blNo', 'blRecordDate']`; its filters are `dealId`, `deletedFlag` and `commodity`; only `dealId`
    and `assignedUsd` are editable.
- Test: extend `commodity.test.ts`; create `bl-assign.test.ts`.

- [ ] **Steps:** failing tests (field exists, optional, options from the lookup; `bl-assign` is internal and its
  writable fields are `dealId` and `assignedUsd` only) → implement → pass → commit.

### Task 5: Manage Tradeflows page

**Files:**
- Create:
  - `FrontEnd/src/pages/manage-tradeflows/ManageTradeflowsPage.tsx`
  - `SplitDialog.tsx`, `manage.css`
- Modify:
  - `FrontEnd/src/pages/registry.ts` (`'manage-tradeflows'`)
  - `catalog.ts` (the `manage-tradeflows` tile gets `page: 'manage-tradeflows'`, `heading: 'custom'`)
- Test: `FrontEnd/tests/unit/manage-split-dialog.test.tsx`; extend `tests/e2e/trade-flows.spec.ts`.

**Interfaces:**
- Consumes: `equalSplit`, `openQuantity`, `splitProblems` (Task 2); `objectRead` / `objectWrite('tradeflow-manage', 'update', …)` from `lib/client/data.ts`.

**Behaviour:**
- **List:** the same columns as Tradeflows List, reusing the module's list component, so it looks the same.
- **Record page:**
  - Header: TF No, TF Date, commodity, quantity, price, value, and open quantity.
  - BL table: BL No, Deal ID, quantity, value, status tag (green Active / amber Assigned / red Deleted).
  - A "Show deleted BLs" toggle.
  - Actions per BL: Split BL, Delete BL. On the record: Add BLs (from open quantity).
- **SplitDialog:** a modal with numbered progress:
  1. **How many BLs**, an integer from 2 to 50, defaulting to 2.
  2. **Quantities:** the equal split, each editable, with a live total, the remaining amount, and value per BL.
  - Saving flags the source BL as deleted and creates the new BLs; `splitProblems` blocks saving.
- **Delete BL:** a confirm dialog, which sets the flag.
- **Locked BLs:** when a BL has a Deal ID, its actions are disabled, with the reason as a tooltip.

- [ ] **Steps:** failing dialog tests (the step-2 defaults show the equal split; an edit that pushes the total over
  disables Save and shows the message) → implement → pass → e2e (split TF00000001's BL into 3 on sample data, see 3
  Active + 1 Deleted with the toggle on) → commit.

### Task 6: Propose Tradeflows page (sample data), then STOP

**Files:**
- Create:
  - `FrontEnd/src/pages/propose-tradeflows/ProposeTradeflowsPage.tsx`, `data.ts`, `propose.css`
- Modify: `registry.ts` and `catalog.ts`. The `propose-tradeflow` tile gets `page: 'propose-tradeflows'`; its title
  stays "Propose Tradeflow".
- Test: `FrontEnd/tests/unit/propose-page.test.tsx`; extend the e2e spec.

**Interfaces:**
- Produces:
  - `interface ProposeData { deals(): Promise<Deal[]>; bls(): Promise<Row[]>; commodities(): Promise<Row[]>; rates(): Promise<Record<string, string>>; assign(bls: Row[], dealId: string, usd: Record<string, string>): Promise<void>; unassign(bl: Row): Promise<void>; ai(req: AiRequest): Promise<AiAnswer> }`
  - `sampleProposeData` (fixtures: 4 deals across 2 TSF commodities, including one INR deal and one with no rate).
  - `liveProposeData`, used in Part B: `tsf-deal-id` + `master-contract` through the data client; `bl-assign`;
    `commodity`; the `exchangerate` service.
- Consumes: `lib/propose/match.ts`.

**Behaviour:**
- **Deal list (left):** Deal ID, commodity, Deal Amount in its own currency, USD, assigned, remaining, and a status
  tag (amber Open / green Filled within ±1%).
- **Right side, for the selected deal:**
  - assigned BLs with Unassign;
  - "Find proposals";
  - up to 5 proposal cards: BL chips, total USD, diff %, number of trade flows, the AI reason, and Accept;
  - a preference box with the rules understood shown as chips, plus a "not understood" line.
- **Sample data:** `ai()` returns the closeness ranking with the reason "AI not connected (sample data)".

- [ ] **Steps:** failing page tests (a deal with no rate shows "No USD rate" and the button is disabled; Accept
  calls `assign` with the card's BLs and per-BL USD) → implement → pass → e2e → commit.
- [ ] **STOP:** take screenshots of Manage (list, record, split steps 1–2, deleted toggle) and Propose (deal list,
  proposals, preferences) in light, dark and narrow widths. Record them in the worklog and ask for UI approval.

---

## Part B: after UI approval

### Task 7: Template change (AI host) and the BackEnd AI route

**Files:**
- Template `D:\SAP Tool\B - SAP Modern UI`, first: `CLAUDE.md` non-negotiable, `docs/stack-and-structure.md` and
  `.env.example` (`ANTHROPIC_API_KEY=`).
  - The rule: "the BackEnd may call the Anthropic Messages API (`https://api.anthropic.com/v1/messages`) for AI
    features; the key lives only in the BackEnd environment".
  - Commit there, then copy the same lines into TSF_FX.
- TSF_FX:
  - `BackEnd/src/ai/proposals.ts` (route `POST /api/ai/proposals`), registered in the BackEnd router.
  - Test: `BackEnd/tests/ai-proposals.test.ts` (with `fetch` stubbed).
- **REQUIRED:** load the `claude-api` skill before writing this task's code.

**Interfaces:**
- `POST /api/ai/proposals`
  - Request:
    `{ deal: { dealId, tsfCommodity, dealUsd, remainingUsd }, candidates: Combination[] (≤ 20, with BL rows {blNo, tfNo, tfDate, quantity, usdValue}), preferences: string }`
  - Response:
    `{ ranked: { index: number; reason: string }[]; rules: Rules; notUnderstood: string[]; model: string }`
  - It needs `x-app-request: 1` like every write.
  - Without `ANTHROPIC_API_KEY` it answers 503 "AI is not configured"; the page then falls back to the closeness
    ranking with that note.
- The prompt asks for JSON only (tool use, or a JSON schema output). The BackEnd validates the answer with zod:
  indexes must be within range, rule kinds whitelisted, `tolerancePct` ≤ 1; anything else goes to `notUnderstood`.

- [ ] **Steps:** failing tests:
  - a request body sends exactly the allowed fields (no goods, notify party or refs);
  - a 503 without a key;
  - an out-of-range index or unknown rule → `notUnderstood`;
  - `tolerancePct: 5` → dropped.

  Then implement → pass → commit (template and app).
- [ ] Ask the user for the API key: they put it in `.env.local` themselves (never in chat). Then make one live call
  with the sample request and record it.

### Task 8: SAP changes (subagent)

Brief for the SAP subagent (same hard rules as before; keep the 10 rows):
- **Composition:** TradeFlow → BillOfLading [0..*].
  - `createBl` still makes the first BL on upload.
  - The trade flow's `BlNo` becomes the single BL's number when exactly one non-deleted BL exists, otherwise
    empty; add `BlCount`.
- **BL table and entity:**
  - New fields `deleted_flag` CHAR1, `deleted_by`, `deleted_at`, `assigned_usd` DEC 15,2.
  - Read-only `BlValue` = round(quantity × trade flow price, 2) and `Currency`, from ZFS_I_TradeFlowPrice through the
    parent.
- **BL validations on save:**
  - the non-deleted BLs of a trade flow total ≤ its quantity;
  - a deleted BL cannot get a Deal ID;
  - a BL with a Deal ID cannot change its quantity or delete flag;
  - DELETE operations on BillOfLading are refused (use the flag).
- **Determinations:**
  - set `deleted_by`/`deleted_at` when the flag is set;
  - the trade flow's `DealId` is derived from its non-deleted BLs (same Deal ID → that value, otherwise empty).
- **Commodity:** `tsf_commodity` CHAR 10, `TsfCommodity`, optional, changeable while in use.
- **Unit tests:** extend the ABAP Unit with a CDS test for BlValue.
- **Activation and check:** activate, check that `$metadata` loads through the relay (by me), and check that the
  10 rows survive.

### Task 9: Connect to SAP, live check, records

- **Connect:**
  - `tradeflow-manage`, `bl-assign` and `commodity` (with `tsfCommodity` and the `tsfCommodities` lookup from the
    middleware `commodity` resource, read through the BackEnd `rest` source of master-contract) go to
    `source: 'sap'`.
  - `liveProposeData` replaces the sample data once every module has a source.
- **Tests:** update `tradeflow-odata.test.ts` and the e2e stub for the new fields and the [0..*] BLs.
  `npx vitest run`, e2e 116+ pass.
- **Live read-only check:** Manage and Propose read NIIF and the middleware without errors.
- **Live write:** ask for a yes first. Then split one live BL into 2, set TSF FX Commodity on ALMOND, and accept one
  proposal against a test Deal ID the user names. Check the flags, the derived trade-flow Deal ID and the remaining
  amount.
- **Records:** `APPLICATION.md`, a worklog, `TC-007` and its run record, and the lessons ledger. Commit.
