const CACHE = 'keva-v9';
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
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return resp;
      }))
    );
    return;
  }

  // Everything else (HTML, API, icons): network first, cache fallback
  e.respondWith(
    fetch(e.request).then(resp => {
      const clone = resp.clone();
      if (resp.ok) caches.open(CACHE).then(c => c.put(e.request, clone));
      return resp;
    }).catch(() => caches.match(e.request))
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

async function pullQueuedNotifications() {
  const sub = await self.registration.pushManager.getSubscription();
  if (!sub?.endpoint) return [];

  const response = await fetch(`${PUSH_WORKER_URL}/notifications/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });

  if (!response.ok) return [];

  const payload = await response.json();
  return Array.isArray(payload.notifications) ? payload.notifications : [];
}

// Push notification handler
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    const queued = await pullQueuedNotifications().catch(() => []);
    if (queued.length > 0) {
      await Promise.all(queued.map(showKevaNotification));
      return;
    }

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
