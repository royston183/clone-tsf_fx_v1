# TSF_FX

Built from the SAP Standalone Application template @ f36965f. Records: `APPLICATION.md` and `records/`.

The template for SAP web applications: a **FrontEnd** (Vite + React), a **BackEnd** (Node 22 + Fastify) and a **DB**
(SQLite), built on the framework of ALM Central (same shell, navigation rail that expands and collapses, tiles,
tables, sorting, filters, dialogs and light/dark themes) and integrated with SAP S/4HANA through OData V4 RAP services.
It is the reference project for every new SAP web application: new requirements are built here, on this structure
(`docs/stack-and-structure.md`). The FrontEnd is a static site whose browser code calls SAP through the local SAP
relay (`http://localhost:3001`, on the user's own PC, on the VPN; built separately). It opens on ALM's login page
(`demo` / `demo` and a captcha), and every SAP call runs as the SAP user set in Settings → SAP Connection, with that
user's SAP authorizations. The BackEnd keeps only the application's own data.

Sample application: **Master Data → Time Buckets** (`ZFS_SB_ALMTIMEBKT_O4_API`).

New applications use the **Tile Based Template** by default, with no template-choice prompt. User-requested pages
can use custom layouts, components and scoped styles within the same workspace. Use a catalogue node's `page` and
`FrontEnd/src/pages/registry.ts` for a custom screen; see `docs/how-to-add-an-application.md`, section 2c.

## Run

```powershell
npm run install:all
copy .env.example .env.local   # optional: VITE_SAP_USERNAME / VITE_SAP_PASSWORD as the default SAP account
npm run dev                    # FrontEnd http://127.0.0.1:3100 (opens the login page), BackEnd http://127.0.0.1:3200
```

Sign in with `demo` / `demo`. Modules still on sample data keep it in memory; the application's own data (`app`
modules, such as Deals) lives in the SQLite database `DB/app.db`, in tables generated from the module definitions
(`npm run gen-schema`, `DB/README.md`), seeded with sample rows on first use. SAP modules (`sap`, such as Time
Buckets): connect the VPN, start the relay and use the SAP account from `.env.local`, or enter one in Settings → SAP
Connection and choose Test & save.
In development (or while no module reads SAP) `/gallery` shows every field, dialog and feedback piece with sample data.
With the Gallery enabled the rail shows **Samples**: Deals (large list with layouts + object page), Monthly Amounts (header + items), Budget Upload (upload & preview), Liquidity Statement (formatted report), Cash Flow Lines (line items with ALV layouts) and Treasury Overview (dashboard).

A **Front end only** application (`-AppType FrontEnd`) has the FrontEnd alone: SAP through the relay as above, and the
application's own data in browser storage (`docs/stack-and-structure.md`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | FrontEnd (Vite, 127.0.0.1:3100) and BackEnd (Fastify, 127.0.0.1:3200), wired to each other |
| `npm run verify` | Per folder: typecheck, lint, unit + integration tests (with the conformance check), production build |
| `npm run e2e` | Playwright end-to-end tests in Microsoft Edge on the builds (ports 3300 / 3301; the relay is a stub inside the tests) |
| `npm run test:live` | Read-only check against the real SAP system, through the relay, with the SAP account in `.env.local` |
| `npm run build-db` | Builds `DB/app.db` from `DB/schema/` |
| `npm run deploy` | Browser GitHub sign-in, private repository, push to `main`; GitHub Actions deploys `main` to Azure |

## Deploy after verification

Put `PROVISIONER_KEY` in the uncommitted `.env.local` file, run `npm run verify`, then run `npm run deploy`. The
terminal asks **Deploy it now?**. On confirmation, Git Credential Manager opens GitHub in the browser, the signed-in
account receives a private repository (`main` plus `develop`), MySQL and the Node 22 Function App are provisioned,
and `main` is pushed. The **Deploy** GitHub Actions workflow then verifies, builds and publishes `main`: Azure only
ever receives what is on `main`, never a local build, and the deployed page carries no SAP account. Later changes
deploy the same way: `npm run deploy` replays them on the latest `main` and pushes. The terminal finishes with the GitHub, backend, and live website URLs. See
`docs/deploy-end-to-end.md` for configuration, security behavior, and failure recovery.

## Structure

```
FrontEnd/            Vite + React, static: src/App.tsx (pages), components/ (ALM classes), modules/, lib/, styles/ (ALM's CSS)
  src/core/          the SAP OData V4 client (sap/) and the screen services, shared with the BackEnd (never sap/)
  src/lib/client/    data.ts (the one data client), backend-api.ts (the only BackEnd calls), sap-account.ts, app-login.ts
  src/pages/         custom React pages and their registry (user-requested layouts)
BackEnd/             Node + Fastify: src/server.ts, src/function.ts (Azure), src/db.ts; the application's own data only
DB/                  SQLite locally; deployment migrates its structure (never rows) to Azure MySQL
records/  scripts/  docs/
```

The full layout, the exact versions and the ports: `docs/stack-and-structure.md`.

## Security

This is a demo setup. The workspace login (`demo` / `demo` and a captcha) is checked in the browser: it gates the
screens, it is not a security boundary. SAP checks its own users: every SAP call carries the SAP account of the tab,
and after SAP rejects an account further calls pause so it is not locked. **Demo only: the BackEnd has no
authentication.** Any client that reaches it can read and write the application's own data and claim any
`x-app-user`; CORS (the FrontEnd's origins only) and the `x-app-request: 1` write header only stop browsers.
Production hardening is done by hand, per application. Both servers listen on `127.0.0.1`. `VITE_*` values are built
into the page, so a build made with `VITE_SAP_USERNAME` / `VITE_SAP_PASSWORD` is for your own PC only; the deploy
pipeline never passes them.

Adding an application: `docs/how-to-add-an-application.md`. SAP details: `docs/sap-connectivity.md`.
