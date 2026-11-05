// npm run install:all: `npm install` inside FrontEnd and, in an FE + BE + DB application, BackEnd.
// (`npm --prefix <folder> install` from the root would install the root package into the folder instead.)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

for (const folder of ['FrontEnd', 'BackEnd']) {
  const dir = fileURLToPath(new URL(`../${folder}/`, import.meta.url));
  if (!existsSync(`${dir}package.json`)) continue;
  process.stdout.write(`npm install in ${folder}\n`);
  const result = spawnSync('npm', ['install'], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
