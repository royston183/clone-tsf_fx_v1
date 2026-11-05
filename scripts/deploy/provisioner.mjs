// Azure pipeline adapted from Azure Deploy Hub: database -> backend -> frontend -> CORS -> backend package.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { networkDetail, notSent, offlineWaiter, OFFLINE_WAIT, retryDelay } from './network.mjs';
import { introspect } from './sqlite-schema.mjs';
import { zipFolder } from './zip.mjs';

export class ProvisionerError extends Error {}

export function azureAppName(repositoryName) {
  return repositoryName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').replace(/-{2,}/g, '-') || 'frontend-app';
}

function inside(root, relative, label, { mustExist = true } = {}) {
  if (typeof relative !== 'string' || !relative.trim() || path.isAbsolute(relative)) {
    throw new ProvisionerError(`deploy.json: ${label} must be a relative path`);
  }
  const base = path.resolve(root);
  const resolved = path.resolve(base, relative);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new ProvisionerError(`deploy.json: ${label} must stay inside the repository`);
  if (mustExist && !existsSync(resolved)) throw new ProvisionerError(`deploy.json: ${label} '${relative}' does not exist`);
  return resolved;
}

/** The origins a Capacitor app's WebView sends: Android (https://localhost) and iOS (capacitor://localhost). Nothing else is accepted. */
export const MOBILE_ORIGINS = ['https://localhost', 'capacitor://localhost'];

export function loadManifest(root) {
  const manifestPath = path.join(root, 'deploy.json');
  if (!existsSync(manifestPath)) throw new ProvisionerError('deploy.json is missing from the project root');
  let raw;
  try { raw = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')); }
  catch { throw new ProvisionerError('deploy.json is not valid JSON'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProvisionerError('deploy.json must be a JSON object');
  const frontend = raw.frontend || {};
  const frontendRoot = inside(root, frontend.path || 'FrontEnd', 'frontend.path');
  const apiEnv = frontend.apiUrlEnv;
  if (apiEnv != null && (typeof apiEnv !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiEnv))) {
    throw new ProvisionerError('deploy.json: frontend.apiUrlEnv must be an environment variable name');
  }
  let backend = null;
  if (raw.backend != null) {
    if (typeof raw.backend !== 'object' || Array.isArray(raw.backend)) throw new ProvisionerError('deploy.json: backend must be an object');
    const runtime = String(raw.backend.runtime || '').toLowerCase();
    if (runtime !== 'node') throw new ProvisionerError('deploy.json: this template backend runtime must be "node"');
    const backendRoot = inside(root, raw.backend.path, 'backend.path');
    backend = {
      root: backendRoot,
      runtime,
      version: String(raw.backend.version || '22'),
      artifact: inside(backendRoot, raw.backend.artifact || 'dist/function.zip', 'backend.artifact', { mustExist: false })
    };
  }
  let database = null;
  if (raw.database != null) {
    if (typeof raw.database !== 'object' || Array.isArray(raw.database)) throw new ProvisionerError('deploy.json: database must be an object');
    if ((raw.database.source || 'sqlite') !== 'sqlite' || (raw.database.engine || 'mysql') !== 'mysql') {
      throw new ProvisionerError('deploy.json: only a SQLite source and MySQL destination are supported');
    }
    database = { path: inside(root, raw.database.path, 'database.path', { mustExist: false }) };
  }
  if ((backend && !database) || (!backend && database)) throw new ProvisionerError('deploy.json: backend and database must either both be present or both be absent');
  // A mobile app made from this one (FS Sprint G) calls the same backend from its WebView: those origins join the site's.
  let mobileOrigins = [];
  if (raw.mobile != null) {
    const list = raw.mobile && typeof raw.mobile === 'object' && !Array.isArray(raw.mobile) ? raw.mobile.origins : undefined;
    if (!Array.isArray(list) || !list.every(o => MOBILE_ORIGINS.includes(o))) {
      throw new ProvisionerError(`deploy.json: mobile.origins must list only ${MOBILE_ORIGINS.join(' or ')}`);
    }
    mobileOrigins = [...new Set(list)];
  }
  return { frontendRoot, apiEnv, backend, database, mobileOrigins, raw };
}

export function runNpm(arguments_, directory, extraEnv = {}, runner = spawnSync) {
  // Node 22.12+ refuses to spawn .cmd files without a shell on Windows (EINVAL), so npm runs through the shell there.
  const result = runner('npm', arguments_, {
    cwd: directory,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: 30 * 60 * 1000,
    windowsHide: true
  });
  if (result.error) throw new ProvisionerError(`npm ${arguments_.join(' ')} failed: ${result.error.message}`);
  if (result.status !== 0) throw new ProvisionerError(`npm ${arguments_.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
}

export function findStaticOutput(root) {
  for (const name of ['dist', 'build', 'out']) {
    const candidate = path.join(root, name);
    if (existsSync(path.join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

/**
 * Vite writes every VITE_* value into the page, so the deployed build never gets the build's default SAP account:
 * deployed users enter their own in Settings → SAP Connection. Empty values, because a value in the process
 * environment (even an empty one) also wins over a .env file (FrontEnd/vite.config.ts).
 */
export const NO_SAP_ACCOUNT = Object.freeze({ VITE_SAP_USERNAME: '', VITE_SAP_PASSWORD: '' });

export function buildFrontend(root, env = {}, runner = spawnSync) {
  if (!existsSync(path.join(root, 'package.json'))) throw new ProvisionerError('The frontend folder has no package.json');
  for (const name of ['dist', 'build', 'out']) rmSync(path.join(root, name), { recursive: true, force: true });
  const buildEnv = { ...env, ...NO_SAP_ACCOUNT };
  runNpm(['install'], root, buildEnv, runner);
  runNpm(['run', 'build'], root, buildEnv, runner);
  const output = findStaticOutput(root);
  if (!output) throw new ProvisionerError('Frontend build finished without dist/index.html, build/index.html, or out/index.html');
  return output;
}

export function prepareBackend(manifest, runner = spawnSync) {
  if (!manifest.backend) return;
  runNpm(['install'], manifest.backend.root, {}, runner);
  runNpm(['run', 'build'], manifest.backend.root, {}, runner);
  if (manifest.database) runNpm(['run', 'build-db'], manifest.backend.root, {}, runner);
  if (!existsSync(manifest.backend.artifact)) throw new ProvisionerError(`Backend build did not create ${manifest.backend.artifact}`);
  if (manifest.database && !existsSync(manifest.database.path)) throw new ProvisionerError(`Database build did not create ${manifest.database.path}`);
}

/**
 * One provisioner call. Without internet (the request never left this PC) any call waits for it, up to `offlineWait`.
 * A GET, or a POST the caller marks `retry: true` (it replaces what an earlier one did), is also repeated after a dropped
 * connection, a timeout or a 502/503/504; a POST that creates something is not, since it may have landed.
 */
export async function apiRequest(baseUrl, key, method, resourcePath, {
  body, contentType, timeout = 180_000, fetchImpl = fetch, retry, attempts = 5, sleep = retryDelay, offlineWait = OFFLINE_WAIT, onOffline
} = {}) {
  let base;
  try { base = new URL(baseUrl); } catch { throw new ProvisionerError('PROVISIONER_BASE_URL must be a valid HTTPS URL'); }
  if (base.protocol !== 'https:') throw new ProvisionerError('PROVISIONER_BASE_URL must be a valid HTTPS URL');
  const retryable = retry ?? method === 'GET';
  const waitOnline = offlineWaiter({ limit: offlineWait, sleep, ...(onOffline ? { onOffline } : {}) });
  let response;
  for (let attempt = 1; ; attempt += 1) {
    const last = !retryable || attempt >= attempts;
    try {
      response = await fetchImpl(new URL(resourcePath, `${baseUrl.replace(/\/+$/, '')}/`), {
        method,
        headers: { 'x-functions-key': key, Accept: 'application/json', ...(contentType ? { 'Content-Type': contentType } : {}) },
        body,
        signal: AbortSignal.timeout(timeout)
      });
    } catch (error) {
      if (notSent(error) && await waitOnline(error)) { attempt -= 1; continue; }
      if (last || notSent(error)) throw new ProvisionerError(`Cannot reach the Azure provisioner (${method} ${resourcePath.split('?')[0]}): ${networkDetail(error)}`);
      await sleep(2_000 * 2 ** (attempt - 1));
      continue;
    }
    if (last || ![502, 503, 504].includes(response.status)) break;
    await sleep(2_000 * 2 ** (attempt - 1));
  }
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new ProvisionerError(`Provisioner returned HTTP ${response.status}: ${String(data.error || data.message || text || response.statusText).slice(0, 500)}`);
  return data;
}

const jsonBody = value => Buffer.from(JSON.stringify(value));

export async function provisionedApps(options) {
  const result = await apiRequest(options.baseUrl, options.key, 'GET', '/api/apps', { fetchImpl: options.fetchImpl });
  return Array.isArray(result.apps) ? result.apps.filter(app => app && typeof app === 'object') : [];
}

export function matchingApp(apps, repositoryName, owner) {
  const appName = azureAppName(repositoryName);
  return apps.find(app => app.app === appName && app.owner === owner && app.account && app.url) || null;
}

export async function publishDatabase(databasePath, repositoryName, owner, options) {
  const result = await apiRequest(options.baseUrl, options.key, 'POST', '/api/databases', {
    body: jsonBody({ name: azureAppName(repositoryName), owner, repo: options.repo, schema: introspect(databasePath) }),
    contentType: 'application/json', timeout: 240_000, fetchImpl: options.fetchImpl
  });
  if (!result.database) throw new ProvisionerError('Provisioner database response did not include the database name');
  return result;
}

export async function createBackend(repositoryName, owner, backend, databaseName, options) {
  const request = { name: azureAppName(repositoryName), owner, runtime: backend.runtime, version: backend.version, repo: options.repo };
  const created = await apiRequest(options.baseUrl, options.key, 'POST', '/api/backends', {
    body: jsonBody(request), contentType: 'application/json', timeout: 290_000, fetchImpl: options.fetchImpl
  });
  if (!created.backend || !created.url) throw new ProvisionerError('Provisioner backend response did not include the backend name and URL');
  if (databaseName) {
    await apiRequest(options.baseUrl, options.key, 'POST', `/api/backends/${encodeURIComponent(created.backend)}/database`, {
      body: jsonBody({ database: databaseName }), contentType: 'application/json', timeout: 120_000, retry: true, fetchImpl: options.fetchImpl
    });
  }
  return { backend: created.backend, url: created.url, api_url: created.url.replace(/\/+$/, ''), runtime: backend.runtime,
    created: Boolean(created.created), database: databaseName, deployed: false };
}

/** The website's storage account, created when it does not exist yet: its URL is known before anything is uploaded. */
export async function ensureFrontendApp(repositoryName, owner, options) {
  let created = options.reuseExisting ? matchingApp(await provisionedApps(options), repositoryName, owner) : null;
  const reused = Boolean(created);
  if (!created) {
    created = await apiRequest(options.baseUrl, options.key, 'POST', '/api/apps', {
      body: jsonBody({ name: azureAppName(repositoryName), owner, repo: options.repo }),
      contentType: 'application/json', fetchImpl: options.fetchImpl
    });
  }
  if (!created.account || !created.url) throw new ProvisionerError('Provisioner create response did not include the storage account and URL');
  return { ...created, reused };
}

export async function publishFrontend(output, repositoryName, owner, options, app) {
  const created = app ?? await ensureFrontendApp(repositoryName, owner, options);
  const reused = created.reused;
  const archivePath = path.join(tmpdir(), `sap-frontend-${randomUUID()}.zip`);
  try {
    zipFolder(output, archivePath);
    const deployment = await apiRequest(options.baseUrl, options.key, 'POST', `/api/apps/${encodeURIComponent(created.account)}/deploy?clean=true`, {
      body: readFileSync(archivePath), contentType: 'application/zip', timeout: 300_000, retry: true, fetchImpl: options.fetchImpl
    });
    return { account: created.account, app: created.app || azureAppName(repositoryName), azure_owner: created.owner || owner,
      created_at: created.createdAt, url: deployment.url || created.url, reused, deployment };
  } finally { rmSync(archivePath, { force: true }); }
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/**
 * Waits until the backend's /api/health reports `commit` (polls every 5 s, up to 3 minutes). Not reachable or an older build
 * (404 before the first build that has the route) means not yet. False without a commit to wait for, or after the limit.
 */
export async function waitForBackendBuild(apiUrl, commit, { fetchImpl = fetch, sleep = delay, log = () => {}, limit = 36, interval = 5_000 } = {}) {
  if (!commit) return false;
  const started = Date.now();
  for (let poll = 0; poll < limit; poll += 1) {
    try {
      const response = await fetchImpl(`${String(apiUrl).replace(/\/+$/, '')}/api/health`, { signal: AbortSignal.timeout(15_000) });
      if (response.ok && (await response.json().catch(() => ({}))).build === commit) {
        log(`Backend runs ${commit.slice(0, 7)} (${Math.round((Date.now() - started) / 1000)} s after its deployment).`);
        return true;
      }
    } catch { /* restarting: not yet */ }
    await sleep(interval);
  }
  log(`The backend did not report ${commit.slice(0, 7)} yet after ${Math.round(limit * interval / 60_000)} minutes: publishing the website anyway.`);
  return false;
}

export async function deployBackend(backend, options) {
  const endpoint = `/api/backends/${encodeURIComponent(backend.backend)}`;
  const before = await apiRequest(options.baseUrl, options.key, 'GET', `${endpoint}/deployment`, { timeout: 60_000, fetchImpl: options.fetchImpl });
  const body = readFileSync(options.artifact);
  if (body.length > 100 * 1024 * 1024) throw new ProvisionerError('The backend package is larger than 100 MB');
  await apiRequest(options.baseUrl, options.key, 'POST', `${endpoint}/deploy`, {
    body, contentType: 'application/zip', timeout: 300_000, retry: true, fetchImpl: options.fetchImpl
  });
  const deadline = Date.now() + (options.deployTimeout || 15 * 60_000);
  while (Date.now() < deadline) {
    await (options.sleep || delay)(options.pollInterval ?? 5_000);
    const status = await apiRequest(options.baseUrl, options.key, 'GET', `${endpoint}/deployment`, { timeout: 60_000, fetchImpl: options.fetchImpl });
    if (before.id != null && status.id === before.id) continue;
    if (status.state === 'failed') throw new ProvisionerError(`Backend build failed: ${status.message || 'see the Function App deployment log'}`);
    if (status.state === 'success' && status.complete) return status;
  }
  throw new ProvisionerError('Backend deployment did not finish within 15 minutes');
}

/**
 * Infrastructure only, before the first push to main: the MySQL database (its one-time admin login comes back here, in
 * the terminal, never in a GitHub Actions log) and the Function App attached to it. No application code is uploaded;
 * the Deploy workflow builds and publishes main. Both calls reuse what already exists.
 */
export async function provisionInfrastructure(root, repositoryName, owner, options = {}) {
  if (!options.key) throw new ProvisionerError('PROVISIONER_KEY is missing');
  const manifest = loadManifest(root);
  const result = {};
  if (manifest.database) {
    runNpm(['run', 'build-db'], manifest.backend.root, {}, options.runner);
    if (!existsSync(manifest.database.path)) throw new ProvisionerError(`Database build did not create ${manifest.database.path}`);
    result.database = await publishDatabase(manifest.database.path, repositoryName, owner, options);
  }
  try {
    if (manifest.backend) result.backend = await createBackend(repositoryName, owner, manifest.backend, result.database?.database, options);
  } catch (error) {
    if (result.database?.adminLogin) return { ...result, error: error.message };
    throw error;
  }
  return result;
}

/** The website URL the Deploy workflow published for this repository, once it has run. */
export async function liveUrl(repositoryName, owner, options) {
  return matchingApp(await provisionedApps(options), repositoryName, owner)?.url || '';
}

export async function buildAndPublish(root, repositoryName, owner, options = {}) {
  if (!options.key) throw new ProvisionerError('PROVISIONER_KEY is missing');
  const manifest = loadManifest(root);
  // Compile and validate all local artifacts before a cloud resource is created.
  prepareBackend(manifest, options.runner);
  // Each slow cloud step says what it does: without it the Actions log is silent for a minute or more.
  const say = options.log || (message => process.stdout.write(`${message}
`));
  const result = {};
  if (manifest.database) {
    say('Publishing the database schema…');
    result.database = await publishDatabase(manifest.database.path, repositoryName, owner, options);
  }
  try {
    if (manifest.backend) {
      say('Setting up the backend (Function App)…');
      result.backend = await createBackend(repositoryName, owner, manifest.backend, result.database?.database, options);
    }
    const buildEnv = manifest.apiEnv && result.backend ? { [manifest.apiEnv]: result.backend.api_url } : {};
    const output = buildFrontend(manifest.frontendRoot, buildEnv, options.runner);
    // The backend goes first: the old website keeps working on the new backend (new fields are optional), while a new
    // website on the old backend would send fields it drops. The site's URL, for CORS, is known before its upload.
    const site = await ensureFrontendApp(repositoryName, owner, options);
    if (result.backend) {
      say('Deploying the backend to its Function App: Azure installs and starts it, usually about a minute…');
      // The provisioner takes http(s) origins only (it refused capacitor://localhost with HTTP 400 on 2026-10-28): the iOS
      // app's origin is left out with a warning, so the deploy goes on and the Android app and website keep working.
      const corsOrigins = manifest.mobileOrigins.filter(o => o.startsWith('https://'));
      const skipped = manifest.mobileOrigins.filter(o => !corsOrigins.includes(o));
      if (skipped.length) say(`Warning: ${skipped.join(', ')} (the iPhone app) is not sent: the provisioner accepts only http(s) origins, so the iOS app cannot call this backend until it does.`);
      await apiRequest(options.baseUrl, options.key, 'POST', `/api/backends/${encodeURIComponent(result.backend.backend)}/cors`, {
        body: jsonBody({ origins: [site.url, ...corsOrigins] }), contentType: 'application/json', timeout: 120_000, retry: true, fetchImpl: options.fetchImpl
      });
      const started = Date.now();
      await deployBackend(result.backend, { ...options, artifact: manifest.backend.artifact });
      result.backend.deployed = true;
      say(`Backend deployed (${Math.round((Date.now() - started) / 1000)} s).`);
      // Azure reports success before the Function App restarts on the new code: the website waits for the new build.
      // Only a BackEnd built with /api/health (dist/build.json): an older one never reports a build.
      const health = existsSync(path.join(manifest.backend.root, 'dist', 'build.json'));
      await waitForBackendBuild(result.backend.api_url, health ? options.commit : '', { fetchImpl: options.fetchImpl, sleep: options.sleep, log: say });
    }
    say('Publishing the website…');
    Object.assign(result, await publishFrontend(output, repositoryName, owner, options, site));
  } catch (error) {
    if (result.database?.adminLogin) return { ...result, error: error.message };
    throw error;
  }
  return result;
}
