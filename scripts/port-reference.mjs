// Repeatable import of the FX screens explicitly requested from the reference application.
// Existing custom pages and the template shell stay registered; only planned catalogue entries are replaced.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const reference = resolve(process.argv[2] ?? 'D:/SAP Tool/TSF - FX Application');
const source = join(reference, 'apps/web/src');
const target = join(root, 'FrontEnd/src/ref');
const catalogFile = join(root, 'FrontEnd/src/config/catalog.ts');
const registryFile = join(root, 'FrontEnd/src/pages/registry.ts');
const catalog = readFileSync(catalogFile, 'utf8');
const registry = readFileSync(join(source, 'features/registry.ts'), 'utf8');
const mapping = Object.fromEntries([...registry.matchAll(/'([^']+)': lazy\(\(\) => import\('\.\/([^']+)'\)\)/g)].map(m => [m[1], m[2]]));
const officeSource = readFileSync(join(source, 'App.tsx'), 'utf8').split('const ALM_FX_OFFICE_FEATURES = new Set([')[1]?.split('])')[0] ?? '';
const office = new Set([...officeSource.matchAll(/'([^']+)'/g)].map(m => m[1]));
const ports = [];
const unavailable = [];
for (const line of catalog.split('\n').filter(l => l.includes("page: 'planned'"))) {
  const id = /id: '([^']+)'/.exec(line)?.[1];
  if (!id) continue;
  const ref = id === 'deal-id-details' ? 'fo-deal-id-details' : id;
  if (mapping[ref]) ports.push({ id, ref, feature: mapping[ref], office: office.has(ref) });
  else unavailable.push(id);
}
if (!ports.length) throw new Error('No planned reference screens found; refusing to overwrite existing ports.');

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const folders = new Set(ports.map(p => p.feature.split('/')[0]));
// Shared FX helpers refer to the MO confirmation API; other screens reuse the blotter and MC logic.
folders.add('mo-fx-deal-confirmation');
for (const folder of folders) {
  for (const file of walk(join(source, 'features', folder)).filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue;
      const dependency = resolve(dirname(file), match[1]).replaceAll('\\', '/');
      const featureRoot = join(source, 'features').replaceAll('\\', '/') + '/';
      if (dependency.startsWith(featureRoot)) folders.add(dependency.slice(featureRoot.length).split('/')[0]);
    }
  }
}

let files = 0;
for (const folder of folders) {
  for (const file of walk(join(source, 'features', folder)).filter(f => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(f))) {
    const relative = file.slice(source.length + 1);
    const dest = join(target, relative);
    if (existsSync(dest)) throw new Error(`Port already exists: ${dest}`);
    mkdirSync(dirname(dest), { recursive: true });
    if (!/\.(ts|tsx|css|json|md|html|txt)$/.test(file)) {
      copyFileSync(file, dest);
      files++;
      continue;
    }
    let text = readFileSync(file, 'utf8');
    if (/\.(ts|tsx)$/.test(file)) {
      text = text.replace(/(['"])@slc\/api-client\/react\1/g, "'@/ref/api-client/react'")
        .replace(/(['"])@slc\/api-client\1/g, "'@/ref/api-client'")
        .replace(/(['"])@slc\/ui\1/g, "'@/ref/ui'")
        .replace(/(['"])react-router-dom\1/g, "'@/ref/router'")
        .replace(/(['"])xlsx\1/g, "'@/ref/xlsx'");
      if (/\bfetch\(/.test(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''))) {
        text = "import { refFetch } from '@/ref/api-client'\n" + text.replace(/\bfetch\(/g, 'refFetch(');
      }
      text = text.replace(/\bxlsx\.read\(/g, 'await xlsx.readAsync(');
    }
    writeFileSync(dest, text);
    files++;
  }
}

let nextCatalog = catalog;
for (const port of ports) {
  nextCatalog = nextCatalog.replace(new RegExp(`(id: '${port.id}',[^\\n]*?)page: 'planned'`), `$1page: 'ref-${port.id}', heading: 'custom'`);
}
writeFileSync(catalogFile, nextCatalog);
const custom = readFileSync(registryFile, 'utf8');
const entries = ports.map(p => `  'ref-${p.id}': lazy(() => import('@/ref/features/${p.feature}').then(m => ({ default: refPage(m.default, { office: ${p.office} }) })))`);
writeFileSync(registryFile, custom.replace("import type { CatalogNode }", "import { refPage } from '@/ref/RefHost';\nimport type { CatalogNode }").replace(/\n};\s*$/, `,\n${entries.join(',\n')}\n};\n`));
writeFileSync(join(target, 'port-manifest.json'), JSON.stringify({ reference, ports, unavailable, dependencyFolders: [...folders].sort(), files }, null, 2) + '\n');
console.log(`Ported ${ports.length} catalogue screens (${folders.size} feature folders, ${files} files). No reference screen: ${unavailable.join(', ')}.`);
