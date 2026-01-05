// service-worker.js - VERSÃO OTIMIZADA
const CACHE_NAME = 'pescapp-v1.3';
const OFFLINE_PAGE = '/index.html';

// URLs para cache (prioridade: essenciais primeiro)
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/api-integrations.js',
  '/js/data/database-es.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.json'
];

// Recursos externos (CDN)
const externalResources = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css',
  'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js'
];

// Instalação - cache dos arquivos essenciais
self.addEventListener('install', event => {
  console.log('[SW] 📦 Instalando Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 📂 Cache aberto');
        
        // Cache de arquivos essenciais (prioridade)
        return cache.addAll(urlsToCache)
          .then(() => {
            console.log('[SW] ✅ Arquivos essenciais em cache');
            
            // Tenta cache de recursos externos (não bloqueante)
            return Promise.all(
              externalResources.map(url => 
                fetch(url)
                  .then(response => {
                    if (response.ok) {
                      cache.put(url, response);
                      console.log(`[SW] 🔗 ${url} - em cache`);
                    }
                  })
                  .catch(() => {
                    console.log(`[SW] ⚠️ ${url} - falha no cache (pode usar online)`);
                  })
              )
            );
          });
      })
      .then(() => {
        console.log('[SW] 🚀 Pula espera para ativação imediata');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] ❌ Erro na instalação:', error);
      })
  );
});

// Ativação - limpa caches antigos
self.addEventListener('activate', event => {
  console.log('[SW] 🔄 Ativando Service Worker...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log(`[SW] 🗑️ Removendo cache antigo: ${cache}`);
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => {
      console.log('[SW] ✅ Cache limpo com sucesso!');
      return self.clients.claim();
    })
    .then(() => {
      console.log('[SW] 👑 Service Worker pronto para controlar clientes');
    })
  );
});

// Estratégia: Cache First, com fallback para rede
self.addEventListener('fetch', event => {
  // Ignora requisições não-GET e de extensões
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension://') ||
      event.request.url.includes('sockjs-node')) {
    return;
  }
  
  // URLs de API (sempre busca na rede primeiro)
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('weather-api') ||
      event.request.url.includes('tide-api')) {
    networkFirstStrategy(event);
    return;
  }
  
  // Para HTML e navegação: Network First com fallback para cache
  if (event.request.mode === 'navigate') {
    networkFirstWithOfflineFallback(event);
    return;
  }
  
  // Para outros recursos: Cache First com fallback para rede
  cacheFirstStrategy(event);
});

// Estratégia: Network First (para navegação e dados dinâmicos)
function networkFirstWithOfflineFallback(event) {
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Atualiza o cache com a nova resposta
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME)
          .then(cache => cache.put(event.request, responseClone));
        
        return networkResponse;
      })
      .catch(() => {
        console.log(`[SW] 🔌 Offline - servindo página do cache`);
        return caches.match(OFFLINE_PAGE)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Página offline customizada
            return new Response(
              '<h1>Você está offline</h1><p>Conecte-se à internet para usar todas as funcionalidades.</p>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          });
      })
  );
}

// Estratégia: Cache First (para recursos estáticos)
function cacheFirstStrategy(event) {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          console.log(`[SW] 📦 Do cache: ${event.request.url}`);
          return cachedResponse;
        }
        
        // Busca na rede
        return fetch(event.request)
          .then(networkResponse => {
            // Se a resposta é válida, adiciona ao cache
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseClone));
            }
            return networkResponse;
          })
          .catch(error => {
            console.log(`[SW] ❌ Erro na rede: ${event.request.url}`, error);
            
            // Para CSS/JS, retorna resposta vazia para não quebrar a página
            if (event.request.url.includes('.css')) {
              return new Response('', { 
                headers: { 'Content-Type': 'text/css' } 
              });
            }
            if (event.request.url.includes('.js')) {
              return new Response('console.log("Recurso offline");', { 
                headers: { 'Content-Type': 'application/javascript' } 
              });
            }
            
            throw error;
          });
      })
  );
}

// Estratégia: Network First (para APIs)
function networkFirstStrategy(event) {
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        return networkResponse;
      })
      .catch(() => {
        // Se offline, tenta buscar do cache (dados antigos)
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              console.log(`[SW] 📊 API do cache (dados antigos): ${event.request.url}`);
              return cachedResponse;
            }
            return new Response(
              JSON.stringify({ error: 'offline', message: 'Conecte-se à internet para dados atualizados' }),
              { 
                headers: { 
                  'Content-Type': 'application/json',
                  'X-SW-Offline': 'true'
                } 
              }
            );
          });
      })
  );
}

// Mensagens do app principal
self.addEventListener('message', event => {
  console.log('[SW] 📨 Mensagem recebida:', event.data);
  
  switch (event.data.action) {
    case 'skipWaiting':
      self.skipWaiting();
      break;
      
    case 'clearCache':
      caches.delete(CACHE_NAME)
        .then(() => {
          console.log('[SW] 🗑️ Cache limpo por solicitação');
        });
      break;
      
    case 'getCacheSize':
      caches.open(CACHE_NAME)
        .then(cache => cache.keys())
        .then(keys => {
          event.ports[0].postMessage({ size: keys.length });
        });
      break;
  }
});

// Evento de sincronização em background (para futuras funcionalidades)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-favorites') {
    console.log('[SW] 🔄 Sincronizando dados em background...');
    event.waitUntil(syncFavorites());
  }
});

// Exemplo: função de sincronização
function syncFavorites() {
  return new Promise((resolve) => {
    console.log('[SW] ⏳ Sincronização simulada...');
    setTimeout(() => {
      console.log('[SW] ✅ Sincronização completa');
      resolve();
    }, 1000);
  });
}