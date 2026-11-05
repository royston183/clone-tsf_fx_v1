import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { deploymentConfig, loadEnvFile } from './config.mjs';
import {
  assertNoCredentialFiles, configureActions, credentialProblems, githubRequest, setActionsVariable, validateBranchName,
  validateRepositoryName, waitForDeployment
} from './github.mjs';
import { deployFromCi, parseArguments } from './index.mjs';
import { apiRequest, azureAppName, buildAndPublish, loadManifest, provisionInfrastructure } from './provisioner.mjs';
import { blake2b, sealedBox } from './sealed-box.mjs';
import { extractChecks, introspect } from './sqlite-schema.mjs';

const json = (payload, status = 200) => new Response(status === 204 ? null : JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sap-deploy-'));
  mkdirSync(path.join(root, 'FrontEnd'));
  mkdirSync(path.join(root, 'BackEnd'));
  mkdirSync(path.join(root, 'DB'), { recursive: true });
  writeFileSync(path.join(root, 'FrontEnd', 'package.json'), '{}');
  writeFileSync(path.join(root, 'BackEnd', 'package.json'), '{}');
  writeFileSync(path.join(root, 'deploy.json'), JSON.stringify({
    frontend: { path: 'FrontEnd', apiUrlEnv: 'VITE_API_BASE_URL' },
    backend: { path: 'BackEnd', runtime: 'node', version: '22', artifact: 'dist/function.zip' },
    database: { source: 'sqlite', path: 'DB/app.db', engine: 'mysql' }
  }));
  return root;
}

test('dotenv keeps process values and deployment config requires the provisioner key', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sap-env-'));
  try {
    const file = path.join(root, '.env.local');
    writeFileSync(file, 'PROVISIONER_KEY=file-key\nPROVISIONER_OWNER=file-owner\n');
    const env = { PROVISIONER_KEY: 'process-key' };
    loadEnvFile(file, env);
    assert.deepEqual(env, { PROVISIONER_KEY: 'process-key', PROVISIONER_OWNER: 'file-owner' });
    assert.equal(deploymentConfig(root, file, { PROVISIONER_KEY: 'process-key' }).key, 'process-key');
    rmSync(file);
    assert.throws(() => deploymentConfig(root, '', {}), /PROVISIONER_KEY/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('repository, branch, manifest, and Azure names are constrained', () => {
  assert.equal(validateRepositoryName('cash-flow.v2'), 'cash-flow.v2');
  assert.equal(validateBranchName('feature/deploy'), 'feature/deploy');
  assert.equal(azureAppName('Cash_Flow.v2'), 'cash-flow-v2');
  assert.throws(() => validateRepositoryName('../bad'));
  assert.throws(() => validateBranchName('main'));
  const root = fixture();
  try {
    const manifest = loadManifest(root);
    assert.equal(manifest.frontendRoot, path.join(root, 'FrontEnd'));
    assert.equal(manifest.backend.artifact, path.join(root, 'BackEnd', 'dist', 'function.zip'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('deploy.json mobile.origins: only the Capacitor WebView origins, deduplicated', () => {
  const root = fixture();
  try {
    const file = path.join(root, 'deploy.json');
    const base = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(loadManifest(root).mobileOrigins, []);
    writeFileSync(file, JSON.stringify({ ...base, mobile: { origins: ['https://localhost', 'capacitor://localhost', 'https://localhost'] } }));
    assert.deepEqual(loadManifest(root).mobileOrigins, ['https://localhost', 'capacitor://localhost']);
    for (const mobile of [{ origins: ['https://evil.example'] }, { origins: 'https://localhost' }, ['https://localhost']]) {
      writeFileSync(file, JSON.stringify({ ...base, mobile }));
      assert.throws(() => loadManifest(root), /mobile.origins must list only/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the pre-push scan detects assigned credentials but allows placeholders', () => {
  const key = ['pass', 'word'].join('');
  const unsafe = `const login = { ${key}: '${['hunt', 'er22'].join('')}' }`;
  assert.ok(credentialProblems(Buffer.from(unsafe)).length > 0);
  assert.deepEqual(credentialProblems(Buffer.from(`${key}: '<your ${key}>'`)), []);
});

test('SQLite introspection sends schema and never row data', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sap-schema-'));
  try {
    const file = path.join(root, 'app.db');
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT CHECK(length(name) > 0)); INSERT INTO t(name) VALUES ('private row');");
    db.close();
    const schema = introspect(file);
    assert.equal(schema.tables[0].name, 't');
    assert.deepEqual(schema.tables[0].checks, ['length(name) > 0']);
    assert.doesNotMatch(JSON.stringify(schema), /private row/);
    assert.deepEqual(extractChecks("CREATE TABLE x(a TEXT DEFAULT 'CHECK(no)', b INT CHECK (b > (1 + 1)))"), ['b > (1 + 1)']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('full pipeline wires database, backend, frontend, CORS, package, and live URL', async () => {
  const root = fixture();
  const commands = [];
  const calls = [];
  let deploymentPoll = 0;
  const runner = (_command, args, options) => {
    commands.push({ args, cwd: options.cwd, env: options.env });
    if (options.cwd.endsWith('BackEnd') && args.join(' ') === 'run build') {
      mkdirSync(path.join(root, 'BackEnd', 'dist'), { recursive: true });
      writeFileSync(path.join(root, 'BackEnd', 'dist', 'function.zip'), 'function');
    }
    if (options.cwd.endsWith('BackEnd') && args.join(' ') === 'run build-db') {
      const db = new DatabaseSync(path.join(root, 'DB', 'app.db'));
      db.exec('CREATE TABLE demo (id INTEGER PRIMARY KEY, value TEXT)');
      db.close();
    }
    if (options.cwd.endsWith('FrontEnd') && args.join(' ') === 'run build') {
      mkdirSync(path.join(root, 'FrontEnd', 'dist'), { recursive: true });
      writeFileSync(path.join(root, 'FrontEnd', 'dist', 'index.html'), 'ok');
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ method: options.method, path: `${parsed.pathname}${parsed.search}`, body: options.body });
    let payload = {};
    if (parsed.pathname === '/api/databases') payload = { database: 'demo_db', created: true, adminLogin: { user: 'admin', password: '<shown-once>' } };
    else if (parsed.pathname === '/api/backends' && options.method === 'POST') payload = { backend: 'demo-api', url: 'https://demo-api.azurewebsites.net', created: true };
    else if (parsed.pathname === '/api/apps' && options.method === 'POST') payload = { account: 'demoweb', app: 'demo', owner: 'owner', url: 'https://demoweb.example/' };
    else if (parsed.pathname === '/api/apps/demoweb/deploy') payload = { url: 'https://demoweb.example/', uploaded: 2 };
    else if (parsed.pathname.endsWith('/deployment')) payload = deploymentPoll++ === 0
      ? { id: 'old', state: 'success', complete: true }
      : { id: 'new', state: 'success', complete: true };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const said = [];
    const result = await buildAndPublish(root, 'demo', 'owner', {
      baseUrl: 'https://provisioner.example', key: 'example-key', repo: 'owner/demo', runner, fetchImpl,
      pollInterval: 0, sleep: async () => {}, log: message => said.push(message)
    });
    // Each slow cloud step says what it is doing, so the Actions log is never silent for a minute.
    assert.deepEqual(said.map(m => m.split(':')[0].split(' (')[0].replace(/…$/, '')), [
      'Publishing the database schema', 'Setting up the backend', 'Deploying the backend to its Function App', 'Backend deployed', 'Publishing the website'
    ]);
    assert.equal(result.url, 'https://demoweb.example/');
    assert.equal(result.backend.deployed, true);
    assert.equal(result.database.database, 'demo_db');
    const steps = calls.map(call => [call.method, call.path]);
    assert.deepEqual(steps.slice(0, 3), [
      ['POST', '/api/databases'], ['POST', '/api/backends'], ['POST', '/api/backends/demo-api/database']
    ]);
    assert.ok(steps.findIndex(step => step[1] === '/api/apps') < steps.findIndex(step => step[1] === '/api/backends/demo-api/cors'));
    assert.ok(steps.findIndex(step => step[1] === '/api/backends/demo-api/cors') < steps.findIndex(step => step[1] === '/api/backends/demo-api/deploy'));
    // Without dist/build.json (a BackEnd from before /api/health) the deploy does not wait for a build it would never see.
    assert.equal(steps.some(step => step[1].endsWith('/api/health')), false);
    // The new website goes up only once the new backend runs: an old site on a new backend is fine, the other way round is not.
    assert.ok(steps.findLastIndex(step => step[1] === '/api/backends/demo-api/deployment') < steps.findIndex(step => step[1].startsWith('/api/apps/demoweb/deploy')));
    const frontendBuild = commands.find(command => command.cwd.endsWith('FrontEnd') && command.args.join(' ') === 'run build');
    assert.equal(frontendBuild.env.VITE_API_BASE_URL, 'https://demo-api.azurewebsites.net');
    const databaseRequest = calls.find(call => call.path === '/api/databases');
    assert.doesNotMatch(Buffer.from(databaseRequest.body).toString(), /shown-once/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the deployed FrontEnd build never receives the SAP account (Vite would write it into the page)', async () => {
  const root = fixture();
  const commands = [];
  const runner = (_command, args, options) => {
    commands.push({ args, cwd: options.cwd, env: options.env });
    if (options.cwd.endsWith('BackEnd') && args.join(' ') === 'run build') {
      mkdirSync(path.join(root, 'BackEnd', 'dist'), { recursive: true });
      writeFileSync(path.join(root, 'BackEnd', 'dist', 'function.zip'), 'function');
    }
    if (options.cwd.endsWith('BackEnd') && args.join(' ') === 'run build-db') {
      const db = new DatabaseSync(path.join(root, 'DB', 'app.db'));
      db.exec('CREATE TABLE demo (id INTEGER PRIMARY KEY)');
      db.close();
    }
    if (options.cwd.endsWith('FrontEnd') && args.join(' ') === 'run build') {
      mkdirSync(path.join(root, 'FrontEnd', 'dist'), { recursive: true });
      writeFileSync(path.join(root, 'FrontEnd', 'dist', 'index.html'), 'ok');
    }
    return { status: 0 };
  };
  const fetchImpl = async (url, options) => {
    const { pathname } = new URL(url);
    if (pathname === '/api/databases') return json({ database: 'demo_db' });
    if (pathname === '/api/backends' && options.method === 'POST') return json({ backend: 'demo-api', url: 'https://demo-api.azurewebsites.net' });
    if (pathname === '/api/apps' && options.method === 'POST') return json({ account: 'demoweb', url: 'https://demoweb.example/' });
    if (pathname.endsWith('/deployment')) return json({ id: `run-${polls++}`, state: 'success', complete: true });
    return json({});
  };
  let polls = 0;
  const names = ['VITE_SAP_USERNAME', 'VITE_SAP_PASSWORD'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.VITE_SAP_USERNAME = 'SAP_DEFAULT_USER';
  process.env.VITE_SAP_PASSWORD = 'example-sap-secret';
  try {
    await buildAndPublish(root, 'demo', 'owner', { baseUrl: 'https://p.example', key: 'k', repo: 'owner/demo', runner, fetchImpl, pollInterval: 0, sleep: async () => {}, log: () => {} });
    const frontend = commands.filter(command => command.cwd.endsWith('FrontEnd'));
    assert.ok(frontend.some(command => command.args.join(' ') === 'run build'));
    for (const command of frontend) {
      for (const name of names) assert.ok(!command.env[name], `${name} reaches npm ${command.args.join(' ')}`);
      assert.doesNotMatch(JSON.stringify(command.env), /SAP_DEFAULT_USER|example-sap-secret/);
    }
  } finally {
    for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
    rmSync(root, { recursive: true, force: true });
  }
  const workflow = readFileSync(path.join(import.meta.dirname, '..', '..', '.github', 'workflows', 'deploy.yml'), 'utf8');
  for (const name of names) assert.doesNotMatch(workflow, new RegExp(name));
});

test('sealed boxes match libsodium (crypto_box_seal) for GitHub Actions secrets', () => {
  for (const length of [0, 1, 127, 128, 129, 300]) {
    const data = Buffer.alloc(length, length % 251);
    assert.ok(blake2b(data, 64).equals(createHash('blake2b512').update(data).digest()), `BLAKE2b, ${length} bytes`);
  }
  // Vector from libsodium: recipient secret 32 x 0x07, ephemeral secret 32 x 0x09, message 'provisioner-key'.
  const recipient = Buffer.from('13be4feaeaf204c7fd3358fc9c00721881d174278128227ec674f37f7fe97b6d', 'hex');
  const sealed = sealedBox(Buffer.from('provisioner-key'), recipient, { ephemeralSecret: Buffer.alloc(32, 9) });
  assert.equal(sealed.toString('base64'), 'V9tLNZ8jrl4Ubk4lEgVnBHIlBjSMFQwUdT0Mkz0E1CEBVmlFUuA/JGV23Iek4D6lU+OcTZzsV/92z7FyGYwH');
  assert.notDeepEqual(sealedBox(Buffer.from('x'), recipient), sealedBox(Buffer.from('x'), recipient));
});

test('the pre-push scan allows settings-only .npmrc files and blocks dotenv keys', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sap-scan-'));
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  try {
    git('init', '-q');
    mkdirSync(path.join(root, 'FrontEnd'));
    writeFileSync(path.join(root, 'FrontEnd', '.npmrc'), 'legacy-peer-deps=true\n');
    writeFileSync(path.join(root, '.env.example'), 'APP_PASSWORD=demo\nPROVISIONER_KEY=\n');
    git('add', '--all');
    assertNoCredentialFiles(root);
    writeFileSync(path.join(root, 'FrontEnd', '.npmrc'), `//registry.npmjs.org/:_authToken=${'n'.repeat(20)}\n`);
    git('add', '--all');
    assert.throws(() => assertNoCredentialFiles(root), /credential-bearing files: FrontEnd\/\.npmrc/);
  } finally { rmSync(root, { recursive: true, force: true }); }
  assert.ok(credentialProblems(Buffer.from(`PROVISIONER_KEY=${'Ab3'.repeat(10)}==\n`)).length > 0);
  assert.deepEqual(credentialProblems(Buffer.from('PROVISIONER_KEY=<your team host key>\nAPP_PASSWORD=demo\n')), []);
});

test('the Actions secret is sealed to the repository key and the workflow is switched on', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const { pathname } = new URL(url);
    calls.push([options.method, pathname, options.body ? JSON.parse(options.body) : undefined]);
    if (pathname.endsWith('/public-key')) return json({ key_id: 'k1', key: Buffer.alloc(32, 5).toString('base64') });
    if (options.method === 'PATCH' && pathname.endsWith('/DEPLOY_FROM_MAIN')) return json({}, 404);
    return json({}, 204);
  };
  await configureActions('owner/demo', 'token', { key: 'team-key', baseUrl: 'https://p.example', owner: 'owner' }, { fetchImpl });
  const secret = calls.find(call => call[0] === 'PUT');
  assert.equal(secret[1], '/repos/owner/demo/actions/secrets/PROVISIONER_KEY');
  assert.equal(secret[2].key_id, 'k1');
  assert.equal(Buffer.from(secret[2].encrypted_value, 'base64').length, 32 + 16 + 'team-key'.length);
  assert.doesNotMatch(JSON.stringify(calls), /team-key/);
  assert.deepEqual(calls.at(-1), ['POST', '/repos/owner/demo/actions/variables', { name: 'DEPLOY_FROM_MAIN', value: 'true' }]);
});

test('the local deployment waits for the Deploy run of its commit on main', async () => {
  const sha = 'a'.repeat(40);
  const states = [{ status: 'in_progress' }, { status: 'completed', conclusion: 'success' }];
  const fetchImpl = async url => {
    const { pathname } = new URL(url);
    if (pathname.endsWith('/workflows/deploy.yml/runs')) {
      return json({ workflow_runs: [{ id: 7, head_sha: sha, status: 'queued', created_at: new Date().toISOString(), html_url: 'https://run' }] });
    }
    return json({ id: 7, head_sha: sha, html_url: 'https://run', ...states.shift() });
  };
  const options = { fetchImpl, sleep: async () => {}, log: () => {} };
  assert.equal((await waitForDeployment('owner/demo', 'token', sha, options)).conclusion, 'success');
  states.push({ status: 'completed', conclusion: 'failure' });
  await assert.rejects(waitForDeployment('owner/demo', 'token', sha, options), /ended with "failure": https:\/\/run/);
});

test('an unchanged main is redeployed through workflow_dispatch on main', async () => {
  const sha = 'b'.repeat(40);
  const calls = [];
  const fetchImpl = async (url, options) => {
    const { pathname } = new URL(url);
    calls.push([options.method, pathname, options.body && JSON.parse(options.body)]);
    if (pathname.endsWith('/dispatches')) return json({}, 204);
    return json({ workflow_runs: [{ id: 8, head_sha: sha, status: 'completed', conclusion: 'success', created_at: new Date().toISOString(), html_url: 'https://run' }] });
  };
  await waitForDeployment('owner/demo', 'token', sha, { dispatch: true, fetchImpl, sleep: async () => {}, log: () => {} });
  assert.deepEqual(calls[0], ['POST', '/repos/owner/demo/actions/workflows/deploy.yml/dispatches', { ref: 'main' }]);
});

test('a push GitHub starts no run for is deployed through workflow_dispatch on main', async () => {
  const sha = 'c'.repeat(40);
  const calls = [];
  let dispatched = false;
  const fetchImpl = async (url, options) => {
    const { pathname } = new URL(url);
    calls.push([options.method, pathname]);
    if (pathname.endsWith('/dispatches')) { dispatched = true; return json({}, 204); }
    const runs = dispatched ? [{ id: 9, head_sha: sha, status: 'completed', conclusion: 'success', created_at: new Date().toISOString(), html_url: 'https://run' }] : [];
    return json({ workflow_runs: runs });
  };
  const logs = [];
  const run = await waitForDeployment('owner/demo', 'token', sha, { fetchImpl, sleep: async () => {}, log: message => logs.push(message) });
  assert.equal(run.id, 9);
  assert.equal(calls.filter(call => call[1].endsWith('/dispatches')).length, 1);
  assert.match(logs[0], /started no run for the push/);
});

test('GitHub calls retry dropped connections and say why they failed', async () => {
  let count = 0;
  const dropped = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) });
  const flaky = async () => { count += 1; if (count < 3) throw dropped(); return json({ login: 'owner' }); };
  assert.equal((await githubRequest('/user', 'token', { fetchImpl: flaky, sleep: async () => {} })).login, 'owner');
  assert.equal(count, 3);
  const down = async () => { throw dropped(); };
  await assert.rejects(githubRequest('/user', 'token', { fetchImpl: down, sleep: async () => {} }), /5 attempts\): fetch failed \(UND_ERR_SOCKET other side closed\)/);
  count = 0;
  const counting = async () => { count += 1; throw dropped(); };
  await assert.rejects(githubRequest('/user/repos', 'token', { method: 'POST', body: {}, fetchImpl: counting, sleep: async () => {} }), /1 attempt\)/);
  assert.equal(count, 1);
});

test('without internet, GitHub calls wait for it (any method: the request never left this PC), up to the offline limit', async () => {
  const offline = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.github.com'), { code: 'ENOTFOUND' }) });
  let count = 0, waited = 0;
  const notes = [];
  const back = async () => { count += 1; if (count <= 8) throw offline(); return json({ id: 1 }); };
  const sleep = async ms => { waited += ms; };
  assert.equal((await githubRequest('/user/repos', 'token', { method: 'POST', body: {}, fetchImpl: back, sleep, onOffline: m => notes.push(m) })).id, 1);
  assert.equal(count, 9);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /No internet connection \(ENOTFOUND\): waiting for it, up to 10 minutes/);
  assert.ok(waited > 60_000 && waited <= 10 * 60_000);
  count = 0;
  const never = async () => { count += 1; throw offline(); };
  await assert.rejects(githubRequest('/user', 'token', { fetchImpl: never, sleep: async () => {}, offlineWait: 60_000 }), /Cannot reach GitHub .*ENOTFOUND/);
  assert.ok(count > 2);
});

test('Azure provisioner calls retry what is safe to repeat and wait for the internet', async () => {
  const offline = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
  const dropped = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) });
  const base = 'https://prov.example.test';
  const sleep = async () => {};
  // A GET: dropped connections and 503 are retried.
  let count = 0;
  const flaky = async () => { count += 1; if (count === 1) throw dropped(); if (count === 2) return json({ error: 'busy' }, 503); return json({ apps: [] }); };
  assert.deepEqual(await apiRequest(base, 'k', 'GET', '/api/apps', { fetchImpl: flaky, sleep }), { apps: [] });
  assert.equal(count, 3);
  // A POST that creates something: a connection dropped after sending is not repeated (it may have landed).
  count = 0;
  const droppedPost = async () => { count += 1; throw dropped(); };
  await assert.rejects(apiRequest(base, 'k', 'POST', '/api/backends', { fetchImpl: droppedPost, sleep }), /Cannot reach the Azure provisioner/);
  assert.equal(count, 1);
  // ... but one that never left this PC is, after the internet is back.
  count = 0;
  const notes = [];
  const back = async () => { count += 1; if (count <= 3) throw offline(); return json({ backend: 'b', url: 'https://b' }); };
  assert.equal((await apiRequest(base, 'k', 'POST', '/api/backends', { fetchImpl: back, sleep, onOffline: m => notes.push(m) })).backend, 'b');
  assert.equal(count, 4);
  assert.match(notes[0], /No internet connection \(ECONNREFUSED\)/);
  // A POST marked safe to repeat (an upload that replaces the last one) is retried like a GET.
  count = 0;
  const upload = async () => { count += 1; if (count === 1) throw dropped(); return json({ ok: true }); };
  assert.deepEqual(await apiRequest(base, 'k', 'POST', '/api/apps/a/deploy?clean=true', { retry: true, fetchImpl: upload, sleep }), { ok: true });
  assert.equal(count, 2);
  // A 4xx is an answer, never retried.
  count = 0;
  const refused = async () => { count += 1; return json({ error: 'bad key' }, 401); };
  await assert.rejects(apiRequest(base, 'k', 'GET', '/api/apps', { fetchImpl: refused, sleep }), /HTTP 401: bad key/);
  assert.equal(count, 1);
});

test('the website goes up only once the backend answers /api/health with the new commit (Azure says "success" before it restarts)', async () => {
  const { waitForBackendBuild } = await import('./provisioner.mjs');
  const seen = [];
  let polls = 0;
  const fetchImpl = async url => {
    seen.push(String(url));
    polls += 1;
    if (polls === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    if (polls === 2) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ ok: true, build: polls === 3 ? 'old' : 'abc1234def' }), { status: 200 });
  };
  const said = [];
  assert.equal(await waitForBackendBuild('https://api.example', 'abc1234def', { fetchImpl, sleep: async () => {}, log: m => said.push(m) }), true);
  assert.equal(polls, 4);
  assert.equal(seen[0], 'https://api.example/api/health');
  assert.match(said.at(-1), /^Backend runs abc1234/);
  // No commit known (a run outside GitHub Actions): nothing to wait for.
  assert.equal(await waitForBackendBuild('https://api.example', '', { fetchImpl, sleep: async () => {}, log: () => {} }), false);
  // It never shows: the website still goes up after the limit, and the log says so.
  const never = async () => new Response(JSON.stringify({ ok: true, build: 'old' }), { status: 200 });
  const late = [];
  assert.equal(await waitForBackendBuild('https://api.example', 'abc1234def', { fetchImpl: never, sleep: async () => {}, log: m => late.push(m), limit: 3 }), false);
  assert.match(late.at(-1), /did not report abc1234 yet/);
});

test('a variable whose create was retried after it already landed is updated instead', async () => {
  const calls = [];
  let patches = 0;
  const fetchImpl = async (url, options) => {
    calls.push(options.method);
    if (options.method === 'PATCH') return json({}, patches++ === 0 ? 404 : 204);
    return json({ message: 'Already exists' }, 409);
  };
  await setActionsVariable('owner/demo', 'token', 'DEPLOY_FROM_MAIN', 'true', { fetchImpl, sleep: async () => {} });
  assert.deepEqual(calls, ['PATCH', 'POST', 'PATCH']);
});

test('CI deploys only main, inside GitHub Actions, and never prints a new admin login', async () => {
  assert.equal(parseArguments(['--ci']).ci, true);
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'owner/demo', GITHUB_REF: 'refs/heads/main', PROVISIONER_KEY: 'k' };
  const seen = [];
  const secretField = ['pass', 'word'].join('');
  const publish = async (...args) => { seen.push(args); return { url: 'https://site/', database: { adminLogin: { [secretField]: 'never-printed' } } }; };
  const writes = [];
  const write = process.stdout.write;
  process.stdout.write = chunk => { writes.push(String(chunk)); return true; };
  try { await deployFromCi({ root: '.' }, env, publish); } finally { process.stdout.write = write; }
  assert.equal(seen[0][1], 'demo');
  assert.equal(seen[0][2], 'owner');
  assert.equal(seen[0][3].reuseExisting, true);
  assert.doesNotMatch(writes.join(''), /never-printed/);
  await assert.rejects(deployFromCi({ root: '.' }, { ...env, GITHUB_REF: 'refs/heads/develop' }, publish), /main only/);
  await assert.rejects(deployFromCi({ root: '.' }, { ...env, GITHUB_ACTIONS: '' }, publish), /only inside GitHub Actions/);
});

test('local provisioning creates the database and backend but uploads no code', async () => {
  const root = fixture();
  const paths = [];
  const runner = (_command, args) => {
    if (args.join(' ') === 'run build-db') {
      const db = new DatabaseSync(path.join(root, 'DB', 'app.db'));
      db.exec('CREATE TABLE demo (id INTEGER PRIMARY KEY)');
      db.close();
    }
    return { status: 0 };
  };
  const fetchImpl = async (url, options) => {
    const { pathname } = new URL(url);
    paths.push(`${options.method} ${pathname}`);
    if (pathname === '/api/databases') return json({ database: 'demo_db', adminLogin: { user: 'admin' } });
    if (pathname === '/api/backends') return json({ backend: 'demo-api', url: 'https://demo-api.azurewebsites.net' });
    return json({});
  };
  try {
    const result = await provisionInfrastructure(root, 'demo', 'owner', { baseUrl: 'https://p.example', key: 'k', repo: 'owner/demo', runner, fetchImpl });
    assert.equal(result.backend.api_url, 'https://demo-api.azurewebsites.net');
    assert.deepEqual(paths, ['POST /api/databases', 'POST /api/backends', 'POST /api/backends/demo-api/database']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
