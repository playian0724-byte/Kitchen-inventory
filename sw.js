const CACHE = 'kitchen-stock-push-v2';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./config.js','./push.js','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  event.waitUntil(self.registration.showNotification(
    data.title || '취사장 유통기한 알림',
    {
      body: data.body || '유통기한 임박 재고를 확인하세요.',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'kitchen-expiry-daily',
      data: { url: data.url || '/' }
    }
  ));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});