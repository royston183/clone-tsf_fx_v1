# Manage Tradeflows and Propose Tradeflows

Requested 2026-11-05 by karth (verbatim):
> in Manage Tradeflow i should be able to see the Trdeflow list same like tradeflow list with price and value. intially when we uploaded by default every trade flow have 1 BL. but in manage trade flow i should be able to delete the created BL and create a new bl with multiple bl's also within the Value and quantity. build a better intuitive to do that.
> in Propose tradeflows you have to show the list deal id with the deal id amt, we can assign BL's which is not assigned to deal id , based on the deal id value and commodity and give a mutilple different possiblities of different BL's to match the BL amounts to the deal id amount.

Answers: "so propose tradeflows going to pure AI suggested BL proposals …" · "go with the hybrid, real AI inside the app" ·
"for example u can ask how many BL's required … quantity and value should not exceed as per the main tf value" ·
"convert to USD, allow 1% tolerance. for delete BL's keep a delete flag field instead of deleteing the entries from the table" ·
"take a commodity based on the SAP TSF fx commodity list" · "yes add TSF FX commodity field in maintain commodity" ·
"multiple rounds, show the remaining amount" · "go ahead" (design and data sent to Anthropic).
Also: "additonally as a seperate agent in the tiles if u feel show some values based on the tiles data will look i think".

Design: `docs/superpowers/specs/2026-11-05-manage-propose-tradeflows-design.md` · Plan: `docs/superpowers/plans/2026-11-05-manage-propose-tradeflows.md`
Branch: `feat/manage-propose`.

## Todo

- [x] Items tabs whose keys SAP assigns (`keyBySap`): template candidate
- [x] `tradeflow-manage` module and split rules; Manage Tradeflows page (split, add BLs, delete flag, show deleted)
- [x] Matching engine (`lib/propose/match.ts`); Propose Tradeflows page on sample data
- [x] Tile figures (subagent)
- [ ] UI approval (screens below)
- [ ] Part B: template change (Anthropic host), BackEnd `/api/ai/proposals`, SAP changes (BL [0..*], delete flag,
      AssignedUsd, TsfCommodity), TSF FX Commodity field, `bl-assign`, live Propose data, live check and write test

## Evidence

`records/worklog/2026-11/evidence/2026-11-05-manage-propose/`: Manage list, record (with deleted BL shown), split steps 1–2 and an over-limit split; Propose deal list,
proposals with preferences, and a deal without a USD rate. Light, dark and 390 px.
