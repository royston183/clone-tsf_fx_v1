# TC-008 Demo script: Propose Tradeflow and invoice review (2026-11-07)

For a live demo on DS4 (client 100). The data: 3,516 BLs over four commodities (Cocoa Butter, Cocoa Liquor, Coffee
Arabica, Coffee Robusta), 40,000–86,000 LBS each, prices 0.38–1.05 USD/LBS, 8 contracts and 6 notify parties per
commodity, BL dates 01-08-2026 to 01-11-2026. Each open Deal ID needs 300–500 BLs. Numbers below are from the live run
of 2026-11-07; they move as BLs get assigned.

## Part 1: the problem (Propose Tradeflow)

| # | Do | Say / expect |
|---|---|---|
| 1 | Trade Flows → **Propose Tradeflow** | The loading screen shows the client's product lines (Cocoa, Coffee, Nuts, Spices, Dairy). |
| 2 | Choose **7000000006** (Coffee Arabica, 23,924,000 USD left) | "This deal needs over 300 BLs. Nobody picks those by hand." The tabs: **Proposals** and **Assigned BLs**. |
| 3 | Read the proposals | Each row is a different way to fill: **Fewest BLs** (≈317 BLs, −0.78%), **Closest amount** (≈320 BLs, 0.00%), **Oldest BLs** (≈406 BLs, BL dates 01-08 → 06-09). Columns show BLs, contracts · parties and the BL date span: the trade-offs to weigh. |
| 4 | Turn **Oldest trade flows** off and on in *Fill with* | The chip changes at once ("Updating proposals…" while the list follows); the last option cannot be turned off. |

## Part 2: the bar (type anything, Apply)

Click a **Try** example to apply it at once, or type and press **Apply** (an empty bar applies the example it shows).
Every condition becomes a chip; **×** removes one, **Clear conditions** removes them all, and **Clear all** (next to *Fill with*) also turns every way of filling back on. Amounts read 23,924,000.00 with the short form beside them (23.9M).

| # | Type | Expect |
|---|---|---|
| 5 | `exclude BLs 4000000976 to 4000001328` | Chip "exclude BLs 4000000976 – 4000001328"; no proposal uses them. |
| 6 | `skip Northwind` | Chip "exclude notify party Northwind Beverages" (the name is found in the data). |
| 7 | `only contract ARA-CTR-2601, ARA-CTR-2602, ARA-CTR-2603, ARA-CTR-2604` | Proposals keep to those 4 contracts (≈400 BLs). |
| 8 | `BLs older than 60 days` | Only BLs dated before 08-09-2026. |
| 9 | `fill 50%` | "Aiming at 11,962,000 USD": proposals of ≈165–200 BLs. |
| 10 | **Clear all**, then `propose 1 Cr only, at most 150 BLs` | Proposals of 120–150 BLs at 10,000,000 USD. |
| 11 | `don't use BL <a number from the list>` | That BL leaves every proposal. |
| 12 | `show deals above 2.5 Cr` | The Deal ID list keeps only those deals ("across all deals"). Clear it after. |
| 13 | Anything else, e.g. `BL date from August to September`, `ETA before 30 Nov 2026`, `BLs above 80K`, `quantity above 60000 LBS` | A chip says what was applied; a part the app cannot place says "Not applied" and is never guessed. |

Other forms it reads: `only BLs between 4000001000 and 4000001600`, `must include BL …`, `exclude trade flow 3000…`,
`shipped before 01 Nov 2026` (ETD), `BL reference VAR-ARA-00*`, `exclude invoice VAR-INV-12`, `at least 300 BLs`,
`oldest first`. **What can I type?** under the bar lists them.

## Part 3: review and assign

| # | Do | Expect |
|---|---|---|
| 14 | Open proposal 1 | Effect on the deal (remaining now / after), Quantity, Match; the BLs with BL reference, BL date, quantity and value; **Total** row with quantity and USD. |
| 15 | Untick 2 BLs → **Re-propose without 2 BLs** | A chip "exclude BL …"; new proposals without them. |
| 16 | (Writes to SAP: only with approval) **Assign N BLs** | Deal shows under **With BLs**; the **Assigned BLs** tab lists them with the quantity total. An assignment is final. |

## Part 4: invoice (FX Mid-Office → FX Trade Invoicing → MO: Generate Invoices for Deal ID)

| # | Do | Expect |
|---|---|---|
| 17 | Deal ID **7000000074** | Panel **BLs assigned to this Deal ID**: 142 BLs · 10,817,154.149 LBS · 9,951,781.80 USD. |
| 18 | **Review & confirm invoice** | Steps **1 Review BLs** (the 142 BLs with totals) → **2 Check amounts** (FX deal 10,000,000 USD; BLs −0.48% within 0.50%; invoice amount and full / partial) → **3 Confirm**. |
| 19 | (Writes: only with approval) **Confirm invoice generation** | The compliance check, then the invoice is generated (the screen's existing save). |

At other statuses the button stays off and the panel says why (it opens at status 04).
