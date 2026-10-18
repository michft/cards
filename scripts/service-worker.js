/* OFFLINE_CONFIG */
const CACHE_PREFIX = 'mumscards-offline-';
const CACHE_NAME = `${CACHE_PREFIX}${OFFLINE.version}`;
const ASSETS = new Set(OFFLINE.assets);

async function precache(cache) {
  // Validate every response before any insertion, including mutable HTML paths.
  // An older worker cannot repair its cache using a newer deployment's files.
  const responses = await Promise.all(OFFLINE.assets.map(async (asset) => {
    const response = await fetch(new Request(asset, { cache: 'reload' }));
    if (!response.ok) throw new Error(`Offline download failed: ${asset} (${response.status})`);
    const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
    const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (actual !== OFFLINE.integrity[asset]) {
      throw new Error('Offline files changed. Close the app and reopen online to update.');
    }
    return [asset, response];
  }));
  // CacheStorage has no multi-put transaction. Every inserted response is valid;
  // readiness is reported only after all required entries are present.
  await Promise.all(responses.map(([asset, response]) => cache.put(asset, response)));
}

async function cacheComplete(cache) {
  const entries = await Promise.all(OFFLINE.assets.map((asset) => cache.match(asset)));
  return entries.every(Boolean);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await precache(cache);
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    // Updates wait until existing clients close, preserving one app version per session.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function navigationAsset(pathname) {
  if (pathname === '/' || pathname === '/index.html') return '/index.html';
  if (/^\/game\/(klondike|freecell|spider|pyramid|clock)\/?$/.test(pathname)) {
    return '/game/%5BgameId%5D.html';
  }
  const html = `${pathname.replace(/\/$/, '')}.html`;
  return ASSETS.has(html) ? html : '/index.html';
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const asset = request.mode === 'navigate' ? navigationAsset(url.pathname) : url.pathname;
  if (!ASSETS.has(asset)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(asset, { ignoreSearch: true }) || fetch(request);
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (!['OFFLINE_STATUS', 'PREPARE_OFFLINE'].includes(type) || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      let ready = await cacheComplete(cache);
      if (!ready && type === 'PREPARE_OFFLINE') {
        await precache(cache);
        ready = await cacheComplete(cache);
      }
      event.ports[0].postMessage({
        ready,
        version: OFFLINE.version,
        ...(ready ? {} : { error: 'Offline files are incomplete. Reconnect and retry.' }),
      });
    } catch (error) {
      event.ports[0].postMessage({ ready: false, version: OFFLINE.version, error: String(error) });
    }
  })());
});
