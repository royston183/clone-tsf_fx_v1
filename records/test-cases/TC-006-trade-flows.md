# TC-006 · Master Data and Trade Flows (commodity, price, upload, list)

- Date: 2026-11-05
- Writes to SAP: yes, on NIIF (DS4 / 100) through ZFS_SB_TRADEFLOW_O4_API. The live write test was approved:
  "yes run the live write test".
- Specs: commodity.test.ts, commodity-price.test.ts, tradeflow.test.ts, tradeflow-upload.test.ts,
  tradeflow-odata.test.ts, trade-flows-catalog.test.ts, e2e trade-flows.spec.ts (stub tradeflow-stub.ts); SAP ABAP
  Unit ZCL_FS_SLC_TFPRICE_TEST.

Assertions:
1. Master Data and Trade Flows follow Overview on the rail. Their tiles: Maintain Commodity; Tradeflows Upload,
   Tradeflows List, Update Price, Manage Tradeflows (placeholder).
2. A commodity needs a unit of LBS, KG or MTS and a 3-letter currency. A price needs a maintained commodity and a
   value greater than 0; its currency and unit come from the commodity.
3. The upload reads TF.xlsx exactly: every heading, `#` ignored, Excel dates, long references, an empty Contract
   Date. It refuses an unmaintained commodity, a unit other than the commodity's, a quantity of 0 or less, and a BL
   Number that appears twice in the file or is already stored.
4. SAP numbers each trade flow (TF No from ZSGTSFNR02, TF Date = upload date) and creates exactly one BL, with BL No
   from ZSGTSFNR05 and BL record date = upload date, copying every shipment field.
5. Price = the latest price of the commodity on or before the TF date. Value = quantity × price, rounded to
   2 decimals (264554.93 × 2.15 = 568793.10). With no price, Price and Value are empty and an amber "No price" tag
   shows.
6. Re-uploading the same file refuses every row as a duplicate.

Run history:
- 2026-11-05: unit and e2e PASS (116/116 e2e); ABAP Unit 4/4. Live write on NIIF PASS (details in
  records/results/TC-006-2026-11-05-*.md, git-ignored): ALMOND + price 2.15 created; 10 trade flows
  3000000015–3000000024 with BLs 4000000012–4000000021, each priced 2.15 with the value right; re-upload refused 10/10.
