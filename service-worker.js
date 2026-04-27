const SW_CACHE_PREFIX = 'mactec-messenger-';
const SW_VERSION = `${SW_CACHE_PREFIX}v2`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(SW_CACHE_PREFIX) && key !== SW_VERSION)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});
