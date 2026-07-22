// ── sw.js — Service Worker do Day Match ────────────────────────────
// Estratégia: REDE PRIMEIRO. Sempre tenta a rede (então online você pega a
// versão nova na hora — importante durante os testes), e cai no cache só
// quando está offline ou a rede falha. Assim o app abre mesmo sem sinal e
// aguenta conexão ruim, sem risco de servir versão velha.
//
// Requisições de OUTROS domínios (Firebase, Google Maps/Places, fotos) NÃO
// são interceptadas — vão direto pra rede, como sempre.

const CACHE = 'daymatch-v7';
const PHOTO_CACHE = 'daymatch-photos-v2';   // fotos dos lugares (Google + Storage)
const PHOTO_MAX = 300;                        // teto de fotos guardadas
const CORE = ['./', './index.html', './css/styles.css', './site.webmanifest', './icon-192.png'];

// É uma foto de lugar do Google? (endpoint de mídia da Places API ou o
// servidor de imagens pra onde ele redireciona).
function isPhoto(url) {
  return url.hostname.endsWith('googleusercontent.com')
      || url.hostname.endsWith('ggpht.com')
      || (url.hostname === 'places.googleapis.com' && url.pathname.includes('/media'))
      // Fotos hospedadas no NOSSO Firebase Storage — cachear cache-first evita
      // baixar de novo a cada visualização (a banda é o que gera custo).
      || url.hostname.endsWith('firebasestorage.googleapis.com')
      || url.hostname.endsWith('firebasestorage.app')
      || url.hostname === 'storage.googleapis.com';
}

// Cache-first: se já baixou a foto antes, devolve na hora (sem rede).
// Senão baixa, guarda uma cópia e apara o cache pra não crescer sem limite.
async function cacheFirstPhoto(req) {
  const cache = await caches.open(PHOTO_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(req, res.clone()).then(() => trimCache(cache, PHOTO_MAX)).catch(() => {});
    }
    return res;
  } catch (e) {
    return hit || Response.error();
  }
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('install', (event) => {
  self.skipWaiting(); // ativa a versão nova sem esperar
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const keep = [CACHE, PHOTO_CACHE];
    await Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Fotos dos lugares: cache-first (2ª visita abre na hora, sem esperar rede).
  if (isPhoto(url)) { event.respondWith(cacheFirstPhoto(req)); return; }

  if (url.origin !== self.location.origin) return; // cross-origin → browser cuida (Firebase/Google)

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      // guarda uma cópia das respostas boas do próprio site pro modo offline
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (e) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
