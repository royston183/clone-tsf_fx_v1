# Stack and structure

Every application built from this template has one fixed structure and one fixed stack, so its builds are always in
the same place when the deployment pipeline picks them up. `FrontEnd/tests/unit/conformance.test.ts` ships into every
application and fails `npm run verify` when the application drifts from this page.

## Application types

At the start of every new application, the intake asks which type it is (two options only):

| Type | Folders | SAP | The application's own data |
|---|---|---|---|
| **FE + BE + DB** (`-AppType FullStack`) | `FrontEnd/`, `BackEnd/`, `DB/` | Browser → relay → SAP | The BackEnd's API on its own port → SQLite locally, Azure MySQL deployed |
| **Front end only** (`-AppType FrontEnd`) | `FrontEnd/` | Browser → relay → SAP | Browser storage (`localStorage`) |

The two types differ only in where the application's own (non-SAP) data lives. In both, the FrontEnd is a static
site and the browser calls SAP through the local relay (`VITE_SAP_RELAY_URL`, default `http://localhost:3001`,
built separately, `docs/sap-connectivity.md`). When an SAP API is needed through the relay, the user provides its curl.

Every application has the login page (`/login`) with its captcha: the workspace login is `demo` / `demo`, checked in
the browser. The SAP account is the build's default (`VITE_SAP_USERNAME` / `VITE_SAP_PASSWORD` / `VITE_SAP_CLIENT`)
or another one for the tab, saved in Settings → SAP Connection.

Each module says where its data lives with `source` in `FrontEnd/src/modules/server-registry.ts`: `sap` (an OData
service, through the relay) or `app` (the application's own data). A module without a source shows the sample data in
its definition, kept in memory: that is how screens are built and approved, before any SAP or database read.

## Structure

```
<application>/
  FrontEnd/                 Vite + React (static build)
    index.html              the page; src/main.tsx starts it
    src/App.tsx             pages: /login, /gallery, the catalogue; the sign-in guard
    src/runtime.ts          APP_TYPE: 'fullstack' or 'frontend'
    src/components/         shell, workbench, report, object, items, upload, dashboard, gallery, ui (ALM classes)
    src/config/             app.config.ts (brand), catalog.ts (navigation), services.json (SAP service paths)
    src/lib/                shared logic (fields, grid, list, object, items, report, layout, drill, dashboard)
    src/lib/client/         browser only: data.ts (the one data client), backend-api.ts (the only BackEnd calls),
                            sap-account.ts, app-login.ts, browser-platform.ts, nav.tsx (the router), exports
    src/modules/            one folder per application: definition, OData contract, sample data;
                            server-registry.ts gives each module its source (sap or app)
    src/pages/              registry.ts and custom React pages for user-requested layouts (optional per page)
    src/styles/             ALM baseline and shared kit styles; custom pages can import scoped CSS
    src/core/               the core: the SAP OData V4 client (sap/), the screen services and the BackEnd's API
                            router (server/); the BackEnd shares the services through its @core alias, never sap/
    tests/unit/             unit tests, with conformance.test.ts
    tests/e2e/              Playwright, Microsoft Edge
    dist/                   the build (git-ignored)
  BackEnd/                  Node 22 + Fastify (FE + BE + DB only)
    src/server.ts           the HTTP server: /api/modules/… for `app` modules and saved layouts, CORS for the FrontEnd origins
    src/db.ts               SQLite: local migrations and the SQLite driver
    src/mysql.ts            Azure MySQL pool and driver, selected when the provisioner sets DB_ENGINE=mysql
    src/schema/             the module tables from the definitions (`app` modules) and npm run gen-schema
    src/tables/             the application's own data in those tables, and saved layouts, over either driver
    src/function.ts         the same API as an Azure Function (programming model v4)
    scripts/                build.mjs (bundles, function.zip), zip.mjs, build-db.ts, gen-schema.ts
    tests/                  unit, integration (the application's own data; no SAP)
    dist/                   the build: server.mjs, function.zip (git-ignored)
  DB/                       SQLite (FE + BE + DB only)
    schema/NNNN_<name>.sql  numbered migrations: every table, the source of truth; NNNN_app_tables_<hash>.sql
                            are generated from the `app` module definitions (never edited by hand)
    seed/*.sql              optional starting data
    app.db                  built from schema/ (git-ignored)
  records/                  APPLICATION.md's records: worklogs, test cases, results, lessons
  scripts/dev.mjs           npm run dev: both servers, wired to each other
  docs/                     how-to, SAP connectivity, naming conventions, this page
  APPLICATION.md  CLAUDE.md  README.md  package.json (scripts only)  .env.example
```

Nothing else sits at the root: no fourth application folder, no dependencies in the root `package.json`.

The app's theme is the **UI template** line in records/APPLICATION.md and `APP_THEME` in FrontEnd/src/runtime.ts: Tile theme (tile catalogue, rail) or Normal theme (the LAS look, components/normal/). Build pages for that theme; never change it. Setup does not ask for a template choice. Page layout is flexible:
`catalog.ts` can point any node's `page` at a component in `src/pages/registry.ts`. Custom layouts and scoped CSS
stay inside `FrontEnd/src/` and use the existing login, navigation, theme and data client. They do not need to fit
a predefined module kind. See `docs/how-to-add-an-application.md`, section 2c.

## Stack

| Part | Version |
|---|---|
| Node.js | 22 LTS, 22.13 or later (`engines`: `>=22.13.0 <23`; `node:sqlite` needs 22.13) for the BackEnd and all build tooling |
| FrontEnd | React 19.3.0, Vite 8.3.4 (+ `@vitejs/plugin-react` 6.1.2), TypeScript 5.9.3, lucide-react 0.468.0, Inter (`@fontsource-variable/inter` 5.3.0), zod 4.6.5 |
| BackEnd | Fastify 5.12.7 (+ `@fastify/cors` 11.3.1), zod 4.6.5, MySQL2 3.24.4, `@azure/functions` 4.16.5 (the Function App entry); tsx 4.23.15 (dev), esbuild 0.28.2 (build) |
| DB | SQLite locally through Node's built-in `node:sqlite`; Azure MySQL after deployment, through MySQL2 |
| Tests | Vitest 5.0.3, Playwright 1.64.0 (Microsoft Edge) |
| Lint | ESLint 9.39.5, typescript-eslint 8.71.2, eslint-plugin-react-hooks 7.1.1 (React Compiler rules are errors) |

Every version is exact (no `^` or `~`). The full lists are `STACK` in `FrontEnd/tests/unit/conformance.test.ts`. A new
library is a template change: approved by the template maintainer, added to the template's list, then used. Both
`package.json` folders carry `.npmrc` with `legacy-peer-deps=true`, because npm 10 crashes resolving Vite's optional
peers; every package is listed explicitly instead.

## Ports

| | Port | Setting |
|---|---|---|
| FrontEnd (dev and preview) | 3100 | `FRONTEND_PORT` (else `PORT`) |
| BackEnd | 3200 | `BACKEND_PORT` (`npm run dev`), `PORT` (the BackEnd alone) |
| SAP relay (both types) | 3001 | `VITE_SAP_RELAY_URL`; built separately |
| e2e (FrontEnd / BackEnd / relay stub) | 3300 / 3301 / 3399 | `E2E_PORT` / `E2E_API_PORT`; the stub answers inside the tests |

Both servers listen on `127.0.0.1` only. The FrontEnd calls the BackEnd at `VITE_API_BASE_URL`, else the page's own
host on `VITE_API_PORT` (`npm run dev` sets it to the BackEnd port), only from `src/lib/client/backend-api.ts`, with no
cookies: the acting user (the SAP user, else `DEMO`) goes as `x-app-user` and every call carries `x-app-request: 1`.
The BackEnd may call the Anthropic Messages API for AI features, with `@anthropic-ai/sdk` (approved library) and the
key `ANTHROPIC_API_KEY` from its environment; it never reaches the browser.

The BackEnd allows only the FrontEnd's origins (`APP_ORIGINS`, else the FrontEnd host names on `FRONTEND_PORT`)
through CORS, and every write needs a listed origin and that header.

**Demo only: the BackEnd has no authentication.** Any client that reaches it can read and write the application's own
data and claim any `x-app-user`; CORS and `x-app-request` only stop browsers. Production hardening is done by hand,
per application.

## Builds

| | Command | Output |
|---|---|---|
| FrontEnd | `npm --prefix FrontEnd run build` | `FrontEnd/dist/` (static files) |
| BackEnd | `npm --prefix BackEnd run build` | `BackEnd/dist/server.mjs` (one self-contained file: run it with Node 22) and `BackEnd/dist/function.zip` (the same BackEnd for an Azure Function App zip deploy: `docs/deploy-function-app.md`) |
| DB | `npm run build-db` | `DB/app.db` from `DB/schema/` (the BackEnd also applies new migrations when it starts) |

The BackEnd's Function App zip is ready to upload (`docs/deploy-function-app.md`); the rest of the deployment pipeline picks up these folders.

## Commands

| Command | What it does |
|---|---|
| `npm run install:all` | `npm install` in FrontEnd (and BackEnd) |
| `npm run dev` | Both servers in development: FrontEnd http://127.0.0.1:3100, BackEnd http://127.0.0.1:3200 |
| `npm run verify` | The schema check (`npm run gen-schema -- --check`), then per folder: typecheck, lint, tests (conformance included), build |
| `npm run e2e` | Playwright on the builds, ports 3300 / 3301; the relay is a stub inside the tests, the BackEnd uses an in-memory database |
| `npm run test:live` | Read-only check against the real SAP system, from the FrontEnd's test runner through the relay |
| `npm run gen-schema` | Write the tables of the `app` modules into `DB/schema/` from their definitions (`DB/README.md`); `npm run dev` runs it first |
| `npm run build-db` | Build or update `DB/app.db` (`-- --seed` also runs `DB/seed/*.sql`) |
| `npm run deploy` | Browser GitHub login, repository push, database/backend/frontend Azure deployment, live URL |

## Rules that follow from the structure

- **The browser calls SAP through the relay; the BackEnd never calls SAP.** `BackEnd/` holds no SAP host, user,
  password, service URL or SAP import (`@core/sap`, `odata-backend`); the conformance test checks its import graph.
- **The FrontEnd is static.** Nothing serves an API at its own origin and no code calls one: no `/api` route,
  `setApiTransport` or request interceptor, no Vite `server.proxy`. Browser code calls the SAP client and the data
  client (`src/lib/client/data.ts`) as plain functions.
- **Validation.** A module's `check()` rules run in the browser before every write. The authority is SAP for SAP
  data, the BackEnd for the application's own data (it runs the same `check()` again).
