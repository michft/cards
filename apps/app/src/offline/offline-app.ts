import { useSyncExternalStore } from 'react';

type OfflineState = {
  status: 'preparing' | 'ready' | 'error';
  offline: boolean;
  installed: boolean;
  updateAvailable: boolean;
  error?: string;
};

let state: OfflineState = { status: 'preparing', offline: false, installed: false, updateAvailable: false };
const listeners = new Set<() => void>();
let preparing: Promise<void> | null = null;
let stopWatchingUpdates: (() => void) | undefined;

function update(patch: Partial<OfflineState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function installed() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || ('standalone' in navigator && navigator.standalone === true);
}

function watchUpdates(registration: ServiceWorkerRegistration) {
  stopWatchingUpdates?.();
  let worker: ServiceWorker | null = null;
  const changed = () => update({ updateAvailable: registration.waiting !== null });
  const found = () => {
    worker?.removeEventListener('statechange', changed);
    worker = registration.installing;
    worker?.addEventListener('statechange', changed);
    changed();
  };
  registration.addEventListener('updatefound', found);
  found();
  stopWatchingUpdates = () => {
    registration.removeEventListener('updatefound', found);
    worker?.removeEventListener('statechange', changed);
  };
}

function activeWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
  if (registration.active) return Promise.resolve(registration.active);
  return new Promise((resolve, reject) => {
    const worker = registration.installing ?? registration.waiting;
    if (!worker) { reject(new Error('Offline setup did not start. Connect and retry.')); return; }
    const timer = setTimeout(() => finish(new Error('Offline setup timed out. Connect and retry.')), 60_000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
      if (error) reject(error); else resolve(worker);
    };
    const changed = () => {
      if (worker.state === 'activated') finish();
      if (worker.state === 'redundant') finish(new Error('Offline download failed. Connect and retry.'));
    };
    worker.addEventListener('statechange', changed);
    changed();
  });
}

function checkCache(worker: ServiceWorker, repair = false): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => finish(new Error('Offline setup timed out. Connect and retry.')), repair ? 60_000 : 10_000);
    const finish = (error?: Error, ready = false) => {
      clearTimeout(timer);
      channel.port1.close(); channel.port2.close();
      if (error) reject(error); else resolve(ready);
    };
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const reply = event.data;
      const ready = typeof reply === 'object' && reply !== null && 'ready' in reply && reply.ready === true;
      finish(undefined, ready);
    };
    worker.postMessage({ type: repair ? 'PREPARE_OFFLINE' : 'OFFLINE_STATUS' }, [channel.port2]);
  });
}

export async function prepareOfflineApp() {
  if (preparing) return preparing;
  preparing = (async () => {
    update({ status: 'preparing', offline: !navigator.onLine, installed: installed(), error: undefined });
    try {
      if (!window.isSecureContext || !('serviceWorker' in navigator) || !navigator.locks) {
        throw new Error('Open this app in Safari using its HTTPS address to set up offline play.');
      }
      // An installed offline app must not need a successful script fetch to reopen.
      const existing = await navigator.serviceWorker.getRegistration('/');
      const registration = existing ?? await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      watchUpdates(registration);
      if (existing && navigator.onLine) void existing.update().catch(() => {});
      const worker = await activeWorker(registration);
      let ready = await checkCache(worker);
      if (!ready && navigator.onLine) ready = await checkCache(worker, true);
      if (!ready) throw new Error('Offline files are incomplete. Connect and retry setup.');
      update({ status: 'ready', updateAvailable: registration.waiting !== null });
      // Home Screen apps may be granted persistent storage; never promise permanence.
      if (installed()) void navigator.storage?.persist?.().catch(() => {});
    } catch (error: unknown) {
      update({ status: 'error', error: error instanceof Error ? error.message : 'Offline setup failed. Connect and retry.' });
    }
  })().finally(() => { preparing = null; });
  return preparing;
}

export function startOfflineApp() {
  if (typeof window === 'undefined' || (typeof __DEV__ !== 'undefined' && __DEV__)) return;
  void prepareOfflineApp();
  const online = () => { update({ offline: false }); void prepareOfflineApp(); };
  const offline = () => update({ offline: true });
  const visible = () => { if (document.visibilityState === 'visible') void prepareOfflineApp(); };
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', visible);
  return () => {
    stopWatchingUpdates?.();
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', visible);
  };
}

export function useOfflineApp() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => state, () => state);
}
