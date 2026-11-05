// npm run dev: the BackEnd (Node + Fastify, BACKEND_PORT, default 3200) and the FrontEnd (Vite, FRONTEND_PORT, else
// PORT, default 3100), both on 127.0.0.1, wired to each other: the FrontEnd calls the BackEnd's port and the BackEnd
// allows the FrontEnd's origin. A Front end only application (no BackEnd folder) starts the FrontEnd alone.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The two ports from the environment. Throws on a value that is not a port, or the same port twice. */
export function devPorts(env = process.env) {
  const port = (name, raw, fallback) => {
    const text = (raw ?? '').trim();
    const n = text === '' ? fallback : /^[1-9]\d{0,4}$/.test(text) ? Number(text) : NaN;
    if (!(n >= 1 && n <= 65535)) throw new Error(`Invalid ${name} "${text}": use a whole number from 1 to 65535.`);
    return n;
  };
  const frontEnd = port('FRONTEND_PORT', env.FRONTEND_PORT || env.PORT, 3100);
  const backEnd = port('BACKEND_PORT', env.BACKEND_PORT, 3200);
  if (frontEnd === backEnd) throw new Error(`FRONTEND_PORT and BACKEND_PORT are both ${frontEnd}: use two ports.`);
  return { frontEnd, backEnd };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let ports;
  try { ports = devPorts(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
  const children = [];
  const run = (folder, env) => {
    const child = spawn('npm', ['--prefix', folder, 'run', 'dev'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
    child.on('exit', code => { for (const c of children) if (c !== child) c.kill(); process.exitCode = code ?? 1; });
    children.push(child);
  };
  if (existsSync(new URL('../BackEnd/package.json', import.meta.url))) {
    // Bring DB/schema and the local database up to the module definitions before anything starts.
    const schema = spawnSync('npm', ['--prefix', 'BackEnd', 'run', 'gen-schema'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (schema.status !== 0) process.exit(schema.status ?? 1);
    run('BackEnd', { PORT: String(ports.backEnd), FRONTEND_PORT: String(ports.frontEnd) });
  }
  run('FrontEnd', { FRONTEND_PORT: String(ports.frontEnd), VITE_API_PORT: String(ports.backEnd) });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const c of children) c.kill(signal); });
}
