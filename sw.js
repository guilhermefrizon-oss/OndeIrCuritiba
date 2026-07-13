// ── sw.js — Service Worker do Day Match ────────────────────────────
// Estratégia: REDE PRIMEIRO. Sempre tenta a rede (então online você pega a
// versão nova na hora — importante durante os testes), e cai no cache só
// quando está offline ou a rede falha. Assim o app abre mesmo sem sinal e
// aguenta conexão ruim, sem risco de servir versão velha.
//
// Requisições de OUTROS domínios (Firebase, Google Maps/Places, fotos) NÃO
// são interceptadas — vão direto pra rede, como sempre.

const CACHE = 'daymatch-v1';
const CORE = ['./', './index.html', './css/styles.css', './site.webmanifest', './icon-192.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // ativa a versão nova sem esperar
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
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
