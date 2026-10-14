// public/sw.js
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
    // Apenas deixa a requisição passar. É o suficiente para o Chrome aceitar a instalação.
    e.respondWith(fetch(e.request).catch(() => new Response('Offline')));
});