<!--
  One run record per run: records/results/TC-<nnn>-<YYYY-MM-DD>-<HHmm>[-tag].md. A clash gets -2, -3.
  Never edited after the run. Git-ignored (it can hold SAP business data); only this template is committed.
-->

# TC-<nnn> · run <YYYY-MM-DD HH:mm>

- **Case:** `records/test-cases/<file>.md`
- **System:** sample data | DS4 / client 100 · **confirmed:** yes | no
- **SAP user:** <user> | — (sample data)
- **Command:** `npm run ...`
- **App commit:** <short hash>
- **Run by:** <name>
- **Verdict:** PASS | FAIL | BLOCKED | PARTIAL

Only PASS counts as passed.

## Assertions

| # | Expected | Observed | Result |
|---|---|---|---|

A value that could not be read is `NOT OBSERVED`, never a plausible guess.

## Steps executed

| # | Step | Outcome (ok / skipped: reason / error) |
|---|---|---|

## Deviations

None.

## Documents created

| Type | Number | Left in place? |
|---|---|---|

## Evidence

| File | Shows |
|---|---|
