const CACHE_NAME = 'chama-ocre-offline-v1';

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(['/', '/index.html', '/manifest.json']);
        })
    );
});

self.addEventListener('fetch', (e) => {
    // 1. Ignorar métodos que não sejam GET (permite que POST e DELETE funcionem na API)
    if (e.request.method !== 'GET') {
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            // Se já tem no cache (útil para offline), devolve
            if (cachedResponse) return cachedResponse;
            
            // Tenta buscar à rede
            return fetch(e.request).then((networkResponse) => {
                // 2. Ignorar respostas de erro ou parciais (206) que quebram o cache de vídeos
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                // Guarda ficheiros da pasta uploads (fotos e vídeos) dinamicamente no cache
                if (e.request.url.includes('/uploads/') || e.request.url.includes('/socket.io/')) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
                }
                
                return networkResponse;
            }).catch(() => {
                return new Response('', { status: 408, statusText: 'Offline' });
            });
        })
    );
});