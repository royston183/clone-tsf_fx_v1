# Test cases: Propose Tradeflow with Cocoa and Coffee (DS4 / client 100)

Created 2026-11-07 on request ("this are the 4 commodities in the deal ID also alter this commodities rondomly and create
the test cases"). Scope answers: all Deal IDs re-assigned at random; the standard set of test cases.

## Data set up in SAP and the middleware

**TSF FX commodities (middleware ZSGTSFTR_COMODIT):** C130 Cocoa Butter, C131 Cocoa Liquor, C132 Coffee Arabica,
C133 Coffee Robusta. Note: SAP's own TsfCommodity value list does not show them (the middleware is a separate copy);
SAP accepts the mapping on Maintain Commodity.

**Master contracts:** all 31 contracts that carry Deal IDs got one of the four at random (seed 20261107):
Coffee Arabica 28 deals, Coffee Robusta 20, Cocoa Liquor 15, Cocoa Butter 14.

**Maintain Commodity (SAP):** COCBUTTER → C130, COCLIQUOR → C131, COFARABICA → C132, COFROBUSTA → C133 (LBS, USD).

**Update Price (SAP), effective 01-11-2026:** COCBUTTER 4.00 · COCLIQUOR 2.50 · COFARABICA 2.00 · COFROBUSTA 1.25 USD/LBS.

**Trade flows (SAP), one BL each, trade flow date 07-11-2026:**

| Shipping BL | BL No | Commodity | Quantity (LBS) | Value (USD) |
|---|---|---|---|---|
| TC-ARA-01 | 4000000632 | COFARABICA | 50,000 | 1,00,000 |
| TC-ARA-02 | 4000000633 | COFARABICA | 30,000 | 60,000 |
| TC-ARA-03 | 4000000634 | COFARABICA | 20,000 | 40,000 |
| TC-ARA-04 | 4000000635 | COFARABICA | 10,000 | 20,000 |
| TC-ARA-05 | 4000000636 | COFARABICA | 10,000 | 20,000 |
| TC-ARA-06 | 4000000637 | COFARABICA | 10,000 | 20,000 |
| TC-ROB-01 | 4000000638 | COFROBUSTA | 24,000 | 30,000 |
| TC-ROB-02 | 4000000639 | COFROBUSTA | 40,000 | 50,000 |
| TC-BUT-01 | 4000000640 | COCBUTTER | 25,000 | 1,00,000 |
| TC-BUT-02 | 4000000641 | COCBUTTER | 50,000 | 2,00,000 |
| TC-BUT-03 | 4000000642 | COCBUTTER | 25,000 | 1,00,000 |
| TC-BUT-04 | 4000000643 | COCBUTTER | 12,500 | 50,000 |
| TC-BUT-05 | 4000000644 | COCBUTTER | 12,500 | 50,000 |
| TC-LIQ-01 | 4000000645 | COCLIQUOR | 40,000 | 1,00,000 |
| TC-LIQ-02 | 4000000646 | COCLIQUOR | 60,000 | 1,50,000 |
| TC-LIQ-03 | 4000000647 | COCLIQUOR | 60,000 | 1,50,000 |

**Deals used (USD, so no exchange rate is involved):** 7000000007 and 7000000008 (Arabica, 1,00,000), 7000000022
(Arabica, 40,000), 7000000027 (Robusta, 20,000), 7000000048 (Robusta, 16,00,00,000), 7000000050 (Butter, 4,00,000),
7000000033 (Liquor, 4,00,000).

## Test cases (Trade Flows → Propose Tradeflow, default options: Fewest BLs; Cap the last BL + Partial fill)

| # | Steps | Expected | Run 2026-11-07 |
|---|---|---|---|
| TC01 | Choose 7000000007 | Best match: 1 BL 4000000632 = 1,00,000.00, 0.00% | PASS |
| TC02 | 7000000007, conditions "exclude BL 4000000632", Apply | Best match: 2 BLs 4000000633 + 4000000634 = 1,00,000.00; no proposal uses 4000000632 | PASS |
| TC03 | 7000000022, "only 4000000635, 4000000636" | Best match: 2 BLs 4000000635 + 4000000636 = 40,000.00 | PASS |
| TC04 | Choose 7000000027 | Covers the deal: BL 4000000638 (30,000) capped at 20,000.00 | PASS |
| TC05 | Choose 7000000048 | Partial fill: 2 BLs 4000000638 + 4000000639 = 80,000.00 | PASS (after the default fix) |
| TC06 | Choose 7000000050 | Best match: 3 BLs incl. 4000000641 = 4,00,000.00, 0.00% | PASS |
| TC07 | 7000000050, "BLs above 1L" | Only 4000000641 (2,00,000) may be used: Partial fill 2,00,000.00 | PASS (after the default fix) |
| TC08 | "Show deals with an amount greater than 50K" | Chips "across all deals", "deal amount > 50,000 USD"; 40,000 / 20,000 deals not listed | PASS |
| TC09 | Choose 7000000033 | Best match: 3 BLs 4000000645 + 4000000646 + 4000000647 = 4,00,000.00 | PASS |
| TC10 | 7000000033, "deals above 5 Cr" | "No matching deals or available BLs found for the selected criteria." and no proposal | PASS |
| TC11 | 7000000007, "cocoa butter" | No match: the deal is C132 Coffee Arabica, not Cocoa Butter | PASS |
| TC12 | 7000000007, "amount greater than 50K" | Not applied: say whether it is the deal amount or the BL value | PASS |
| TC13 | Tradeflows Upload, file `TC-007-upload-duplicate.csv`, review only | TC-ARA-01: **Duplicate** (already exists); second TC-ARA-07: **Duplicate** (same key as row 2); TC-BAD-01: **Invalid** (unit KG ≠ COCBUTTER's LBS); first TC-ARA-07: New | for you to run |
| TC14 | 7000000007, open Best match, Assign | 4000000632 assigned (1,00,000); deal Filled; its BLs listed by trade flow; 7000000008 then proposes 4000000633 + 4000000634, never 4000000632 | for you to run (writes to SAP) |
| TC15 | After TC14, in a second browser tab still showing 7000000008 with an old proposal using 4000000632, Assign | Refused: "BL 4000000632 was assigned to Deal ID 7000000007 meanwhile."; nothing written | for you to run |

Defect found and fixed during the run: with the old default (only "Cap the last BL"), a deal larger than all its free BLs
got no proposal (TC05, TC07). Both closest kinds are now selected by default; complete proposals still rank first.

## Run on the 3,516-BL pool (2026-11-07)

3,500 varied bulk BLs (VAR-ARA/ROB/BUT/LIQ-0001..0875, 2,000-60,000 LBS) were added for variety. 7 of 12 cases pass
unchanged. The other 5 now find better answers in the bigger pool, so their expectations were updated (checked by hand):

| TC | New expected (3,516 BLs) | Why it changed |
|---|---|---|
| TC02 | 1 BL 4000003932 = 99,988.00 (-0.01%); no proposal uses 4000000632 | one bulk BL beats the 2-BL answer |
| TC04 | 2 BLs 4000000669 + 4000002481 = 20,003.75 (+0.02%) | small Robusta BLs now make the amount; no cap needed |
| TC05 | Partial fill, 300 BLs (the most per proposal) = 1,66,68,372.74 | far more Robusta BLs to fill with |
| TC06 | Fewest: 2 BLs 4000003594 + 4000003394 = 3,99,998.61 (-0.00%) | fewer BLs than the 3-BL set |
| TC07 | Same 2 BLs; both are above 1,00,000 (1,85,479.74 and 2,14,518.87) | bulk Butter BLs above 1L exist |

## Deals rearranged to 1 deal : 200-300 BLs (2026-11-07, on request)

"A BL should never equal the deal amount; a deal takes 200-300 BLs, which is why the app proposes them." The 40 deals
not confirmed in FX got new amounts (ZDEAL_AMT in the middleware): 200-300 x the commodity's average BL value, +/-3%,
rounded (USD to 1,000; INR to 10,000 at the DS4 rate 46.69 INR/USD). The 37 confirmed deals (ZCONFIRM = X, incl. the
FX-chain deal 7000000083) keep their amounts. Old amounts: scratchpad `deals-amount-backup.json`.
Cases TC01-TC07 above relied on the old small amounts and are superseded for those deals; TC08-TC12 (conditions) still
hold. Live check on the new amounts:

| Deal | Fewest BLs | Closest amount | Oldest trade flows |
|---|---|---|---|
| 7000000006 (Arabica, 1,14,05,000 USD) | 103 BLs, -0.77% | 105 BLs, 0.00% | 208 BLs, -0.48% |
| 7000000007 (Arabica, 1,31,84,000 USD) | 121 BLs, -0.78% | 123 BLs, 0.00% | 238 BLs, -0.82% |
| 7000000009 (Butter, INR) | 122 BLs, -0.69% | 124 BLs, 0.00% | 220 BLs, -0.52% |
| 7000000048 (Robusta) | 125 BLs, -0.56% | 127 BLs, 0.00% | 244 BLs, -0.90% |
| 7000000080 (Butter) | 115 BLs, -0.67% | 117 BLs, 0.00% | 205 BLs, -0.79% |

Fewest BLs takes the bigger BLs first, so it needs about half the average count; Oldest uses the oldest BLs whatever
their size, so it lands in the 200-300 range.
