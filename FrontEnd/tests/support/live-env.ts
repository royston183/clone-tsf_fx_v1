// The live check reads its settings from the process environment, then from .env.local at the application root (a value
// already in the environment, even an empty one, wins).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../../../.env.local', import.meta.url));
if (existsSync(file)) process.loadEnvFile(file);
