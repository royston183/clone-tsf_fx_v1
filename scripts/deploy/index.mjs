#!/usr/bin/env node
// npm run deploy: the application always deploys from GitHub's main, never from this folder.
//   Local (npm run deploy):  commit, replay on the latest main, verify, create the private repository and the Actions
//                            secret, provision the database and Function App, push main, wait for the Deploy workflow.
//   CI (--ci, in .github/workflows/deploy.yml on main): build the checked-out main and publish it to Azure.
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { deploymentConfig } from './config.mjs';
import { buildAndPublish, liveUrl, provisionInfrastructure } from './provisioner.mjs';
import {
  configureActions, ensureRepository, githubCredential, prepareRepository, projectName, pushMain, validateRepositoryName,
  waitForDeployment
} from './github.mjs';

export function parseArguments(values) {
  const options = { root: '.', yes: false, ci: false, isPrivate: true, workingBranch: 'develop' };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--yes') options.yes = true;
    else if (value === '--ci') options.ci = true;
    else if (value === '--public') options.isPrivate = false;
    else if (['--root', '--name', '--config', '--working-branch'].includes(value)) {
      if (!values[index + 1]) throw new Error(`${value} needs a value`);
      const key = { '--root': 'root', '--name': 'name', '--config': 'config', '--working-branch': 'workingBranch' }[value];
      options[key] = values[++index];
    } else if (!value.startsWith('-') && options.root === '.') options.root = value;
    else throw new Error(`Unknown deployment option: ${value}`);
  }
  return options;
}

async function confirmDeployment() {
  if (!stdin.isTTY) return false;
  const prompt = createInterface({ input: stdin, output: stdout });
  try { return /^y(?:es)?$/i.test((await prompt.question('Tests are complete. Deploy it now? [y/N] ')).trim()); }
  finally { prompt.close(); }
}

function showDatabaseLogin(database) {
  const login = database?.adminLogin;
  if (!login) return;
  stdout.write('\nMySQL administrator login (shown once; save it now):\n');
  for (const [label, value] of [['Host', login.host], ['Port', login.port], ['Database', login.database], ['Username', login.user], ['Password', login.password]]) {
    stdout.write(`  ${label}: ${value}\n`);
  }
}

function runProjectCommand(root, script) {
  // Node 22.12+ refuses to spawn .cmd files without a shell on Windows (EINVAL), so npm runs through the shell there.
  const result = spawnSync('npm', ['run', script], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true, timeout: 60 * 60 * 1000 });
  if (result.error) throw new Error(`npm run ${script} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`npm run ${script} failed with exit code ${result.status ?? 'unknown'}`);
}

/** The CI half: only on GitHub Actions, only for main. The workflow has already installed and verified main. */
export async function deployFromCi(options, env = process.env, publish = buildAndPublish) {
  if (env.GITHUB_ACTIONS !== 'true' || !env.GITHUB_REPOSITORY) throw new Error('--ci runs only inside GitHub Actions');
  if (env.GITHUB_REF !== 'refs/heads/main') throw new Error(`Deployments come from main only, not ${env.GITHUB_REF || 'an unknown ref'}`);
  const root = path.resolve(options.root);
  const config = deploymentConfig(root, '', env);
  const [repoOwner, repoName] = env.GITHUB_REPOSITORY.split('/');
  const name = validateRepositoryName(repoName);
  const result = await publish(root, name, config.owner || repoOwner, {
    baseUrl: config.baseUrl, key: config.key, repo: env.GITHUB_REPOSITORY, reuseExisting: true, commit: env.GITHUB_SHA ?? ''
  });
  if (result.database?.adminLogin) {
    // Never in a CI log. The local `npm run deploy` creates the database first, so this only happens if it was skipped.
    stdout.write('::warning::A new MySQL database was created here; its admin login is not printed in CI. Ask the provisioner owner to reset it.\n');
  }
  if (result.error) throw new Error(result.error);
  stdout.write(`Deployed ${env.GITHUB_SHA || 'main'}.\nLive URL: ${result.url}\n`);
  if (result.backend?.api_url) stdout.write(`Backend URL: ${result.backend.api_url}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `### Deployed from main\n\n- Live URL: ${result.url}\n${result.backend?.api_url ? `- Backend URL: ${result.backend.api_url}\n` : ''}`);
  }
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.ci) return deployFromCi(options);
  const root = path.resolve(options.root);
  const name = validateRepositoryName(options.name || projectName(root));
  if (!options.yes && !(await confirmDeployment())) {
    stdout.write(`Deployment skipped. Run "npm run deploy -- --yes" in ${root} when ready.\n`);
    return null;
  }
  const config = deploymentConfig(root, options.config);
  stdout.write('Authenticating with GitHub...\n');
  const credential = githubCredential();
  stdout.write('Committing local changes and replaying them on the latest main...\n');
  const prepared = await prepareRepository(root, name, credential, options);
  stdout.write('Installing dependencies and running the complete test/build verification...\n');
  runProjectCommand(root, 'install:all');
  runProjectCommand(root, 'verify');
  const github = await ensureRepository(root, prepared, credential, options);
  stdout.write(`GitHub: ${github.htmlUrl}\n`);
  const owner = config.owner || github.owner;
  const provisioner = { baseUrl: config.baseUrl, key: config.key, repo: github.fullName };
  stdout.write('Storing the deployment settings in the repository (Actions secret and variables)...\n');
  await configureActions(github.fullName, credential.token, { key: config.key, baseUrl: config.baseUrl, owner });
  stdout.write('Provisioning the Azure database and backend (infrastructure only)...\n');
  const infrastructure = await provisionInfrastructure(root, name, owner, provisioner);
  showDatabaseLogin(infrastructure.database);
  if (infrastructure.error) throw new Error(`Repository ${github.fullName} is ready, but Azure provisioning failed: ${infrastructure.error}`);
  stdout.write('Pushing main...\n');
  const pushed = pushMain(root, credential.token, { createWorkingBranch: !github.reused, workingBranch: options.workingBranch });
  if (!pushed.moved) stdout.write('main already has this commit: starting the Deploy workflow for it.\n');
  try {
    await waitForDeployment(github.fullName, credential.token, pushed.commit, { dispatch: !pushed.moved });
  } catch (error) {
    throw new Error(`main (${pushed.commit.slice(0, 7)}) is on GitHub, but its deployment failed: ${error.message}`);
  }
  const url = await liveUrl(name, owner, provisioner);
  stdout.write('\nDeployment complete (deployed from main by GitHub Actions).\n');
  stdout.write(`Live URL: ${url || `see the run summary in ${github.htmlUrl}/actions`}\n`);
  if (infrastructure.backend?.api_url) stdout.write(`Backend URL: ${infrastructure.backend.api_url}\n`);
  return { github, commit: pushed.commit, url, backend: infrastructure.backend, database: infrastructure.database };
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`Deployment failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
