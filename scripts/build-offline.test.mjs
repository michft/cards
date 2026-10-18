import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { buildOffline } from './build-offline.mjs';

const origin = 'https://cards.example';
const exportedContents = {
  'index.html': 'home',
  'rules.html': 'rules',
  'settings.html': 'settings',
  'game/[gameId].html': 'game',
  'assets/app.js': 'javascript',
  'assets/@expo/icon.ttf': 'font',
  'manifest.webmanifest': '{"name":"Cards"}',
};

async function exportedApp(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cards-offline-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'game'));
  await mkdir(join(directory, 'assets', '@expo'), { recursive: true });
  await Promise.all(Object.entries(exportedContents).map(([file, content]) => writeFile(join(directory, file), content)));
  const manifest = await buildOffline(directory);
  return { directory, manifest };
}

function worker(source, manifest, { failAsset, cacheError = false } = {}) {
  const listeners = new Map();
  const stores = new Map();
  const observations = { claims: 0, skipWaiting: 0, downloads: [], network: [] };
  const servedContent = new Map();
  let networkResponse;
  const key = (input) => new URL(typeof input === 'string' ? input : input.url, origin).href;
  const caches = {
    async open(name) {
      if (cacheError) throw new Error('Cache unavailable');
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async put(input, response) { entries.set(key(input), response); },
        async match(input, options) {
          const url = new URL(key(input));
          if (options?.ignoreSearch) url.search = '';
          return entries.get(url.href)?.clone();
        },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    location: { origin },
    addEventListener(name, listener) { listeners.set(name, listener); },
    clients: { async claim() { observations.claims += 1; } },
    skipWaiting() { observations.skipWaiting += 1; },
  };
  class WorkerRequest {
    constructor(input, options) {
      this.url = key(input);
      Object.assign(this, options);
    }
  }
  vm.runInNewContext(source, {
    self, caches, URL, Request: WorkerRequest, Response, crypto: webcrypto,
    async fetch(request) {
      if (request.cache === 'reload') {
        const pathname = new URL(request.url).pathname;
        observations.downloads.push(pathname);
        if (pathname === failAsset) throw new Error('Download failed');
        const content = servedContent.has(pathname) ? servedContent.get(pathname)
          : pathname === '/offline-manifest.json' ? `${JSON.stringify(manifest, null, 2)}\n`
          : exportedContents[decodeURIComponent(pathname.slice(1))];
        return new Response(content, { status: content === undefined ? 404 : 200 });
      }
      observations.network.push(request.url);
      if (networkResponse) return networkResponse.clone();
      throw new Error('Offline');
    },
  });
  async function event(name, data = {}) {
    const pending = [];
    let response;
    listeners.get(name)({
      ...data,
      waitUntil(promise) { pending.push(promise); },
      respondWith(promise) { response = promise; },
    });
    await Promise.all(pending);
    return response;
  }
  async function status(type = 'OFFLINE_STATUS') {
    let result;
    await event('message', {
      data: { type },
      ports: [{ postMessage(value) { result = JSON.parse(JSON.stringify(value)); } }],
    });
    return result;
  }
  return {
    event, status, stores, observations,
    failDownload(asset) { failAsset = asset; },
    serveContent(asset, content) { servedContent.set(asset, content); },
    serveNetwork(response) { networkResponse = response; },
    cacheName: `mumscards-offline-${manifest.version}`,
    request(path, mode = 'navigate', method = 'GET') {
      return event('fetch', { request: { url: new URL(path, origin).href, mode, method } });
    },
  };
}

test('build includes every exported asset, is repeatable, and versions content changes', async (t) => {
  const { directory, manifest } = await exportedApp(t);
  assert.equal(manifest.assets.length, 8);
  assert.ok(manifest.assets.includes('/assets/@expo/icon.ttf'));
  assert.ok(manifest.assets.includes('/game/%5BgameId%5D.html'));
  assert.ok(manifest.assets.includes('/manifest.webmanifest'));
  assert.ok(!manifest.assets.includes('/sw.js'));
  assert.deepEqual(await buildOffline(directory), manifest);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'offline-manifest.json'), 'utf8')), manifest);
  await writeFile(join(directory, 'assets/@expo/icon.ttf'), 'new font');
  assert.notEqual((await buildOffline(directory)).version, manifest.version);
  await rm(join(directory, 'rules.html'));
  await assert.rejects(buildOffline(directory), /Missing offline page: rules.html/);
});

test('complete installation reports ready and serves all routes and assets while offline', async (t) => {
  const { directory, manifest } = await exportedApp(t);
  const runtime = worker(await readFile(join(directory, 'sw.js'), 'utf8'), manifest);
  assert.equal((await runtime.status()).ready, false);
  await runtime.event('install');
  assert.deepEqual(await runtime.status(), { ready: true, version: manifest.version });
  for (const game of ['klondike', 'freecell', 'spider', 'pyramid', 'clock']) {
    assert.equal(await (await runtime.request(`/game/${game}?mode=resume`)).text(), 'game');
  }
  for (const page of ['rules', 'settings']) {
    assert.equal(await (await runtime.request(`/${page}?game=clock`)).text(), page);
  }
  assert.equal(await (await runtime.request('/')).text(), 'home');
  assert.equal(await (await runtime.request('/other-route')).text(), 'home');
  assert.equal(await (await runtime.request('/assets/app.js?v=2', 'cors')).text(), 'javascript');
  assert.equal(await (await runtime.request('/assets/@expo/icon.ttf', 'cors')).text(), 'font');
  assert.deepEqual(runtime.observations.network, []);
  assert.equal(runtime.observations.skipWaiting, 0);
});

test('failed installation leaves no ready cache or damage to the previous version', async (t) => {
  const { directory, manifest } = await exportedApp(t);
  const runtime = worker(await readFile(join(directory, 'sw.js'), 'utf8'), manifest, { failAsset: '/rules.html' });
  runtime.stores.set('mumscards-offline-old', new Map());
  await assert.rejects(runtime.event('install'), /Download failed/);
  assert.equal(runtime.stores.has(runtime.cacheName), false);
  assert.equal(runtime.stores.has('mumscards-offline-old'), true);
  const status = await runtime.status();
  assert.equal(status.ready, false);
  assert.match(status.error, /incomplete/);
});

test('evicted assets use network, then navigation home fallback or a defined 503', async (t) => {
  const { directory, manifest } = await exportedApp(t);
  const runtime = worker(await readFile(join(directory, 'sw.js'), 'utf8'), manifest);
  await runtime.event('install');
  const entries = runtime.stores.get(runtime.cacheName);
  entries.delete(`${origin}/rules.html`);
  entries.delete(`${origin}/assets/app.js`);
  assert.equal(await (await runtime.request('/rules?game=clock')).text(), 'home');
  assert.equal((await runtime.request('/assets/app.js', 'cors')).status, 503);
  entries.delete(`${origin}/index.html`);
  assert.equal((await runtime.request('/rules?game=clock')).status, 503);
  runtime.serveNetwork(new Response('online rules', { status: 200 }));
  assert.equal(await (await runtime.request('/rules?game=clock')).text(), 'online rules');
  runtime.serveNetwork(new Response('server unavailable', { status: 503 }));
  assert.equal(await (await runtime.request('/rules?game=clock')).text(), 'server unavailable');
});

test('activation only removes this app obsolete caches and claims clients without forced updates', async (t) => {
  const { directory, manifest } = await exportedApp(t);
  const runtime = worker(await readFile(join(directory, 'sw.js'), 'utf8'), manifest);
  await runtime.event('install');
  runtime.stores.set('mumscards-offline-old', new Map());
  runtime.stores.set('unrelated-app-cache', new Map());
  await runtime.event('activate');
  assert.deepEqual([...runtime.stores.keys()].sort(), [runtime.cacheName, 'unrelated-app-cache'].sort());
  assert.equal(runtime.observations.claims, 1);
  assert.equal(runtime.observations.skipWaiting, 0);
});

test('cache loss and cache access errors never report offline readiness', async (t) => {
  const { directory, manifest } = await exportedApp(t);
  const source = await readFile(join(directory, 'sw.js'), 'utf8');
  const runtime = worker(source, manifest);
  await runtime.event('install');
  runtime.stores.get(runtime.cacheName).delete(`${origin}/assets/app.js`);
  assert.equal((await runtime.status()).ready, false);
  const failed = await worker(source, manifest, { cacheError: true }).status();
  assert.equal(failed.ready, false);
  assert.match(failed.error, /Cache unavailable/);
});

test('requests outside the static app cache are not intercepted or cached', async (t) => {
  const { directory, manifest } = await exportedApp(t);
  const runtime = worker(await readFile(join(directory, 'sw.js'), 'utf8'), manifest);
  await runtime.event('install');
  assert.equal(await runtime.request('https://other.example/assets/app.js', 'cors'), undefined);
  assert.equal(await runtime.request('/api/scores', 'cors'), undefined);
  assert.equal(await runtime.request('/assets/app.js', 'cors', 'POST'), undefined);
  assert.deepEqual(runtime.observations.network, []);
});

test('repair restores evicted files and failed repair preserves remaining active assets', async (t) => {
  const { directory, manifest } = await exportedApp(t);
  const runtime = worker(await readFile(join(directory, 'sw.js'), 'utf8'), manifest);
  await runtime.event('install');
  const entries = runtime.stores.get(runtime.cacheName);
  entries.delete(`${origin}/assets/app.js`);
  assert.equal((await runtime.status()).ready, false);
  assert.equal(runtime.observations.downloads.length, manifest.assets.length);
  runtime.failDownload('/rules.html');
  const failed = await runtime.status('PREPARE_OFFLINE');
  assert.equal(failed.ready, false);
  assert.match(failed.error, /Download failed/);
  assert.equal(entries.size, manifest.assets.length - 1);
  assert.equal(await (await runtime.request('/')).text(), 'home');
  runtime.failDownload(undefined);
  assert.deepEqual(await runtime.status('PREPARE_OFFLINE'), { ready: true, version: manifest.version });
  assert.equal(entries.size, manifest.assets.length);
  assert.equal(runtime.observations.downloads.length, 3 * manifest.assets.length);
  assert.equal(await (await runtime.request('/assets/app.js', 'cors')).text(), 'javascript');
});

test('repair rejects newer deployment HTML before replacing any active cached response', async (t) => {
  const { directory, manifest } = await exportedApp(t);
  const runtime = worker(await readFile(join(directory, 'sw.js'), 'utf8'), manifest);
  await runtime.event('install');
  const entries = runtime.stores.get(runtime.cacheName);
  const previousHome = entries.get(`${origin}/index.html`);
  entries.delete(`${origin}/assets/app.js`);
  runtime.serveContent('/index.html', '<script src="/assets/new-app.js"></script>');
  const status = await runtime.status('PREPARE_OFFLINE');
  assert.equal(status.ready, false);
  assert.match(status.error, /Close the app and reopen online/);
  assert.equal(entries.get(`${origin}/index.html`), previousHome);
  assert.equal(entries.has(`${origin}/assets/app.js`), false);
  assert.equal(entries.size, manifest.assets.length - 1);
  assert.equal(await (await runtime.request('/')).text(), 'home');
});
