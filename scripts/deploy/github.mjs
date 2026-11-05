// Browser authentication, private repository creation, the Actions secret and variables the Deploy workflow needs,
// one authenticated push to main, and waiting for the workflow run that deploys main.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { networkDetail, notSent, offlineWaiter, OFFLINE_WAIT, retryDelay } from './network.mjs';
import { sealedBox } from './sealed-box.mjs';

export class GitHubError extends Error {}

function command(executable, arguments_, options = {}, runner = spawnSync) {
  const result = runner(executable, arguments_, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.error) throw new GitHubError(`${executable} is unavailable: ${result.error.message}`);
  return result;
}

/** Authenticate through Git Credential Manager. It opens GitHub in the user's browser only when needed. */
export function githubCredential(runner = spawnSync) {
  const input = 'protocol=https\nhost=github.com\n\n';
  let result = command('git', ['credential-manager', 'get', '--no-ui'], { input }, runner);
  if (result.status !== 0 || !/^password=/m.test(result.stdout || '')) {
    process.stdout.write('Opening GitHub sign-in in your browser...\n');
    const login = command('git', ['credential-manager', 'github', 'login', '--url', 'https://github.com', '--browser'], { stdio: 'inherit' }, runner);
    if (login.status !== 0) throw new GitHubError('GitHub browser sign-in did not complete. Git for Windows with Credential Manager is required.');
    result = command('git', ['credential-manager', 'get', '--no-ui'], { input }, runner);
  }
  if (result.status !== 0) throw new GitHubError('GitHub credentials could not be read from the OS credential store.');
  const fields = new Map(String(result.stdout || '').split(/\r?\n/).filter(Boolean).map(line => {
    const split = line.indexOf('=');
    return [line.slice(0, split), line.slice(split + 1)];
  }));
  const token = fields.get('password');
  if (!token) throw new GitHubError('GitHub sign-in completed without a usable credential.');
  return { username: fields.get('username') || '', token };
}


/**
 * One GitHub REST call. A dropped connection or a 502/503/504 is retried with backoff: after the minutes of
 * install + verify, the first call often lands on a connection the network already closed. POST is not idempotent,
 * so it is retried only when the caller says a repeat is harmless (`retry: true`). Without internet (the request never
 * left this PC) any call waits for it, up to `offlineWait`, and says so once through `onOffline`.
 */
export async function githubRequest(resourcePath, token, {
  method = 'GET', body, fetchImpl = fetch, allowNotFound = false, retry, attempts = 5, sleep = retryDelay,
  offlineWait = OFFLINE_WAIT, onOffline
} = {}) {
  const retryable = retry ?? method !== 'POST';
  const waitOnline = offlineWaiter({ limit: offlineWait, sleep, ...(onOffline ? { onOffline } : {}) });
  let response;
  for (let attempt = 1; ; attempt += 1) {
    const last = !retryable || attempt >= attempts;
    try {
      response = await fetchImpl(`https://api.github.com${resourcePath}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'sap-application-deployer',
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000)
      });
    } catch (error) {
      // Not sent: the same attempt again once the internet is back.
      if (notSent(error) && await waitOnline(error)) { attempt -= 1; continue; }
      if (last || notSent(error)) throw new GitHubError(`Cannot reach GitHub (${method} ${resourcePath.split('?')[0]}, ${attempt} attempt${attempt > 1 ? 's' : ''}): ${networkDetail(error)}`);
      await sleep(2_000 * 2 ** (attempt - 1));
      continue;
    }
    if (last || ![502, 503, 504].includes(response.status)) break;
    await sleep(2_000 * 2 ** (attempt - 1));
  }
  if (allowNotFound && response.status === 404) return null;
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    const detail = data.message || text || response.statusText;
    throw new GitHubError(`GitHub returned HTTP ${response.status}: ${String(detail).slice(0, 500)}`);
  }
  return data;
}

export function validateRepositoryName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name) || name.endsWith('.git')) {
    throw new GitHubError('Invalid GitHub repository name');
  }
  return name;
}

export function validateBranchName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(name) || name === 'main'
    || name.includes('..') || name.includes('@{') || name.includes('//') || /[/.]$/.test(name)
    || name.split('/').some(part => part.startsWith('.') || part.endsWith('.lock'))) {
    throw new GitHubError('Choose a valid working branch name other than main');
  }
  return name;
}

const cookieName = ['SAP', 'SESSIONID'].join('_');
const keyMarker = ['PRIVATE', 'KEY'].join(' ');
const aiPrefix = ['sk', 'proj-'].join('-');
const strongCredential = new RegExp(`-----BEGIN (?:RSA |EC |OPENSSH )?${keyMarker}-----|\\b(?:sk-ant-|${aiPrefix})[A-Za-z0-9_-]{16,}|${cookieName}[^\\s=]*=\\S+|\\b(?:Bearer|Basic)\\s+[A-Za-z0-9/+_=.-]{12,}`, 'i');
const credentialAssignment = /["']?(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization)["']?\s*[:=]\s*["']([^"'\r\n]{4,})["']/gi;
// dotenv style, unquoted: PROVISIONER_KEY=<long value>. Short values (APP_PASSWORD=demo) are documented defaults.
const envCredential = /^[ \t]*(?:export[ \t]+)?[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)[ \t]*=[ \t]*([^\s#]{16,})/gm;
const allowedCredentialValue = /^(?:\*+|redacted|<[^>]+>|\{[^}]+}|your[-_ ].*|example[-_ ].*|placeholder.*|process\.env.*|\$env:.*|\$\{.*|os\.environ.*|env:.*|\.\.\.)$/i;

export function credentialProblems(data) {
  const text = `${data.toString('utf8')}\n${data.toString('latin1')}`;
  const found = [];
  const strong = strongCredential.exec(text);
  if (strong) found.push(strong[0]);
  for (const match of text.matchAll(credentialAssignment)) if (!allowedCredentialValue.test(match[1].trim())) found.push(match[0]);
  for (const match of text.matchAll(envCredential)) if (!allowedCredentialValue.test(match[1].trim())) found.push(match[0]);
  return found;
}

/** An .npmrc is safe to push when it holds settings only (such as legacy-peer-deps), no registry credentials. */
export function npmrcHasCredentials(data) {
  return /(?:^|[:\s])_(?:auth|authToken|password)\s*=/m.test(data.toString('utf8'));
}

function runGit(root, arguments_, { environment, runner = spawnSync, allowFailure = false } = {}) {
  const result = command('git', ['-C', root, ...arguments_], { env: environment || process.env }, runner);
  if (!allowFailure && result.status !== 0) {
    const detail = String(result.stderr || result.stdout || 'Git command failed').trim().split(/\r?\n/).at(-1);
    throw new GitHubError(detail);
  }
  return result;
}

export function assertNoCredentialFiles(root, runner = spawnSync) {
  const result = runGit(root, ['ls-files', '-z', '--cached'], { runner });
  const unsafe = String(result.stdout || '').split('\0').filter(Boolean).filter(file => {
    const parts = file.replace(/\\/g, '/').split('/');
    return parts.some(part => part === '.env' || (part.startsWith('.env.') && !['.env.example', '.env.sample'].includes(part))
      || part === 'local.settings.json' || /\.(?:pem|key|p12|pfx)$/i.test(part))
      || (parts.at(-1) === '.npmrc' && npmrcHasCredentials(readFileSync(path.join(root, file))));
  });
  if (unsafe.length) throw new GitHubError(`Refusing to push credential-bearing files: ${unsafe.join(', ')}`);
  const contentHits = String(result.stdout || '').split('\0').filter(Boolean).flatMap(file =>
    credentialProblems(readFileSync(path.join(root, file))).map(() => file));
  if (contentHits.length) {
    throw new GitHubError(`Refusing to push possible credentials in: ${[...new Set(contentHits)].join(', ')}`);
  }
}

export function commitProject(root, user, runner = spawnSync) {
  const top = runGit(root, ['rev-parse', '--show-toplevel'], { runner, allowFailure: true });
  if (top.status !== 0 || path.resolve(String(top.stdout).trim()) !== path.resolve(root)) runGit(root, ['init', '-b', 'main'], { runner });
  runGit(root, ['config', 'user.name', user.name || user.login], { runner });
  runGit(root, ['config', 'user.email', `${user.id}+${user.login}@users.noreply.github.com`], { runner });
  runGit(root, ['config', 'core.longpaths', 'true'], { runner });
  runGit(root, ['add', '--all'], { runner });
  assertNoCredentialFiles(root, runner);
  const staged = runGit(root, ['diff', '--cached', '--quiet'], { runner, allowFailure: true });
  const head = runGit(root, ['rev-parse', '--verify', 'HEAD'], { runner, allowFailure: true });
  if (head.status !== 0 || staged.status !== 0) runGit(root, ['commit', '-m', head.status === 0 ? 'Prepare Azure deployment' : 'Initial application'], { runner });
  return runGit(root, ['rev-parse', 'HEAD'], { runner }).stdout.trim();
}

function gitEnvironment(token) {
  const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
  return { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${auth}`, GIT_TERMINAL_PROMPT: '0' };
}

/** The commit GitHub's main points at, or '' when the repository has no main yet. */
export function remoteMain(root, token, runner = spawnSync) {
  const result = runGit(root, ['ls-remote', 'origin', 'refs/heads/main'], { runner, environment: gitEnvironment(token) });
  return String(result.stdout || '').trim().split(/\s+/)[0] || '';
}

/**
 * Commits the working tree and, for a repository that already exists, replays that commit on top of GitHub's latest
 * main, so what is verified and pushed always includes every change already on main. A conflict stops here.
 */
export async function prepareRepository(root, repositoryName, credential, options = {}) {
  const name = validateRepositoryName(repositoryName);
  const runner = options.runner;
  const user = await githubRequest('/user', credential.token, { fetchImpl: options.fetchImpl });
  if (!user.login || !user.id) throw new GitHubError('GitHub did not return the signed-in account.');
  commitProject(root, user, runner);
  const fullName = `${user.login}/${name}`;
  const existing = await githubRequest(`/repos/${encodeURIComponent(user.login)}/${encodeURIComponent(name)}`, credential.token,
    { fetchImpl: options.fetchImpl, allowNotFound: true });
  const origin = runGit(root, ['remote', 'get-url', 'origin'], { runner, allowFailure: true });
  if (existing && (origin.status !== 0 || !String(origin.stdout).trim().replace(/\.git$/, '').toLowerCase().endsWith(fullName.toLowerCase()))) {
    throw new GitHubError(`GitHub repository ${fullName} already exists and is not this project's origin; it was not changed.`);
  }
  if (existing && remoteMain(root, credential.token, runner)) {
    runGit(root, ['fetch', 'origin', 'main'], { runner, environment: gitEnvironment(credential.token) });
    const rebase = runGit(root, ['rebase', 'origin/main'], { runner, allowFailure: true });
    if (rebase.status !== 0) {
      runGit(root, ['rebase', '--abort'], { runner, allowFailure: true });
      throw new GitHubError('Local changes conflict with the latest main on GitHub. Run "git pull --rebase origin main", resolve the conflicts, then deploy again.');
    }
  }
  return { user, owner: user.login, name, fullName, existing, hasOrigin: origin.status === 0 };
}

/** Creates the private repository when it does not exist yet and points origin at it. Nothing is pushed here. */
export async function ensureRepository(root, prepared, credential, options = {}) {
  const repository = prepared.existing || await githubRequest('/user/repos', credential.token, {
    method: 'POST', fetchImpl: options.fetchImpl,
    body: { name: prepared.name, private: options.isPrivate !== false, auto_init: false, description: 'SAP application, deployed to Azure from main by GitHub Actions' }
  });
  if (!prepared.hasOrigin) runGit(root, ['remote', 'add', 'origin', `https://github.com/${prepared.fullName}.git`], { runner: options.runner });
  return { ...prepared, htmlUrl: repository.html_url || `https://github.com/${prepared.fullName}`, reused: Boolean(prepared.existing) };
}

/** Stores an Actions secret, encrypted to the repository's public key (GitHub never returns it in clear). */
export async function setActionsSecret(fullName, token, secretName, value, { fetchImpl, sleep } = {}) {
  const publicKey = await githubRequest(`/repos/${fullName}/actions/secrets/public-key`, token, { fetchImpl, sleep });
  if (!publicKey.key || !publicKey.key_id) throw new GitHubError('GitHub did not return the repository public key for secrets.');
  const encrypted = sealedBox(Buffer.from(value, 'utf8'), Buffer.from(publicKey.key, 'base64')).toString('base64');
  await githubRequest(`/repos/${fullName}/actions/secrets/${secretName}`, token, {
    method: 'PUT', body: { encrypted_value: encrypted, key_id: publicKey.key_id }, fetchImpl, sleep
  });
}

/** Creates or updates a plain (non-secret) Actions variable. */
export async function setActionsVariable(fullName, token, variableName, value, { fetchImpl, sleep } = {}) {
  const update = () => githubRequest(`/repos/${fullName}/actions/variables/${variableName}`, token, {
    method: 'PATCH', body: { name: variableName, value }, fetchImpl, sleep, allowNotFound: true
  });
  if (await update() !== null) return;
  try {
    // Retrying the create is safe: if an earlier attempt did create it, GitHub answers 409 and it is updated instead.
    await githubRequest(`/repos/${fullName}/actions/variables`, token, { method: 'POST', body: { name: variableName, value }, fetchImpl, sleep, retry: true });
  } catch (error) {
    if (!/HTTP 409/.test(error.message)) throw error;
    await update();
  }
}

/** What .github/workflows/deploy.yml needs to deploy main: the provisioner key (secret), its URL and the owner. */
export async function configureActions(fullName, token, { key, baseUrl, owner }, options = {}) {
  await setActionsSecret(fullName, token, 'PROVISIONER_KEY', key, options);
  await setActionsVariable(fullName, token, 'PROVISIONER_BASE_URL', baseUrl, options);
  await setActionsVariable(fullName, token, 'PROVISIONER_OWNER', owner, options);
  await setActionsVariable(fullName, token, 'DEPLOY_FROM_MAIN', 'true', options);
}

/**
 * Pushes the local commit to main (never forced). The working branch is created only with the repository.
 * Returns the pushed commit and whether main moved; when it did not, no push event starts the workflow.
 */
export function pushMain(root, token, { createWorkingBranch = false, workingBranch = 'develop', runner = spawnSync } = {}) {
  const before = remoteMain(root, token, runner);
  const commit = String(runGit(root, ['rev-parse', 'HEAD'], { runner }).stdout).trim();
  const refs = ['HEAD:main', ...(createWorkingBranch ? [`HEAD:refs/heads/${validateBranchName(workingBranch)}`] : [])];
  const push = runGit(root, ['push', 'origin', ...refs], { runner, environment: gitEnvironment(token), allowFailure: true });
  if (push.status !== 0) {
    const detail = String(push.stderr || push.stdout || '').trim().split(/\r?\n/).at(-1);
    throw new GitHubError(`Pushing to main failed (${detail}). If main moved meanwhile, run the deployment again.`);
  }
  return { commit, moved: before !== commit };
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
export const DEPLOY_WORKFLOW = 'deploy.yml';

/**
 * Waits for the Deploy workflow run of `commit` on main and returns it when it succeeds. The run is started by hand
 * (workflow_dispatch on main) when main did not move (nothing new to push), and also when GitHub starts no run for
 * the push within `pushGrace`: it sometimes skips the very first push to a newly created repository. Either way the
 * deployment is a run of the workflow on main, for this commit.
 */
export async function waitForDeployment(fullName, token, commit, options = {}) {
  const { dispatch = false, fetchImpl, sleep = wait, pollInterval = 15_000, startTimeout = 5 * 60_000,
    pushGrace = 2 * 60_000, runTimeout = 60 * 60_000, log = message => process.stdout.write(`${message}\n`) } = options;
  const workflow = `/repos/${fullName}/actions/workflows/${DEPLOY_WORKFLOW}`;
  const request = (resource, extra = {}) => githubRequest(resource, token, { fetchImpl, sleep, onOffline: log, ...extra });
  const startPolls = Math.ceil(startTimeout / pollInterval);
  const since = Date.now() - 60_000;
  const dispatchMain = async () => {
    for (let poll = 0; poll < startPolls; poll += 1) {
      // A workflow pushed seconds ago may not be registered yet: GitHub answers 404 until it is.
      if (await request(`${workflow}/dispatches`, { method: 'POST', body: { ref: 'main' }, allowNotFound: true }) !== null) return;
      await sleep(pollInterval);
    }
    throw new GitHubError(`The ${DEPLOY_WORKFLOW} workflow is not on main in ${fullName}.`);
  };
  const findRun = async () => {
    const page = await request(`${workflow}/runs?branch=main&head_sha=${commit}&per_page=10`, { allowNotFound: true });
    // A redeploy of an unchanged main must not pick up an older run of the same commit.
    return (page?.workflow_runs || []).filter(item => item.head_sha === commit && (!dispatch || Date.parse(item.created_at) >= since))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
  };
  if (dispatch) await dispatchMain();
  let dispatched = dispatch;
  let run = null;
  for (let poll = 0; !run; poll += 1) {
    run = await findRun();
    if (run) break;
    if (!dispatched && poll >= Math.ceil(pushGrace / pollInterval)) {
      log(`GitHub started no run for the push of ${commit.slice(0, 7)}: starting the Deploy workflow on main.`);
      await dispatchMain();
      dispatched = true;
      poll = 0;
      continue;
    }
    if (dispatched && poll >= startPolls) break;
    await sleep(pollInterval);
  }
  if (!run) throw new GitHubError(`No deployment run started for ${commit.slice(0, 7)}. Check that GitHub Actions is enabled: https://github.com/${fullName}/actions`);
  log(`Deploying from main on GitHub Actions: ${run.html_url}`);
  for (const deadline = Date.now() + runTimeout; Date.now() < deadline;) {
    if (run.status === 'completed') {
      if (run.conclusion === 'success') return run;
      if (run.conclusion === 'cancelled') throw new GitHubError(`The deployment run was cancelled (a newer push to main supersedes it): ${run.html_url}`);
      throw new GitHubError(`The deployment run ended with "${run.conclusion}": ${run.html_url}`);
    }
    await sleep(pollInterval);
    run = await request(`/repos/${fullName}/actions/runs/${run.id}`);
  }
  throw new GitHubError(`The deployment run did not finish within ${Math.round(runTimeout / 60_000)} minutes: ${run.html_url}`);
}

export function projectName(root) {
  try { return validateRepositoryName(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).name); }
  catch { return validateRepositoryName(path.basename(root).toLowerCase().replace(/[^a-z0-9._-]+/g, '-')); }
}
