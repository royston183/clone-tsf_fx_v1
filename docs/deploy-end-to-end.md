# End-to-end deployment

The generated application owns the Azure Deploy Hub pipeline in `scripts/deploy/`. **Azure only ever receives what
is on the GitHub repository's `main` branch**: nothing is built for Azure or uploaded from the local folder. The
work is split in two.

`npm run deploy` (the terminal, the first time and for every change):

1. confirms deployment and signs in to GitHub in the browser through Git Credential Manager;
2. commits the folder and, when the repository already exists, replays that commit on the latest `origin/main`
   (a conflict stops here, before anything is pushed);
3. installs dependencies and runs the complete verification (tests, lint, type checks, and production builds);
4. rejects credential files and credential-like source values, and creates the private repository when needed;
5. stores `PROVISIONER_KEY` as an encrypted Actions secret and `PROVISIONER_BASE_URL`, `PROVISIONER_OWNER` and
   `DEPLOY_FROM_MAIN=true` as Actions variables;
6. provisions the infrastructure only: sends the schema of `DB/app.db` (never rows) so the provisioner creates or
   updates MySQL, and creates the Node 22 Function App with its least-privilege MySQL login;
7. pushes `main` (and `develop` when the repository is new), never forced;
8. waits for the **Deploy** workflow run of that commit and prints the live URL. When `main` already had the commit,
   it starts the workflow on `main` by hand (workflow_dispatch) instead.

`.github/workflows/deploy.yml` (GitHub Actions, on every push to `main` and on a manual run on `main`):

1. checks out `main`, installs and runs `npm run verify`;
2. runs `node scripts/deploy/index.mjs --ci`, which refuses any ref other than `refs/heads/main`, sends the schema to
   MySQL, builds the frontend with the backend URL (and with `VITE_SAP_USERNAME` / `VITE_SAP_PASSWORD` emptied, so no
   SAP account is built into the page), uploads `FrontEnd/dist` to static hosting, sets the website origin on the
   backend (CORS), uploads `BackEnd/dist/function.zip` and waits for the Function App deployment;
3. writes the live URL into the run summary. Runs are queued one at a time (`concurrency: deploy-main`).

Any push to `main` deploys, from this script, the GitHub web editor or a merged pull request. The job is skipped
unless the `DEPLOY_FROM_MAIN` variable is `true`, so the template's own repository never deploys.

The MySQL administrator password returned for a new database is shown once in the local terminal and is not written
to a file; the workflow never prints one. The GitHub credential stays in the operating system credential store. The
provisioner key reaches the repository only as an encrypted Actions secret. `.env`, `.env.local`, private keys,
`.npmrc` files with registry credentials, local Azure settings, build output, dependencies, and `DB/app.db` are
blocked from the repository.

## What is deployed

- The static site (`FrontEnd/dist`). Its browser code calls SAP through the relay on each user's own PC
  (`VITE_SAP_RELAY_URL`, default `http://localhost:3001`), so the relay must answer CORS for the site's origin
  (`docs/sap-connectivity.md`). Deployed users sign in with `demo` / `demo` and enter their SAP account in
  Settings → SAP Connection.
- FE + BE + DB only: the Function App and MySQL, for the application's own data. No SAP host, account or service URL
  is set on Azure. A Front end only application deploys the static site only.
- The MySQL tables are the ones `DB/schema` creates: `app_modules`, `layouts`, `schema_migrations` and the generated
  tables of the `app` modules (`DB/README.md`). The provisioner adds new tables, columns and indexes and never
  changes an existing column, which is why a pushed (frozen) module definition must not change: `npm run verify`
  stops it. Each module is seeded with its sample data on first use, as locally. Gallery samples (`devOnly`) are not
  kept by the deployed BackEnd.

**Demo only: the BackEnd has no authentication.** Any client that reaches the Function App can read and write the
application's own data and claim any `x-app-user`; CORS and `x-app-request` only stop browsers. Production hardening
is done by hand, per application (`docs/deploy-function-app.md`).

## Changing a deployed application

1. `git pull --rebase origin main` before changing anything.
2. Make the change, run `npm run gen-schema` when a module definition changed, and run `npm run verify`.
3. `npm run deploy` (or `npm run deploy -- --yes`): the change is committed, replayed on the latest `main`, verified,
   pushed, and deployed by the workflow. If someone else pushed meanwhile, the script integrates their commits first.

## Configuration

Copy `.env.example` to `.env.local`. At minimum, set:

```env
PROVISIONER_BASE_URL=https://provisioner-fa-f6bbbncphvbgbkfe.centralindia-01.azurewebsites.net
PROVISIONER_KEY=<your team host key>
```

`PROVISIONER_OWNER` is optional and defaults to the signed-in GitHub user. Deployment credentials may instead be
supplied as process environment variables. The new-application command also accepts `-DeploymentConfig` so a
template-level uncommitted environment file can be used without copying its secrets into the generated project.

## Commands

```powershell
npm run verify
npm run deploy

# Non-interactive confirmation, while browser authentication remains interactive when needed:
npm run deploy -- --yes
```

`scripts/new-application.ps1` no longer asks at scaffold time, because the application is not built yet. The
deployment question is asked once the application is built and verified (see "Deploying when the build is done" in
`CLAUDE.md`); the answer Yes runs `npm run deploy -- --yes`. `-Deploy Yes` still deploys straight after scaffolding
for automation.

If a step fails after the push, the repository remains available and the error names it and the Actions run. Fix
the cause and run `npm run deploy` again (or re-run the workflow on GitHub); the pipeline reuses that repository and
the provisioned Azure resources.

The workflow runs on `windows-latest`, like the PCs the applications are verified on. Private repositories are
billed Actions minutes, Windows at twice the Linux rate; switching `runs-on` to `ubuntu-latest` halves that once
`npm run verify` is known to pass on Linux.
