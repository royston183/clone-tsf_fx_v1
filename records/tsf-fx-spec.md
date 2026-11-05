# TSF FX — screen spec (UI round v001)

Reference: `D:\SAP Tool\TSF - FX Application` (apps/web/src/features/*, config/fx-menu.json, config/apps.json).
Scope: the FX Structure menu and the FX reports. All screens run on sample data until the UI is approved.

## How records open (per module, from its data)

| Module | Setting | Choice | Reason |
|---|---|---|---|
| `master-contract` | `opens.create` | page | About twenty fields in four groups plus the six child contracts: too much for a pop-up. |
| `master-contract` | `opens.open` | page | Same record: details tab and child contracts tab. |
| `tsf-deals` | `breakdownOpens` | popup | A deal line is one read-only record with no items. |
| `commodity` | `opens.create` / `opens.open` | popup / popup | Four fields (code, description, unit, currency), no tabs or items. |
| `commodity-price` | `opens.create` / `opens.open` | popup / popup | Three fields (commodity, effective from, price); currency and unit come from the commodity. |
| `tradeflow` | `opens.create` / `opens.open` | popup / popup | Read-only view of one trade flow with its one Bill of Lading (two tabs, no editing); trade flows are created only by the upload. |
| `tradeflow-upload` | upload flow | as is | The template's upload flow (choose file → review rows → post). |

The custom pages (FX Blotter, Trader Workbench, Deal Confirmation, Execute Settlement) open their records in pop-ups
(View Transaction, Deal {id}, Confirm Deal, Transaction / Trade Invoice Settlement), as the reference screens do; the
two-leg release on the blotter is a three-step wizard (check legs → choose master contract → generate Deal ID) because
each step depends on the one before.

## Data, once approved

| Screen | SAP (through the relay) | Application's own data (BackEnd, Azure MySQL deployed) |
|---|---|---|
| FX Blotter | `FxTransaction` create / reverse (ZFS_SB_TRMFX_O4_API), `TrmFxApp` status | Deal IDs (ZSGTSFTR_DEALID), day lock (ZSGTSFTR_DAYLOCK), master contract balance |
| Trader Workbench | `FxTransaction`, `TrmFxApp`, NDF fixing action, exchange rates | IN_SPOT, SS_SPOT, action texts (TRDWAI) |
| Deal Confirmation | `FxTransaction` Settle action, `TrmFxApp` status 07 / 04 | — |
| Execute Settlement | `TrmFxApp` bank fields | trade position (TRD_POS), posting types (TRD_ACC), SET_FX, Deal ID status |
| Master Contract | — | master contracts (ZSGTSFTR_MAS_CON) and children (MC_CHILD) |
| TSF Deals report | `TrmFxApp` joined to `FxTransaction` | Deal ID P&L, master contract |

## Template candidates raised

- `rate` report column type (right-aligned, fixed decimals, never scaled or summed): added in this app's
  `lib/report/types.ts`, `report.ts`, `export.ts`, `layout.ts`, `AlvGrid.tsx`, `ReportGrid.tsx`, `table-layout.ts`.
- `FxTable` (`FrontEnd/src/pages/fx/FxTable.tsx`): DataTable with sort, single/multi select and paging for custom pages.
- `.ds-modal .ds-table { width: auto }` (workbench.css) squeezes wide DataTables inside modals; the FX pages restore
  `--kit-table-width` in `fx.css`.
