import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);
const directory = new URL('../apps/app/dist/', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('offline-manifest.json', directory), 'utf8'));
const artifacts = new URL('artifacts/', root);
await mkdir(artifacts, { recursive: true });
const { fileURLToPath } = await import('node:url');
const archive = resolve(fileURLToPath(artifacts), `mumscards-ipad-offline-${version.slice(0, 12)}.zip`);
await rm(archive, { force: true });
execFileSync('zip', ['-q', '-r', archive, '.'], { cwd: directory });
console.log(archive);
