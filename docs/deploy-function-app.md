# Deploy the BackEnd to an Azure Function App

`npm --prefix BackEnd run build` (also the last step of `npm run verify`) builds the BackEnd twice from the same code:

| Output | Runs as |
|---|---|
| `BackEnd/dist/server.mjs` | A Node server on a port (`npm run dev`, a VM, App Service) |
| `BackEnd/dist/function.zip` | An Azure Function App, Node 22, programming model v4: upload it as it is |

The zip holds `index.mjs` (the function and every dependency, bundled), `host.json`, `package.json` and `DB/schema/`.
It needs no `npm install` on Azure. The function, `api`, answers every `/api/*` request through the same Fastify app
as the server (`BackEnd/src/function.ts`): CORS, security headers and the core router, for the application's own data
only (`app` modules and saved layouts). It never calls SAP and holds no SAP settings: SAP is the browser's, through
the relay on the user's PC.

**Demo only: the BackEnd has no authentication.** Any client that reaches the Function App can read and write the
application's own data and claim any `x-app-user`; CORS and `x-app-request` only stop browsers. Production hardening
(authentication in front of the Function App, network restrictions) is done by hand, per application.

## Create the Function App

- Runtime **Node.js 22**, operating system **Linux** (or Windows).
- Plan: **Flex Consumption**, **Premium**, **App Service (Dedicated)** or plain Consumption.
- **Scale-out: 1 instance.** Flex Consumption: maximum instance count 1. Premium / Dedicated: 1 instance, no
  autoscale. Consumption: `WEBSITE_MAX_DYNAMIC_APPLICATION_SCALE_OUT=1`. See "One instance" below.
- **CORS:** the provisioner sets the Function App's CORS list to the website's origin (`npm run deploy`); the BackEnd
  reads it (`WEBSITE_CORS_ALLOWED_ORIGINS`) as its origins when `APP_ORIGINS` is unset. No credentials are needed.

## Application settings

| Setting | Value |
|---|---|
| `FUNCTIONS_WORKER_RUNTIME` | `node` |
| `WEBSITE_RUN_FROM_PACKAGE` | `1` (set by a zip deploy) |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false`: the zip is already built |
| `APP_ORIGINS` | The FrontEnd's address, e.g. `https://sap-app.example.com` (comma separated for several). Unset: the platform's CORS origins |
| `DB_ENGINE` | `mysql` when deployed by `npm run deploy`; unset/`sqlite` for a manually deployed SQLite Function App |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | Injected by the provisioner for the database-specific application login; SSL is required |
| `DB_PATH` | Manual SQLite deployments only: a writable persistent file. Unset: the temp folder, lost on restart |
| `NODE_ENV` | `production` (turns the UI Gallery off) |

No SAP setting belongs here. The FrontEnd is built with `VITE_API_BASE_URL=https://<function-app>.azurewebsites.net`
so it calls the Function App.

## Deploy the zip

```powershell
npm --prefix BackEnd run build
az functionapp deployment source config-zip -g <resource-group> -n <function-app> --src BackEnd/dist/function.zip
```

Or the portal (Deployment Center), the Kudu zip deploy page (`https://<function-app>.scm.azurewebsites.net/ZipDeployUI`),
or a pipeline step that publishes `BackEnd/dist/function.zip`. Flex Consumption: `az functionapp deployment source
config-zip` as above (one-deploy). Check it: `GET https://<function-app>.azurewebsites.net/api/modules/<module>` answers
`200` with JSON for an `app` module (`sample-deals` in the template), and `404` with the JSON error shape for any other.

## What the Function App changes, and why

- **One instance:** the core keeps its write queues (one save at a time per module) and its backend and lookup caches
  in memory. A second instance would run its own queue next to the first, so two saves of the same module could
  interleave. More than one instance needs those moved to shared storage first (a template change).
- **SQLite in a file** (manual deployments only; `npm run deploy` uses MySQL): the package folder is read-only under
  run-from-package, so the database goes to `DB_PATH`. The function uses SQLite's rollback journal, not WAL, because
  WAL does not work on the network share behind `/home`. The schema comes from `DB/schema` in the zip and is applied
  at the first request.
- **No cookies cross sites:** the FrontEnd calls the Function App without credentials, so no cookie settings are
  needed. Writes need an allowed origin and the `x-app-request: 1` header.
