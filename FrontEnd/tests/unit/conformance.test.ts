// The structure and stack every application keeps (docs/stack-and-structure.md). Ships into every application and runs
// with `npm run verify`: an application that drifts fails here. A new library or folder is a template change first:
// approved by the template maintainer, then added to this list in the template.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SERVER_MODULES } from '@/modules/server-registry';
import { MODULES } from '@/modules/registry';

const ROOT = path.resolve(__dirname, '../../..');
const at = (...parts: string[]) => path.join(ROOT, ...parts);
const read = (...parts: string[]) => readFileSync(at(...parts), 'utf8');
const json = (...parts: string[]) => JSON.parse(read(...parts)) as Record<string, unknown>;
const fullStack = existsSync(at('BackEnd'));

const NODE_ENGINE = '>=22.13.0 <23';
export const STACK = {
  frontEnd: {
    dependencies: { '@fontsource-variable/inter': '5.3.0', 'lucide-react': '0.468.0', react: '19.3.0', 'react-dom': '19.3.0', zod: '4.6.7' },
    devDependencies: {
      '@eslint/js': '9.39.5', '@playwright/test': '1.64.0', '@types/node': '22.20.5', '@types/react': '19.3.0', '@types/react-dom': '19.3.0',
      '@vitejs/plugin-react': '6.1.2', eslint: '9.39.5', 'eslint-plugin-react-hooks': '7.1.1', globals: '17.13.0', typescript: '5.9.3',
      'typescript-eslint': '8.71.2', vite: '8.3.4', vitest: '5.0.3'
    }
  },
  backEnd: {
    dependencies: { '@azure/functions': '4.16.5', '@fastify/cors': '11.3.1', fastify: '5.12.7', mysql2: '3.24.4', zod: '4.6.7' },
    devDependencies: {
      '@eslint/js': '9.39.5', '@types/node': '22.20.5', esbuild: '0.28.2', eslint: '9.39.5', globals: '17.13.0',
      tsx: '4.23.15', typescript: '5.9.3', 'typescript-eslint': '8.71.2', vite: '8.3.4', vitest: '5.0.3'
    }
  }
} as const;

/** Top-level folders an application may have (dot folders such as .git and .claude are tools, not structure). */
const FOLDERS = fullStack ? ['BackEnd', 'DB', 'FrontEnd', 'docs', 'records', 'scripts'] : ['FrontEnd', 'docs', 'records', 'scripts'];
// Local logs are runtime output, already excluded by the template's .gitignore.
const IGNORED = new Set(['node_modules', 'test-results', 'playwright-report', 'logs']);

describe('structure', () => {
  it(`has ${fullStack ? 'FrontEnd, BackEnd and DB' : 'FrontEnd only'} at the root, and no other application folder`, () => {
    const folders = readdirSync(ROOT).filter(n => !n.startsWith('.') && !IGNORED.has(n) && statSync(at(n)).isDirectory()).sort();
    // docs/ is the template's own; FS Sprint gives an application its documents through the knowledge server, not a copy.
    expect(folders.filter(n => n !== 'docs')).toEqual(FOLDERS.filter(n => n !== 'docs').sort());
    if (!fullStack) expect(existsSync(at('DB'))).toBe(false);
  });
  it('builds the FrontEnd into FrontEnd/dist (and the BackEnd into BackEnd/dist), where the deployment pipeline looks', () => {
    expect(read('FrontEnd', 'vite.config.ts')).toContain("outDir: 'dist'");
    if (fullStack) expect(read('BackEnd', 'scripts', 'build.mjs')).toContain("'../dist/server.mjs'");
    // The same BackEnd as an Azure Function App zip (docs/deploy-function-app.md).
    if (fullStack) expect(read('BackEnd', 'scripts', 'build.mjs')).toContain("'../dist/function.zip'");
  });
  it('keeps the database as numbered migrations in DB/schema, never a committed app.db', () => {
    if (!fullStack) return;
    const migrations = readdirSync(at('DB', 'schema'));
    expect(migrations.length).toBeGreaterThan(0);
    for (const m of migrations) expect(m).toMatch(/^\d{4}_[\w-]+\.sql$/);
    expect(read('.gitignore')).toMatch(/^DB\/\*\.db$/m);
  });
  it('has the login page (mock or real sign-in, never dropped)', () => {
    expect(existsSync(at('FrontEnd', 'src', 'components', 'login', 'LoginView.tsx'))).toBe(true);
    expect(read('FrontEnd', 'src', 'App.tsx')).toContain("pathname === '/login' ? <LoginPage />");
  });
  it('says which kind of application this is, and that matches its folders', () => {
    expect(read('FrontEnd', 'src', 'runtime.ts')).toContain(fullStack ? "'fullstack' as 'fullstack' | 'frontend'" : "'frontend' as 'fullstack' | 'frontend'");
    expect(existsSync(at('FrontEnd', 'src', 'core'))).toBe(true);
  });
});

/** Every .ts/.tsx file under a folder (node_modules and dist skipped), as absolute paths. */
function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return IGNORED.has(e.name) || e.name === 'dist' ? [] : sourceFiles(full);
    return /\.(ts|tsx|mts)$/.test(e.name) ? [full] : [];
  });
}
const rel = (f: string) => path.relative(ROOT, f).replaceAll(path.sep, '/');

/**
 * The files a BackEnd entry point really pulls in: walks the static and dynamic imports from the entry files, through
 * relative paths and the `@/` and `@core/` aliases (BackEnd/tsconfig.json), the same graph esbuild bundles into
 * dist/server.mjs and dist/function.zip. Text checks on BackEnd/src alone would miss SAP code imported by the core.
 */
function importGraph(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  // One import or re-export statement, or a dynamic import(); `type` marks a type-only statement, which esbuild erases
  // (it pulls nothing into the bundle).
  const IMPORT = /\b(?:import|export)\s+(type\s+)?(?:[^'";]*?\bfrom\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g;
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      if (m[1]) continue;
      const spec = m[2] ?? m[3];
      let base: string | null = null;
      if (spec.startsWith('.')) base = path.resolve(path.dirname(file), spec);
      else if (spec.startsWith('@core/')) base = at('FrontEnd', 'src', 'core', spec.slice(6));
      else if (spec.startsWith('@/')) base = at('FrontEnd', 'src', spec.slice(2));
      if (!base) continue;
      const hit = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(x => base + x).find(c => existsSync(c) && statSync(c).isFile() && /\.tsx?$/.test(c));
      if (hit) queue.push(hit);
    }
  }
  return seen;
}

/**
 * A call to the page's own origin under /api, on a non-comment line: a string that starts with `/api`, `/api` after the
 * page's origin, or a request interceptor. An external service's `${base}/api/...` or `https://host/api` is not one.
 */
const OWN_API = /setApiTransport|(['"`])\/api\b|\borigin\b[^;\n]*\/api\b/;

describe('the browser calls SAP; the FrontEnd is static', () => {
  it('renders all template tables through the shared DataTable component', () => {
    const offenders = sourceFiles(at('FrontEnd', 'src', 'components')).filter(f => !rel(f).endsWith('components/table/DataTable.tsx') && /<table[\s>]/.test(readFileSync(f, 'utf8')));
    expect(offenders.map(rel)).toEqual([]);
  });
  // The browser runs the core (SAP through the relay, sample data in memory); the BackEnd imports it for its own data.
  it('keeps the SAP and service code in FrontEnd/src/core', () => {
    expect(existsSync(at('FrontEnd', 'src', 'core', 'sap', 'client.ts'))).toBe(true);
    expect(existsSync(at('FrontEnd', 'src', 'core', 'server', 'module-service.ts'))).toBe(true);
  });
  it('tells a call to its own origin\'s /api from an external service\'s', () => {
    for (const own of ["fetch('/api/modules')", 'fetch(`/api/${id}`)', 'const u = "/api"', 'fetch(`${location.origin}/api/x`)', 'setApiTransport(t)']) expect(OWN_API.test(own), own).toBe(true);
    for (const other of ['call(`${base}/api/v1/sanctions`)', "const URL = 'https://api.example.in/api/verify'", "'/sap/opu/odata4/apis/'"]) expect(OWN_API.test(other), other).toBe(false);
  });
  it('has no request interceptor and no own-origin /api string in the FrontEnd outside lib/client/backend-api.ts', () => {
    // core/server/router.ts is the BackEnd's own route table (it answers /api/...); the browser never imports it.
    const allowed = new Set(['FrontEnd/src/lib/client/backend-api.ts', 'FrontEnd/src/core/server/router.ts']);
    const code = (f: string) => readFileSync(f, 'utf8').split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    // FrontEnd/src/ref/ (the ported reference screens) writes service addresses as `/api/<serviceKey>/...`: virtual addresses that
    // ref/api-client/http.ts routes to the SAP relay or the BackEnd; nothing there is fetched from this page's own origin.
    const virtual = (f: string) => rel(f).startsWith('FrontEnd/src/ref/');
    const offenders = sourceFiles(at('FrontEnd', 'src')).filter(f => !allowed.has(rel(f)) && !virtual(f) && OWN_API.test(code(f)));
    expect(offenders.map(rel)).toEqual([]);
    // The exemption holds only while nothing outside core/server imports the router.
    const routerUsers = sourceFiles(at('FrontEnd', 'src')).filter(f => !rel(f).startsWith('FrontEnd/src/core/server/') && /['"][^'"]*server\/router['"]/.test(readFileSync(f, 'utf8')));
    expect(routerUsers.map(rel)).toEqual([]);
    expect(read('FrontEnd', 'src', 'lib', 'client', 'backend-api.ts')).not.toContain('setApiTransport');
  });
  it('has no dev-server proxy: the page never calls its own origin for data', () => {
    expect(read('FrontEnd', 'vite.config.ts')).not.toMatch(/\bproxy\b/);
  });
  it('has no FrontEnd/src/local-api', () => {
    expect(existsSync(at('FrontEnd', 'src', 'local-api'))).toBe(false);
  });
  it('the BackEnd holds no SAP: nothing it bundles imports @core/sap or odata-backend, and no SAP setting is named', () => {
    if (!fullStack) return;
    const entries = ['server.ts', 'function.ts'].map(n => at('BackEnd', 'src', n));
    const graph = [...importGraph(entries)].map(rel);
    expect(graph).toContain('FrontEnd/src/core/server/router.ts');
    expect(graph.filter(f => f.startsWith('FrontEnd/src/core/sap/') || /odata-backend/.test(f))).toEqual([]);
    for (const f of [...sourceFiles(at('BackEnd', 'src')), ...graph.map(g => at(g))]) {
      const text = readFileSync(f, 'utf8');
      expect(text, rel(f)).not.toMatch(/@core\/sap\/|odata-backend|SAP_USERNAME|SAP_PASSWORD|SAP_RELAY_URL/);
    }
  });
  it('gives every module a source of sap, app, rest or none; a sap module names a service listed in services.json', () => {
    const services = JSON.parse(read('FrontEnd', 'src', 'config', 'services.json')) as { binding: string }[];
    const restServices = JSON.parse(read('FrontEnd', 'src', 'config', 'rest-services.json')) as { key: string; base: string }[];
    for (const [id, entry] of Object.entries(SERVER_MODULES)) {
      expect([undefined, 'sap', 'app', 'rest'], id).toContain(entry.source);
      if (entry.source === 'sap' && entry.contract) expect(services.map(s => s.binding), id).toContain(entry.contract.service);
      if (entry.source === 'rest') {
        // A REST data service is called by the BackEnd only: FE + BE + DB, a rest contract, a listed service.
        expect(fullStack, `${id}: a rest module needs the BackEnd (FE + BE + DB)`).toBe(true);
        expect(entry.rest, `${id}: a rest module needs its rest contract`).toBeDefined();
        expect(restServices.map(s => s.key), id).toContain(entry.rest?.service);
      }
    }
  });
  it('lists REST data services by key and base URL only, never a secret', () => {
    const restServices = JSON.parse(read('FrontEnd', 'src', 'config', 'rest-services.json')) as Record<string, unknown>[];
    for (const s of restServices) {
      expect(Object.keys(s).sort(), String(s.key)).toEqual(['base', 'key', 'title']);
      expect(String(s.base), String(s.key)).toMatch(/^https:\/\/[^/@]+\//);
    }
  });
  it('the login page still shows the captcha', () => {
    expect(read('FrontEnd', 'src', 'components', 'login', 'LoginView.tsx')).toMatch(/import \{ Captcha \} from '\.\/Captcha'/);
    expect(existsSync(at('FrontEnd', 'src', 'components', 'login', 'Captcha.tsx'))).toBe(true);
  });
});

describe('stack', () => {
  it('runs on Node 22 LTS', () => {
    expect(process.versions.node.split('.')[0]).toBe('22');
    for (const pkg of ['package.json', 'FrontEnd/package.json', ...(fullStack ? ['BackEnd/package.json'] : [])]) {
      expect((json(...pkg.split('/')).engines as Record<string, string>)?.node, pkg).toBe(NODE_ENGINE);
    }
  });
  it('the root package.json holds scripts only', () => {
    const root = json('package.json');
    expect(root.dependencies).toBeUndefined();
    expect(root.devDependencies).toBeUndefined();
  });
  it('the FrontEnd uses exactly the approved libraries, at exact versions', () => {
    const fe = json('FrontEnd', 'package.json');
    expect(fe.dependencies).toEqual(STACK.frontEnd.dependencies);
    expect(fe.devDependencies).toEqual(STACK.frontEnd.devDependencies);
  });
  it.runIf(fullStack)('the BackEnd uses exactly the approved libraries, at exact versions', () => {
    const be = json('BackEnd', 'package.json');
    expect(be.dependencies).toEqual(STACK.backEnd.dependencies);
    expect(be.devDependencies).toEqual(STACK.backEnd.devDependencies);
  });
});

describe('modules', () => {
  it('registers every module with its definition, OData contract and sample data', () => {
    expect(Object.keys(SERVER_MODULES).sort()).toEqual(Object.keys(MODULES).sort());
    for (const [id, entry] of Object.entries(SERVER_MODULES)) {
      expect(entry.def.id, id).toBe(id);
      // A report over another module (source) reads that module's data: it has neither of its own.
      if (entry.def.kind === 'report' && entry.def.source) continue;
      const fix = `${id}: register a contract with a service (an empty one, tables: {}, is fine for a dashboard that only reads other modules) and a seed`;
      expect(typeof entry.contract?.service === 'string' && /\S/.test(entry.contract.service), fix).toBe(true);
      expect(entry.seed, fix).toBeTruthy();
    }
  });
});
