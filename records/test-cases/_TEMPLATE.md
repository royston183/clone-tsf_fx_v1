<!--
  One test case per file: records/test-cases/TC-<nnn>-<module>-<slug>.md (nnn: next free number, never reused).
  Committed. Each run writes a run record in records/results/ and adds a line to Run history below.
-->

# TC-<nnn> · <module>: <what this case proves>

- **Case id:** TC-<nnn>
- **Lane:** unit | integration | e2e (relay stub) | live-read | live-write
- **Module / screen:** <module id> · <URL path>
- **Spec file:** `FrontEnd/tests/<lane>/<name>.test.ts` | `BackEnd/tests/<lane>/<name>.test.ts` | `.spec.ts`
- **System:** sample data | DS4_100_TFSIN (DS4 / client 100)
- **Type:** smoke | functional | negative | regression
- **Author:** <name>
- **Created:** YYYY-MM-DD
- **Status:** draft | active | frozen
- **Writes to SAP:** no | yes: <what is created or changed; approved by <name> on YYYY-MM-DD>

## Purpose

<One sentence.>

## Preconditions

| # | Condition | How to check |
|---|---|---|

If a precondition cannot be met, the verdict is **BLOCKED**, not FAIL.

## Test data

| Field | Technical name | Value | Source (seed.json / SAP key) |
|---|---|---|---|

## Steps

| # | Action | Element / argument |
|---|---|---|

## Assertions

| # | Field / source | Expected | Read with |
|---|---|---|---|

Every assertion names a field and an expected value. "Works correctly" is not an assertion.

## Writes

<What this case creates or changes in SAP, or "None.">

## Cleanup

<How created records are reversed or left in place, or "None.">

## Known deviations

None.

## Run history

| Date | Result | Result file | Notes |
|---|---|---|---|

A case is frozen only after two PASS runs with no deviations.
