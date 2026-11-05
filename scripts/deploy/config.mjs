import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_PROVISIONER = 'https://provisioner-fa-f6bbbncphvbgbkfe.centralindia-01.azurewebsites.net';

/** Read dotenv syntax without overwriting values already supplied by the process or an earlier file. */
export function loadEnvFile(file, target = process.env) {
  if (!file || !existsSync(file)) return target;
  const lines = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index].trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trimStart();
    const equals = line.indexOf('=');
    if (equals < 1) throw new Error(`Invalid .env entry in ${file} on line ${index + 1}`);
    const key = line.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid .env name in ${file} on line ${index + 1}`);
    if (Object.hasOwn(target, key)) continue;
    let value = line.slice(equals + 1).trim();
    if (value.length >= 2 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))) {
      value = value.slice(1, -1);
    } else if (value.includes(' #')) value = value.split(' #', 1)[0].trimEnd();
    target[key] = value;
  }
  return target;
}

export function deploymentConfig(root, explicitFile, source = process.env) {
  const env = { ...source };
  // Process values win. The explicit generator config supplies deployment credentials; the application's local
  // file is still read for direct `npm run deploy` use and never committed.
  if (explicitFile) loadEnvFile(path.resolve(explicitFile), env);
  loadEnvFile(path.join(root, '.env.local'), env);
  const baseUrl = (env.PROVISIONER_BASE_URL || DEFAULT_PROVISIONER).replace(/\/+$/, '');
  if (!env.PROVISIONER_KEY) {
    throw new Error('PROVISIONER_KEY is missing. Set it in the process environment or the uncommitted .env.local file.');
  }
  return { baseUrl, key: env.PROVISIONER_KEY, owner: env.PROVISIONER_OWNER || '', env };
}
