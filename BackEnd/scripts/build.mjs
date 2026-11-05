// Bundles the BackEnd twice, from the same core, the FrontEnd's shared code it uses (module definitions, fields, grids,
// reports) and every dependency. SQLite is Node's own (node:sqlite).
//   dist/server.mjs      the BackEnd as a Node server (node dist/server.mjs)
//   dist/function.zip    the BackEnd as an Azure Function App (Node 22, model v4), ready for a zip deploy:
//                        index.mjs, host.json, package.json and DB/schema (docs/deploy-function-app.md)
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { zipFolder } from './zip.mjs';

const at = path => fileURLToPath(new URL(path, import.meta.url));

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  alias: { '@core': at('../../FrontEnd/src/core'), '@': at('../../FrontEnd/src') },
  // Bundled CommonJS dependencies may call require(): give the ES module one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  // The commit /api/health reports: the deploy waits for it before it publishes the website (GitHub Actions sets GITHUB_SHA).
  define: { __APP_BUILD__: JSON.stringify(process.env.GITHUB_SHA ?? '') },
  logLevel: 'warning'
};

await build({ ...common, entryPoints: [at('../src/server.ts')], outfile: at('../dist/server.mjs') });
// Tells the deploy this BackEnd answers /api/health with its build, so it can wait for the new one before the website.
writeFileSync(at('../dist/build.json'), `${JSON.stringify({ build: process.env.GITHUB_SHA ?? '', health: '/api/health' })}
`);
process.stdout.write('BackEnd built: dist/server.mjs\n');

// The Function App package. @azure/functions-core is not a package: the Functions host provides it at run time.
const fn = at('../dist/function/');
rmSync(fn, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });
await build({ ...common, entryPoints: [at('../src/function.ts')], outfile: `${fn}index.mjs`, external: ['@azure/functions-core'] });
const json = value => `${JSON.stringify(value, null, 2)}\n`;
writeFileSync(`${fn}package.json`, json({ name: 'backend-function', private: true, type: 'module', main: 'index.mjs' }));
writeFileSync(`${fn}host.json`, json({
  version: '2.0',
  // No "api" prefix from the host: the function's route is api/{*path} itself, so the paths match the Node server.
  extensions: { http: { routePrefix: '' } },
  logging: { applicationInsights: { samplingSettings: { isEnabled: true, excludedTypes: 'Request' } } },
  extensionBundle: { id: 'Microsoft.Azure.Functions.ExtensionBundle', version: '[4.*, 5.0.0)' }
}));
// The migrations: the function finds the application root by DB/schema and brings the database up to date at start.
cpSync(at('../../DB/schema'), `${fn}DB/schema`, { recursive: true });
const files = zipFolder(fn, at('../dist/function.zip'));
process.stdout.write(`BackEnd built: dist/function.zip (${files} files, for an Azure Function App zip deploy)\n`);
