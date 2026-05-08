// Service Worker minimo para a PWA Ficha OAM.
// Cacheia a casca do app para que abra rapido no celular,
// mas nao guarda dados de cliente (uso online).

const CACHE_NAME = 'ficha-oam-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Estrategia: cache-first para os assets estaticos; rede para o resto.
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((resp) => resp || fetch(event.request))
  );
});
