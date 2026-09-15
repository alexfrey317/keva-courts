const CACHE = 'keva-v10';
const PUSH_WORKER_URL = 'https://keva-push.alexfrey317.workers.dev';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Only cache GET requests
  if (e.request.method !== 'GET') return;

  // Hashed assets (filename contains hash): cache first
  if (e.request.url.includes('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }))
    );
    return;
  }

  // Everything else (HTML, API, icons): network first, cache fallback.
  // Navigations fall back to the cached app shell (ignoring the query string)
  // so the PWA opens offline instead of showing a browser error page.
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(async () => {
      const cached = await caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
      if (cached) return cached;
      if (e.request.mode === 'navigate') {
        const shell = await caches.match(new URL(self.registration.scope).pathname, { ignoreSearch: true });
        if (shell) return shell;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
    })
  );
});

function showKevaNotification(data) {
  return self.registration.showNotification(data.title || 'KEVA Volleyball', {
    body: data.body || '',
    tag: data.tag || 'keva',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || self.registration.scope },
  });
}

async function getEndpoint() {
  const sub = await self.registration.pushManager.getSubscription();
  return sub?.endpoint || null;
}

// Pull is non-destructive: the worker keeps items queued until we ack them
// after showNotification resolves, so a failed pull or a crash never loses one.
async function pullQueuedNotifications(endpoint) {
  const response = await fetch(`${PUSH_WORKER_URL}/notifications/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });

  if (!response.ok) throw new Error(`pull ${response.status}`);

  const payload = await response.json();
  return Array.isArray(payload.notifications) ? payload.notifications : [];
}

async function ackNotifications(endpoint, ids) {
  if (!ids.length) return;
  await fetch(`${PUSH_WORKER_URL}/notifications/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, ids }),
  }).catch(() => {});
}

// Push notification handler
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    const endpoint = await getEndpoint().catch(() => null);
    let queued = null;
    if (endpoint) {
      queued = await pullQueuedNotifications(endpoint).catch(() => null);
    }

    if (queued && queued.length > 0) {
      const shown = [];
      for (const item of queued) {
        try {
          await showKevaNotification(item);
          if (item.id) shown.push(item.id);
        } catch {}
      }
      await ackNotifications(endpoint, shown);
      return;
    }

    // Pull failed (or nothing queued): fall back to any inline payload.
    if (!e.data) return;
    try {
      await showKevaNotification(e.data.json());
    } catch {}
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || self.registration.scope;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(url) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
