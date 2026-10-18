import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('packaging identifies missing zip and preserves other executable failures', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cards-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'apps/app/dist'), { recursive: true });
  const script = join(root, 'scripts/package-offline.mjs');
  await copyFile(new URL('./package-offline.mjs', import.meta.url), script);
  await writeFile(join(root, 'apps/app/dist/offline-manifest.json'), JSON.stringify({ version: 'test' }));

  const run = () => execFileSync(process.execPath, [script], {
    env: { ...process.env, PATH: root }, encoding: 'utf8', stdio: 'pipe',
  });
  assert.throws(run, (error) => {
    assert.match(error.stderr, /requires the zip executable.*Install zip.*pnpm web:package/);
    return true;
  });

  await writeFile(join(root, 'zip'), '#!/bin/sh\nexit 23\n', { mode: 0o755 });
  assert.throws(run, (error) => {
    assert.match(error.stderr, /Command failed: zip/);
    assert.match(error.stderr, /status: 23/);
    assert.doesNotMatch(error.stderr, /requires the zip executable/);
    return true;
  });
});
