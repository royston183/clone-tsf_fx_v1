# Application status

Every application built from this template moves through these statuses, in this order:
Started → UI approved → SAP connected → Live-checked → Handed over (or Retired, from any status).

A status is reached only when its proof exists. When FS Sprint runs the application, FS Sprint checks the proof
itself in its proof ledger (`records/proofs.jsonl`, written only by FS Sprint) and refuses a status without it.
Stand-alone, the proof is recorded by hand in the places named in the last column.

| Status | Reached when | Proof when FS Sprint runs it | Proof when stand-alone |
| --- | --- | --- | --- |
| Started | The template is copied, `APPLICATION.md` is filled and the log row is added | The first ledger entry (`started`), written by the New application form | Template commit in `APPLICATION.md`; the first worklog |
| UI approved | The person approves the screens on sample data, before any SAP or database read (light and dark screenshots); the answer is kept verbatim | An `approve_ui` entry with verdict `approved` | `APPLICATION.md` Approvals; screenshots in the worklog evidence |
| SAP connected | `FrontEnd/src/config/services.json` lists at least one service, each service's binding passes its OData API test through the relay, and `npm run verify` passes on the current sources | A `test_api` PASS for every service's binding, and a `verify` PASS whose source hash equals the current one | Settings → SAP Connection: Test & save through the relay, then Test connection passes for every service; `APPLICATION.md` SAP services (Verdict column); integration test cases PASS |
| Live-checked | `npm run test:live` (read-only) passes: no failure, at least one passed test, every service in `services.json` read at least once, and no source change since the last verify | A `test_live` PASS after the last `verify` PASS, with no source change in between | `records/results/TC-*.md` with verdict PASS |
| Handed over | The Application Handover is written and every Todo and Delivery check in the build worklog is ticked | A Handover document entry, and every Todo and Delivery check in the build worklog ticked | `APPLICATION.md` Handover filled; every Todo and Delivery check ticked |
| Retired | A person says the application is no longer used | Set by a person on the Applications page, recorded with their name | Status history line with the person's name |

Only PASS counts as passed. Under FS Sprint, proofs come only from FS Sprint's own tool runs. A ledger entry that
fails verification is shown as unverified and never counts. FS Sprint writes the Status line, Status history,
Approvals and the SAP services Verdict column of `APPLICATION.md` from the ledger, between its `fs-sprint:begin` and
`fs-sprint:end` markers. An edit there is overwritten and never changes a status.
