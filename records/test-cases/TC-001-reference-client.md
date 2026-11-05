# TC-001 · Reference service routing and request lifecycle

- **Case id:** TC-001
- **Lane:** unit
- **Module / screen:** reference FX compatibility layer
- **Spec files:** `FrontEnd/tests/unit/ref-api-client.test.ts`, `ref-request-task.test.ts`, `ref-xlsx.test.ts`
- **System:** fake transports and in-memory workbooks
- **Type:** regression
- **Author:** Codex
- **Created:** 2026-11-05
- **Status:** active
- **Writes to SAP:** no

## Purpose

Verify that imported clients preserve service behavior across the relay/backend boundary,
cancel obsolete work, and read the workbook format produced by their exports.

## Preconditions

Node 22 LTS and installed application dependencies. Tests replace network transport.

## Steps and assertions

| Action | Expected |
| --- | --- |
| Request a SAP service and perform a fake write | Relay URL, client 100, account authorization, CSRF and ETag handling |
| Request middleware/local table routes | Separate backend URL, acting-user/write headers, original body and upstream errors |
| Request a notification | No network call; explicit stub response |
| Cancel before a queued request starts | Loader is never called |
| Cancel a started request | Its cleanup runs once |
| Export and re-read a workbook/blotter template | Dates, values, sheets and leading-zero codes preserved |
| Select a binary XLS file | Actionable instruction to save as XLSX |

## Writes and cleanup

None outside fake transports and memory.

## Run history

- 2026-11-05 · PASS · 17 tests; Node 22.23.4.
