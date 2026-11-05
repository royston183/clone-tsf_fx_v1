# TSF_FX: project instructions

This application is built on the SAP Standalone Application **template framework**; its rules below apply unchanged.

## This application
This is **TSF_FX**, built from the SAP Standalone Application template @ f36965f.
Application type: **FE + BE + DB**. UI template: **Tile theme**. Reference project: D:\SAP Tool\TSF - FX Application. System: DS4_100_TFSIN (DS4 / client 100).
Build user-requested page layouts directly; the UI template is a starting point, not a restriction on page design.

**Keep its records current** (same pattern as SAP-Project-Development V1 and SAP-Testing-Automation):
- `APPLICATION.md`: identity card, modules, screens, approvals (verbatim), SAP services, status history.
- One worklog per activity in `records/worklog/<YYYY-MM>/YYYY-MM-DD-HHmm-<slug>.md` (from `_TEMPLATE.md`),
  kept current during the work; its evidence beside it in `evidence/<stem>/`.
- Test cases in `records/test-cases/`, one run record per run in `records/results/` (git-ignored).
- Lessons in `records/lessons/lessons-ledger.md`, written in the same turn.
- Each status change (UI approved, SAP connected, Live-checked, Handed over) goes in `APPLICATION.md` and in the
  template's `docs/application-log.md` (row and status history); `docs/application-status.md` says what proves it.

## Deploying when the build is done (always)
When an FE + BE + DB or Front end only application is fully built (UI approved, SAP connected where required, and
`npm run verify` green in the application folder), **do not stop at "done". Ask once, with the question tool:
"Deploy it now? This opens GitHub sign-in, creates a private repository, pushes `main`, and GitHub Actions deploys
`main` (frontend, backend and database) to Azure."** (Yes / Not now.)
- **Not now** → say `npm run deploy` in the application folder does it later.
- **Yes** → in the application folder run `npm run deploy -- --yes` (the Yes is the confirmation; do not ask again).
  It opens the browser for GitHub sign-in when needed, commits, re-verifies, creates the private repository, stores
  `PROVISIONER_KEY` as an encrypted Actions secret, creates the MySQL database and the Function App
  (infrastructure only), pushes `main` and `develop`, then waits for the **Deploy** workflow
  (`.github/workflows/deploy.yml`), which verifies, builds and publishes `main` on GitHub Actions, and prints the
  live URL. Builds are never uploaded from the local folder: Azure only ever receives what is on `main`. Secrets
  come from the template's `.env` / `.env.local` (`PROVISIONER_BASE_URL`, `PROVISIONER_KEY`); never print them.
- Report back only the **Live URL** (and the Backend URL), plus the one-time MySQL admin login the script shows. If
  a step fails after the push, name the repository, the error and the Actions run link, fix the cause and run it
  again: it reuses the repository and Azure resources. Never work around a failure by editing the deploy scripts in
  the application; fix them in the template.
- Not for FS Sprint runs: see "When run by FS Sprint".

## Changing a deployed application (always)
An application that has been deployed has a GitHub `origin`, and `main` is the only source of its deployments.
- **Before changing anything**, bring the folder up to date with the latest `main`: `git pull --rebase origin main`
  (Git Credential Manager signs in when needed). Never build on a stale copy, and never force-push `main`.
- Make the requested change, keep the same rules as the first build (UI approval for new screens, the SAP rules, the
  records), and run `npm run verify` until it is green.
- Then ask once, with the question tool: **"Deploy this change? It is committed, replayed on the latest `main`,
  pushed, and GitHub Actions deploys `main` to Azure."** (Yes / Not now). When the request itself already said to
  deploy, that is the Yes. Yes → `npm run deploy -- --yes`: it commits, rebases onto `origin/main`, re-verifies,
  pushes `main` and waits for the Deploy run (when `main` already has the commit, it starts the workflow on `main`).
  Not now → the change stays local; say `npm run deploy` publishes it later.
- If the rebase stops on a conflict, nothing is pushed: resolve it (`git pull --rebase origin main`), verify again and
  rerun. A push to `main` from anywhere else (the GitHub web editor, a merged pull request) deploys the same way.

## UI approval first
Then:
- **No reference project** → build from this template: copy its structure (`FrontEnd/`, `BackEnd/`, `DB/` as the
  application type says; shell, ALM CSS, SAP OData client, Workbench, field types, UI kit, settings) into the target folder and add the requested modules (see `docs/how-to-add-an-application.md`).
- **Reference project given** → first understand the reference project end to end (features, screens, data flow,
  SAP services, validation rules), then build the new application based on it, using this template's structure and
  the user's requested design.

**UI approval comes first, always.** Build the requested screens in the target folder on sample data only,
before any SAP or database read: module definitions with their sample data (no `source`, no SAP contract, no
own-data table yet), or custom page components with sample data. Show screenshots and the local URL.
**Stop until the user approves the UI.** Only then give each module its source, `sap` (an OData service, through the
relay) or `app` (the application's own data), and add the SAP contract and services, the rules, tests and the live
read-only check.

Reuse the UI Gallery (`/gallery`, items such as `F-amount`, `D-form`, `B-toast`) where it fits. Build custom layouts
directly in `FrontEnd/src/pages/`, register them in `src/pages/registry.ts`, and reference them with a catalogue
node's `page` field (`docs/how-to-add-an-application.md`). A page may supply its own heading and scoped styles and
compose module screens. The available module kinds and Gallery items do not limit what a page can do.

Reusable new controls belong in shared components and, where useful, the application's Gallery (listed in
`FrontEnd/src/components/gallery/ids.ts`, with new sections in `GALLERY_SECTIONS`; `FrontEnd/tests/unit/gallery-ids.test.ts`
and `galleryItem()` enforce registered items). Record reusable pieces as a template candidate. A one-off custom
page does not need a separate Gallery item or component approval before being built and shown for screen approval.

## Non-negotiables

**Report and modal design:** follow `docs/report-template.md` for every B/C report and custom page: layout options
on the right, separate collapsible selections, a connected report overview, titled modal input sections, numbered
wizard progress for multi-stage actions, and labelled green/amber/red status tags. Reuse the shared components.
- **Structure and stack are fixed** (`docs/stack-and-structure.md`): the root holds `FrontEnd/` (Vite + React, built to
  `FrontEnd/dist`), `BackEnd/` (Node 22 LTS + Fastify, built to `BackEnd/dist`) and `DB/` (SQLite: `DB/schema/`
  numbered migrations, `DB/app.db` built from them), or `FrontEnd/` alone in a Front end only application. Node 22
  LTS for the BackEnd and all tooling, every version exact, no library outside the approved list, no other
  application folder. `FrontEnd/tests/unit/conformance.test.ts` enforces it in `verify`; a new library or folder is a
  template change first.
- **The browser calls SAP through the relay**, in both application types (`FrontEnd/src/core/sap/client.ts`, at
  `VITE_SAP_RELAY_URL`, default `http://localhost:3001`; the relay is built separately). The BackEnd never calls SAP:
  no SAP host, user, password, service URL or SAP import in `BackEnd/`. The only other host the BackEnd calls is a REST
  data service listed in `FrontEnd/src/config/rest-services.json` for `rest` modules (docs/how-to-add-an-application.md §1b). **The FrontEnd is static:** nothing serves an
  API at its own origin and no code calls one (no `/api` route, request interceptor or Vite proxy).
- The FrontEnd and the BackEnd run on two ports (3100 and 3200). Only `FrontEnd/src/lib/client/backend-api.ts` calls
  the BackEnd, without cookies, naming the acting user in `x-app-user`; the BackEnd allows only the FrontEnd's origins
  (CORS) and every write needs the `x-app-request: 1` header. **Demo only: the BackEnd has no authentication.** Any
  client that reaches it can read and write the application's own data and claim any `x-app-user`; CORS and
  `x-app-request` only stop browsers. Production hardening is done by hand, per application.
- The default look and shared controls come from ALM Central (reference, when present on this PC: `D:\SAP Tool\SAP - ALM Application`).
  Keep the copied ALM stylesheets as the baseline. User-requested pages may add scoped styles and custom components;
  the default layout and ALM classes do not restrict the requested design. Check custom layouts in light and dark,
  on narrow screens, and with keyboard navigation.
- **Every application has the login page (`/login`)** with its captcha. The workspace login is `demo` / `demo`,
  checked in the browser: a gate for the screens, not a security boundary. The SAP account is separate: the build's
  default (`VITE_SAP_USERNAME` / `VITE_SAP_PASSWORD` / `VITE_SAP_CLIENT`) or another one for the tab, saved in
  Settings → SAP Connection with Test & save (checked against SAP through the relay). Never drop or simplify the login
  or its captcha.
- **The tables of `app` modules are generated** from their definitions (`<module>__<table>`, one per module table):
  `npm run gen-schema` writes them into `DB/schema/NNNN_app_tables_<hash>.sql` (`DB/README.md`). Never write or edit SQL
  for module tables and never edit a generated migration; change the module definition instead. `npm run verify`
  runs `npm run gen-schema -- --check`: it fails when `DB/schema` is behind the definitions or a pushed (frozen)
  definition changed; restore that definition, or add a new field.
- Every module's `check()` rules run in the browser before every write. The authority is
  SAP for SAP data, the BackEnd for the application's own data (it runs the same `check()` again; in a Front end
  only application, the browser's own store).
- The React Compiler lint rules are errors (no synchronous setState in effects, no impure calls or ref reads during
  render). Navigation goes through `FrontEnd/src/lib/client/nav.tsx` (`useRouter`, `usePathname`,
  `useSearchParams`, `Link`).
- Secrets come from the process environment (FS Sprint supplies them) or, when run stand-alone, from `.env.local`. Never write secrets into any other file. Never commit `.env.local`, `.mcp.json`, `.claude/settings.local.json`, `DB/app.db`. `VITE_*` values are built into the page: `VITE_SAP_USERNAME` / `VITE_SAP_PASSWORD` are for local builds
  only (the deploy pipeline never passes them); never put any other secret in one.
- Writes to a real SAP system only after the user explicitly approves them.

## SAP rules (from SAP Development's lessons)
- `sap-client=100` on every call; service URLs use `srvd_a2x`; OData V4 Web API bindings `ZFS_SB_<Entity>_O4_API`.
- `$batch` = multipart/mixed with one changeset; ETag from `@odata.etag`; decimals as JSON numbers.
- New RAP objects follow `docs/naming-conventions.md` (`ZFS_*`, no `$TMP`, the name checked before each create) and
  are listed in the application's worklog Object list.

## Commands
- `npm run install:all` · `npm run dev` (FrontEnd 127.0.0.1:3100, BackEnd 127.0.0.1:3200) · `npm run verify` ·
  `npm run e2e` · `npm run test:live` · `npm run gen-schema` · `npm run build-db` · `npm run deploy`
