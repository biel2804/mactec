const SW_VERSION = 'mactec-messenger-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== SW_VERSION)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});
