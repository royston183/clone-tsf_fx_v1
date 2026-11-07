# Propose Tradeflows: closest proposals when nothing comes within 1%

- **Date:** 2026-11-06
- **Started:** 15:08
- **Application:** TSF_FX
- **System:** DS4_100_TFSIN (DS4 / client 100)
- **Modules:** propose-tradeflows (page), bl-assign
- **Requested by:** user ("currently i am not getting any proposal from the program help me complele this make sure no exsiisting things are impacted")

## Scope

Propose Tradeflows gave no proposal on live data. Cause (read-only check of `BillOfLading`, `TradeFlow`, `Commodity` on
ZFS_SB_TRADEFLOW_O4_API): the matcher only accepts BL sets within ±1% of what is left of a Deal ID. Deal 7000000081
(C112, 100,000.00 USD left) has only free C112 BLs of 138,600.00 and 833,348.03 USD; deals 7000000078/79/80 (C110
RUBBER) have no C110 BLs at all. Change: when nothing is within 1%, the app offers the closest proposals: "Covers the
deal" (smallest minimal sets that reach the amount; the smallest BL of the set is assigned only the USD still left,
so the deal ends filled) and "Partial fill" (fullest sets under the amount, full BL values). The 1% path is unchanged.
When there is no proposal at all, the screen says why. The AI route accepts and explains `fit` / `cap`.
Out of scope: splitting one BL across several deals (a BL keeps one Deal ID).

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | What to offer when no set of BLs comes within 1%? | "Closest + cap (Recommended)" | 2026-11-06 |

## Todo

- [x] 1. Diagnose on live data (read-only)
- [x] 2. `closestCombinations`, `assignedTotal` (`FrontEnd/src/lib/propose/match.ts`); `proposalsFor` fallback, capped `acceptPlan`, `noProposalReason` (`logic.ts`)
- [x] 3. Cards, notice and modal show the fit and the capped BL; BackEnd AI input accepts `fit` / `cap`
- [x] 4. Tests (`propose-match.test.ts`, `propose-page.test.ts`), incl. the live 7000000081 case
- [x] 5. Probe on the live data read: 7000000081 → BL 4000000024 assigned 100,000.00 of 138,600.00
- [x] 6. Round 2 (user: "why only 8 trade flow is assigned there are many trade flows it should accomadte the full amount"):
  each proposal was capped at 8 BLs (`MAX_BLS = 8`). Raised to 300 in `match.ts`, the AI route input (300 per
  candidate, 1000 BL rows, maxBls rule ≤ 300); closest search prunes before building sets. Live probe: 7000000080
  (10,000,000 USD) → all 65 free C110 BLs, 9,370,740.00 (−6.29%; SAP has no more C110); 5,000,000 → 34 BLs within 1%.
- [x] 7. Round 3 (user: "the deals on the left side have an option to view all the BL which is assigned there and also ask for question during proposal try to add less BL and complete the amount assig the bigger amount first make the display good please test with test casess"):
  - Question step before proposing (asked once, kept for every deal; "Change" reopens it): 1 fill = Fewest BLs, bigger
    first (default) / Closest / Oldest trade flows; 2 when nothing is within 1% = Cap the last BL (default) / Full BL
    values only. `findFewest` (smallest set size first, largest BLs first; top-r pruning in `findCombinations`).
  - AI question box under the proposals: new BackEnd route `POST /api/ai/ask` (same fields as the ranking + question +
    up to 6 earlier turns; answer ≤ 4 sentences; may return rules, which re-run the proposals).
  - Deal list: filter Open / With BLs / All (was "Open only"); each deal with BLs shows "N BLs assigned · USD" and opens
    a modal with its BLs by trade flow (trade-flow tiles + one table with total). The deal page shows the same view.
  - Ordering fix found on live data: partial fills rank fullest first, after the proposals that complete the amount.
  - Answer recorded: Q "ask for question during proposal" → "Both"; Q BL field sheet → "ignore for now".
  - Live probe: 7000000078 (600,000) → 4 BLs, 600,440.00 (+0.07%); 7000000080 → all 65 C110 BLs first.
  - Evidence: `evidence/2026-11-06-1508-propose-closest/` 1-questions, 2-proposals, 3-assigned, 4-deal-bls-modal, 5-dark, 6-narrow-dark.
- [ ] 8. UI approval of the new question step, AI box and assigned-BL views (screenshots shown 2026-11-06)
- [ ] 9. Commit / deploy (on request)

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `FrontEnd/src/lib/propose/match.ts` | FE logic | app | — | changed |
| `FrontEnd/src/pages/propose-tradeflows/` | PAGE | app | — | changed |
| `BackEnd/src/ai/proposals.ts` | BE route | app | — | changed (input schema, prompt); new `POST /api/ai/ask` |
| `FrontEnd/src/pages/propose-tradeflows/parts.tsx` | PAGE parts | app | — | new (question step, AI box, assigned BLs) |

## Delivery checks

- [x] No SAP object created; the check read SAP only (GET)
- [x] `npm run verify`: BackEnd green; FrontEnd typecheck, lint, build green; tests 889/890 — the one failure is `conformance › runs on Node 22 LTS` because this PC runs Node 26.13.0 (environment, not this change)
- [x] `npm run e2e`: 119 passed
- [x] No write to SAP
