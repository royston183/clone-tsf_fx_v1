# TC-002 · All imported FX screens render in the workspace

- **Case id:** TC-002
- **Lane:** e2e (relay stub)
- **Module / screen:** 39 entries in `FrontEnd/src/ref/port-manifest.json`
- **Spec file:** `FrontEnd/tests/e2e/reference-port.spec.ts`
- **System:** production frontend build, empty fake middleware results, relay stub
- **Type:** smoke
- **Author:** Codex
- **Created:** 2026-11-05
- **Status:** active
- **Writes to SAP:** no

## Purpose

Check that every imported menu entry loads its actual reference component while retaining
workspace navigation, login and theme behavior.

## Preconditions

Microsoft Edge installed, Node 22 LTS, application dependencies. Playwright uses isolated
ports 3300/3301 and an in-memory backend. The real SAP relay is blocked; reference backend
requests are intercepted.

## Steps and assertions

| Action | Expected |
| --- | --- |
| Sign in with demo credentials and the displayed captcha | Workspace opens |
| Open every imported catalogue address | Reference wrapper and Back control visible, no uncaught browser error |
| Check the workspace around each imported screen | Rail and Sign out remain visible |
| Check imported screen images | Every rendered image has decoded dimensions |
| Select Night, set viewport to 768px, open Limit Management | Dark theme persists and screen title is visible |
| Open Set Initial Limit, focus Close and press Enter | Dialog opens, then closes through the keyboard |
| Load a master-contract fixture with an amount | Numeric heading and amount right edges align within 2px |
| Set phone width to 390px | All master-contract toolbar filters remain within the viewport |
| Open short-straddle and NDF Fixing on a phone | Heading wraps; NDF action row follows the filters and title |

## Writes and cleanup

No live writes. Playwright closes its browsers and isolated servers.

## Known deviations

This is rendering/navigation coverage against empty upstream results, not a proof that all
business APIs exist or that live posting works. Some reference screens intentionally display
WAITING FOR API. Live read-only screenshots are stored separately under `records/evidence/`.

## Run history

- 2026-11-05 · PASS · All 9 reference-screen cases passed within the final complete
  Playwright run (105/105). Includes all 39 imported routes, image decoding, dark
  limit dialog, phone heading/action flow and numeric heading/filter alignment.
