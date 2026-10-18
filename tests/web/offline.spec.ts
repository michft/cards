import { expect, test as base } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

type OfflineServer = {
  url: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  failIcon: (failed: boolean) => void;
};

const contentTypes: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.png': 'image/png',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};

async function createOfflineServer(): Promise<OfflineServer> {
  const root = resolve('apps/app/dist');
  let port = 0;
  let failedIcon = false;
  const server = createServer(async (request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (failedIcon && pathname === '/app-icon.png') {
        response.writeHead(503).end('Offline asset download deliberately unavailable');
        return;
      }
      if (pathname === '/') pathname = '/index.html';
      if (pathname === '/rules' || pathname === '/settings') pathname += '.html';
      if (/^\/game\/(clock|freecell|klondike|pyramid|spider)\/?$/.test(pathname)) {
        pathname = '/game/[gameId].html';
      }
      const file = resolve(root, `.${pathname}`);
      if (!file.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const contents = await readFile(file);
      // Disable browser HTTP cache: stopped-origin checks must prove service-worker caching.
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      }).end(contents);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  const start = () => new Promise<void>((done, reject) => {
    if (server.listening) { done(); return; }
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') { reject(new Error('Missing test origin port')); return; }
      port = address.port;
      done();
    });
  });
  const stop = () => new Promise<void>((done, reject) => {
    if (!server.listening) { done(); return; }
    server.close((error) => error ? reject(error) : done());
    server.closeAllConnections();
  });
  await start();
  return { url: `http://127.0.0.1:${port}`, start, stop, failIcon: (failed) => { failedIcon = failed; } };
}

const test = base.extend<{ offlineServer: OfflineServer; pageErrors: string[] }>({
  offlineServer: async ({}, use) => {
    const server = await createOfflineServer();
    try { await use(server); } finally { await server.stop(); }
  },
  baseURL: async ({ offlineServer }, use) => { await use(offlineServer.url); },
  pageErrors: [async ({ context }, use) => {
    const errors: string[] = [];
    context.on('weberror', (event) => errors.push(event.error().message));
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});

test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true });

test('cold launches every game and saves progress with origin unreachable', async ({ page, context, browserName, offlineServer }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Ready offline');
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toBe('/apple-touch-icon.png');
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('sizes')).toBe('180x180');
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: '/app-icon-192.png', sizes: '192x192' }),
    expect.objectContaining({ src: '/app-icon.png', sizes: '512x512' }),
  ]));
  const touchIcon = await page.evaluate(async () => {
    const icon = new Image();
    icon.src = '/apple-touch-icon.png';
    await icon.decode();
    const canvas = document.createElement('canvas');
    canvas.width = icon.naturalWidth; canvas.height = icon.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(icon, 0, 0);
    return { width: icon.naturalWidth, height: icon.naturalHeight,
      corners: [[0, 0], [179, 0], [0, 179], [179, 179]].map(([x, y]) =>
        Array.from(context.getImageData(x, y, 1, 1).data)),
    };
  });
  expect(touchIcon.width).toBe(180);
  expect(touchIcon.height).toBe(180);
  for (const [red, green, blue, alpha] of touchIcon.corners) {
    expect(alpha).toBe(255);
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
  }
  await page.close();
  await offlineServer.stop();
  // WebKit's automation offline flag breaks service-worker navigation (Playwright #42775).
  // Both engines use a genuinely stopped origin; Chromium also exercises navigator.onLine=false.
  if (browserName === 'chromium') await context.setOffline(true);
  const offline = await context.newPage();
  for (const game of ['clock', 'freecell', 'klondike', 'pyramid', 'spider']) {
    await offline.goto(`/game/${game}?mode=resume`);
    await expect(offline.getByRole('button', { name: 'Restart', exact: true })).toBeVisible();
    await expect(offline.getByRole('alert')).toHaveCount(0);
    await offline.getByRole('button', { name: 'Open settings', exact: true }).tap();
    await expect(offline.getByText('Settings', { exact: true }).first()).toBeVisible();
    await offline.goto(`/rules?game=${game}`);
    await expect(offline.getByText('Rules', { exact: true }).first()).toBeVisible();
  }
  await offline.goto('/game/klondike?mode=resume');
  await offline.getByRole('button', { name: 'Draw', exact: true }).tap();
  const saved = () => offline.evaluate(() => JSON.parse(localStorage.getItem('mumscards.saves')!).klondike.state);
  await expect.poll(async () => (await saved()).waste.length).toBe(3);
  const progressed = await saved();
  await offline.close();
  const reopened = await context.newPage();
  await reopened.goto('/game/klondike?mode=resume');
  await expect(reopened.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  expect(await reopened.evaluate(() => JSON.parse(localStorage.getItem('mumscards.saves')!).klondike.state)).toEqual(progressed);
  await reopened.goto('/');
  await expect(reopened.getByRole('status')).toHaveText(browserName === 'chromium' ? 'Ready offline · No network' : 'Ready offline');
  await reopened.screenshot({ path: testInfo.outputPath('ipad-ready-offline.png'), fullPage: true });
});

test('cache readiness detects missing assets and repairs them online', async ({ page, context, browserName, offlineServer }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Ready offline');
  await page.evaluate(async () => {
    const name = (await caches.keys()).find((name) => name.startsWith('mumscards-offline-'));
    if (!name) throw new Error('Missing offline cache');
    await (await caches.open(name)).delete('/rules.html');
  });
  await offlineServer.stop();
  if (browserName === 'chromium') await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Offline setup incomplete');
  await offlineServer.start();
  if (browserName === 'chromium') await context.setOffline(false);
  else await page.getByRole('button', { name: 'Retry offline setup' }).tap();
  await expect(page.getByRole('status')).toHaveText('Ready offline');
  await offlineServer.stop();
  if (browserName === 'chromium') await context.setOffline(true);
  await page.goto('/rules?game=clock');
  await expect(page.getByText('Clock', { exact: true })).toBeVisible();
});

test('failed initial download never claims offline readiness', async ({ page, offlineServer }) => {
  offlineServer.failIcon(true);
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Offline setup incomplete', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Retry offline setup' })).toBeVisible();
  offlineServer.failIcon(false);
  await page.getByRole('button', { name: 'Retry offline setup' }).tap();
  await expect(page.getByRole('status')).toHaveText('Ready offline');
});
