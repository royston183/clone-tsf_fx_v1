# Manage Tradeflows and Propose Tradeflows: design

Date: 2026-11-05 · Application: TSF_FX (`D:\Application B\TSF_FX`, Tile theme, FE + BE + DB) · SAP: NIIF
(vhnlqds4ap01, client 100), package ZFS_SLC_APP, transport DS4K907209. This builds on
`2026-11-05-trade-flows-design.md`, which is live.

## Intent

An uploaded trade flow starts with one BL. Two tiles change that:

- **Manage Tradeflows** splits a trade flow into several BLs, within its quantity and value.
- **Propose Tradeflows** matches unassigned BLs to TSF Deal IDs by commodity and value. The app does the
  arithmetic; an AI (Claude) ranks the options, explains them, and turns the person's free-text preferences into
  rules for the next round.

The tile is "Propose Tradeflow" in the catalogue today; it keeps that title.

## Decided by the user

### Manage Tradeflows

- **The list** is the same as Tradeflows List, with Price and Value.
- **Splitting:** the person says how many BLs they need. The app proposes that many BLs, with the quantity divided
  equally; the person can change each quantity before saving.
  - The BLs' total quantity, and so their total value, must not exceed the trade flow's.
- **Deleting a BL** never removes the row. The BL gets a **delete flag** instead.

### Propose Tradeflows

- **Proposals** are AI-suggested BL combinations for a Deal ID, by value and commodity.
  - The person can type preferences, and new proposals follow them.
  - Build: **hybrid, real AI inside the app.** The app computes the exact combinations; Claude ranks them, explains
    them, and turns preferences into rules. The BackEnd calls the Anthropic API.
- **Currency:** the Deal Amount is **converted to USD**. A combination matches when its total BL value is
  **within 1%** of the amount being matched.
- **Commodity:** Maintain Commodity gets a **TSF FX Commodity** field, picked from the TSF FX commodity list (the
  SLC middleware's `commodity` resource, ZCOM_ID / ZCOM_DESC).
  - A Deal ID's commodity is its master contract's ZCOMMODITY.
  - A BL qualifies for a Deal ID when its commodity's TSF FX Commodity equals the Deal ID's.
- **Rounds:** a Deal ID can be filled over **several rounds**, and the **remaining amount** is shown. Proposals aim
  at the remaining amount.

## Played back and accepted ("go ahead")

### Manage

- Opening a trade flow shows its BLs: BL No, Deal ID, quantity, and value (quantity × the trade flow's price).
- The BLs may add up to less than the trade flow; the open quantity is shown.
- On save:
  - the replaced BLs are flagged as deleted;
  - SAP creates the new BLs, each with a BL No from ZSGTSFNR05, copying the other shipment fields from the
    trade flow.
- A BL that carries a Deal ID cannot be deleted or changed in Manage.

### Propose

- **Deal ID list:** each Deal ID with its commodity, Deal Amount in its own currency and in USD, the assigned amount
  (USD) and the remaining amount (USD). It shows Deal IDs with an amount still open that are not reversed or closed.
- **Accepting** a proposal (after a confirmation) writes the Deal ID onto the chosen BLs.
- **Unassigning** a BL from a Deal ID is possible here.
- **Where Deal ID lives:** on the BL.
  - The trade flow's Deal ID shows a Deal ID only when all its non-deleted BLs carry the same one; otherwise it is
    blank.
  - Manage shows each BL's Deal ID.
- **AI key and host:**
  - The Anthropic API key lives only in the BackEnd's environment (`.env.local` stand-alone, `ANTHROPIC_API_KEY`),
    never in the browser.
  - The template's rule "the BackEnd calls only REST data services" gets one exception, for the Anthropic API host.
    This is a template change, made in the template first.

## Data sent to Anthropic (approved: "go ahead")

**Sent:** Deal ID, TSF FX commodity code, Deal Amount and remaining amount (USD), and per candidate BL: BL No,
TF No, TF date, quantity and USD value. Also the person's preference text.

**Never sent:** notify-party names, contract or invoice references, goods descriptions, or SAP credentials.

## Goals

1. **Manage Tradeflows:**
   - a list like Tradeflows List;
   - a record view with the BL table;
   - **Split into BLs** (count → equal split → edit quantities → save) and **Delete BL** (flag).
2. **Propose Tradeflows:**
   - the Deal ID list with remaining amounts;
   - per Deal ID: assigned BLs, proposals (each with BLs, total, difference %, and the AI's reason), a preference box,
     and accept / unassign.
3. **SAP:**
   - one trade flow holds many BLs;
   - the BL has a delete flag (+ by/at) and its own value;
   - Deal ID is assigned per BL;
   - Commodity has TsfCommodity.
4. **BackEnd AI endpoint**, with its tests and the template change.

## Non-goals

- Changing a trade flow's own quantity, price or shipment fields.
- Splitting below the BL level, or assigning part of a BL to a deal.
- Writing anything to the Deal ID table on the SLC middleware: the assignment lives only on the BL in SAP.
- The AI computing or inventing amounts: every number shown comes from the app's own calculation.

## Anti-goals

- A proposal whose BL total is outside 1% of the remaining amount.
- A BL of another commodity, a deleted BL, or an already-assigned BL in a proposal.
- The API key reaching the browser or any file other than the BackEnd environment.
- Deleting rows from ZFS_T_SLC_TFBL.

## Constraints

- **Template rules:** UI approval first (screens on sample data, screenshots, stop until approved); SAP writes only
  after explicit approval; `ZFS_*` naming, package ZFS_SLC_APP, TR DS4K907209.
- **Live data:** 10 trade flows and 10 BLs already exist on NIIF. The SAP changes must keep them; each existing BL
  keeps its quantity.
- **Numbering:** BL No always comes from ZSGTSFNR05 (SAP early numbering).
- **Value:** BL value = BL quantity × the trade flow's price (the commodity price on or before the TF date), rounded
  to 2 decimals.
- **Middleware data:** Deal IDs and master contracts come from the SLC middleware through the BackEnd (`rest`,
  modules `tsf-deal-id` and `master-contract`). BLs come from SAP through the relay.

## Builder's calls (not discussed with the user)

1. **Exchange rate:** USD conversion uses SAP's rate type M on today's date, read through the relay. If SAP has no
   rate, that Deal ID shows "No USD rate" and gets no proposals.
2. **Combination search:**
   - only unassigned, non-deleted BLs of the matching TSF commodity;
   - at most 8 BLs per combination;
   - up to 50 candidates found; Claude gets the top 20 by closeness, ranks them, and returns the best 5 with reasons.
   - Bounded so it stays fast with hundreds of BLs.
3. **Preference rules:** Claude may return only these rule kinds, which the app applies:
   - max/min BL count;
   - include or exclude trade flows or BLs;
   - prefer older/newer TF dates;
   - prefer fewer trade flows;
   - a tighter tolerance (never wider than 1%).

   Anything else is shown back as "not understood".
4. **Model:** Claude Opus 5.5 (`claude-opus-5-5`), called from the BackEnd with `fetch`, so no new library is needed.
5. **Saving a split:** in SAP, one $batch changeset (flag the old BLs, create the new ones), all or nothing. The split
   dialog is a pop-up with a numbered two-step flow: 1 how many BLs, 2 quantities.
6. **Unassigning** clears the BL's Deal ID. A BL with a Deal ID can be unassigned only in Propose.
7. **Deleted BLs** stay visible in Manage under a "Show deleted BLs" toggle, with who deleted them and when.

8. **Split BLs share the trade flow's shipping BL Number.** The BL No (ZSGTSFNR05) tells them apart.
   - The duplicate-BL-Number check stays at trade flow level (one trade flow per shipping BL Number).
   - The split dialog asks only for the count and the quantities.
9. **Splitting works on one BL at a time:**
   - "Split BL" turns one BL without a Deal ID into N BLs, whose total must not exceed that BL's quantity.
   - "Add BLs" creates BLs from the trade flow's open quantity (trade flow quantity − non-deleted BLs).
   - "Delete BL" flags a BL; its quantity becomes open again.
   - Either way, the trade flow's quantity is never exceeded.
10. **The trade flow's own Deal ID** (TFLOW.deal_id) is derived: it is set when all non-deleted BLs carry the same
    Deal ID, otherwise blank. It is never typed in and never counts as "assigned".
11. **USD at accept time:**
    - A BL's value is in its commodity's currency. Both it and the Deal Amount are converted to USD with rate type M
      on today's date.
    - On accept, the BL stores the USD amount it was matched with (AssignedUsd), so "assigned" and "remaining" do
      not drift with the daily rate.
12. **Tolerance is two-sided (±1%).** A Deal ID can end up to 1% over-assigned, so the remaining amount may go
    slightly negative. A Deal ID leaves the open list when its remaining amount is within ±1% of its Deal Amount.
13. **Trade flows with no price:** their BLs can still be split by quantity, with value shown as "No price". They
    never appear in proposals.
14. **TSF FX Commodity is optional** and can be changed even while the commodity is in use. Until it is set, the
    commodity's BLs never qualify, and Propose says so for that commodity.
15. **Model ID:** `claude-opus-5-5`, as given by this environment.

## Left to the builder

- Screen layout within the template's report/modal design (`docs/report-template.md`).
- RAP names and field lengths.
- The combination algorithm, as long as it is exact and bounded.
- Claude prompt wording.
- Test cases.
