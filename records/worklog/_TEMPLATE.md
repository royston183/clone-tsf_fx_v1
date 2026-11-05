<!--
  One worklog per activity, kept current while the work runs; it is the handover between sessions.
  Copy to records/worklog/<YYYY-MM>/<YYYY-MM-DD>-<HHmm>-<slug>.md
  HHmm is the 24h local start time; it orders several activities on the same day. Never invent it.
  Evidence for this activity goes in records/worklog/<YYYY-MM>/evidence/<this file's name without .md>/.
-->

# <Activity title>

- **Date:** YYYY-MM-DD
- **Started:** HH:MM
- **Application:** <Project name>
- **System:** DS4_100_TFSIN (DS4 / client 100)
- **Modules:** <module ids>
- **Requested by:** <human> ("<request, verbatim>")

## Scope

<One paragraph: what is built or changed, and what is out of scope.>

## Open questions

| # | Question | Answer | Answered on |
|---|---|---|---|
| 1 | | | |

## Todo

- [ ] 1. Screens listed with Gallery ids and field types
- [ ] 2. Build on sample data (`definition.ts` + `seed.json`, no `source`, no contract)
- [ ] 3. v001 shown (screenshots light and dark + URL); the answer recorded verbatim in `APPLICATION.md` Approvals
- [ ] 4. Each module's source (`sap` or `app`), contract and services (only after 3 is approved)
- [ ] 5. Rules and tests
- [ ] 6. Live read-only check
- [ ] 7. `APPLICATION.md` status and the application log updated (stand-alone; under FS Sprint: `set_milestone`) (proofs: `docs/application-status.md`)
- [ ] 8. Commit (on request)

## Object list

| Object | Type | Package | Transport | Status |
|---|---|---|---|---|
| `FrontEnd/src/modules/<id>/` | MODULE/<kind> | app | — | sample data / `sap` / `app` |
| `ZFS_SB_<Entity>_O4_API` | SRVB | ZFS_<AREA>_<APP> | <transport> | built / published |

Every RAP object built for this application is listed here, one row each (names: `docs/naming-conventions.md`). The columns match SAP Development's worklogs.

## Delivery checks

- [ ] UI approved on sample data, before any SAP or database read (`APPLICATION.md` Approvals, verbatim)
- [ ] Look from ALM: `FrontEnd/src/styles/*.css` unchanged, ALM class names only
- [ ] Login kept (`/login`, `demo` / `demo` and the captcha); SAP account in Settings → SAP Connection
- [ ] Structure and stack as `docs/stack-and-structure.md` (the conformance test in `verify` passes); SAP only from the browser, through the relay; the FrontEnd static
- [ ] Every `check()` runs in the browser before every write, and again in the BackEnd for `app` modules
- [ ] `sap-client=100`, `srvd_a2x` URLs, `$batch` with one changeset, ETag from `@odata.etag`
- [ ] `npm run verify` green
- [ ] `npm run e2e` green
- [ ] `npm run test:live` read-only PASS on DS4 / client 100 (or "n/a: no SAP module", with the reason)
- [ ] No write to SAP without explicit approval (or "n/a: read-only")
- [ ] `.env.local`, `DB/app.db`, `.mcp.json` not committed

## Evidence

Screenshots on sample data go in `records/worklog/<YYYY-MM>/evidence/<this file's stem>/` and are committed.
Screenshots with live SAP data go in `records/evidence/` (git-ignored).

## Lessons raised

Entries added to `records/lessons/lessons-ledger.md` during this activity: L-…
