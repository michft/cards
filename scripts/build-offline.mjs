import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const generated = new Set(['sw.js', 'offline-manifest.json']);

async function exportedFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return exportedFiles(path, root);
    if (!entry.isFile()) throw new Error(`Unsupported exported asset: ${path}`);
    const name = relative(root, path).split(sep).join('/');
    return generated.has(name) ? [] : [name];
  }));
  return files.flat().sort();
}

/** Add a complete, versioned offline cache to an Expo static export. */
export async function buildOffline(directory = 'apps/app/dist') {
  const root = resolve(directory);
  const files = await exportedFiles(root);
  for (const required of ['index.html', 'rules.html', 'settings.html', 'game/[gameId].html']) {
    if (!files.includes(required)) throw new Error(`Missing offline page: ${required}`);
  }
  const template = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8');
  const hash = createHash('sha256').update(template);
  const integrity = {};
  for (const file of files) {
    const contents = await readFile(resolve(root, file));
    hash.update(JSON.stringify([file, contents.length])).update(contents);
    integrity[assetUrl(file)] = createHash('sha256').update(contents).digest('hex');
  }
  const version = hash.digest('hex');
  const assets = files.map(assetUrl);
  assets.push('/offline-manifest.json');
  const manifest = { version, assets };
  const manifestContents = `${JSON.stringify(manifest, null, 2)}\n`;
  integrity['/offline-manifest.json'] = createHash('sha256').update(manifestContents).digest('hex');
  const worker = template.replace('/* OFFLINE_CONFIG */', `const OFFLINE = ${JSON.stringify({ ...manifest, integrity })};`);
  await writeFile(resolve(root, 'offline-manifest.json'), manifestContents);
  await writeFile(resolve(root, 'sw.js'), worker);
  return manifest;
}

function assetUrl(file) {
  return encodeURI(`/${file}`).replaceAll('?', '%3F').replaceAll('#', '%23');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildOffline(process.argv[2]).then(({ version, assets }) => {
    console.log(`Offline export: ${assets.length} assets, version ${version.slice(0, 12)}`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
