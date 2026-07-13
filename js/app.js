// ── app.js ────────────────────────────────────────────────────────
import {
  fsLoadPlaces, fsLoadCategories,
  fsLoadAll, fsSave, fsRemove, fsIncrementLike, fsRemoveLike,
  fsWantToday, fsLoadWantToday, fsRemoveWantToday,
  fsSkip, fsLoadSkipped, fsUnskip, fsClearSkipped,
  fsBeenThere, fsLoadBeenThere, fsRemoveBeenThere
} from './store.js';
import { awardXp } from './xp.js';
import { checkAndAwardBadges } from './badges.js';
import { fetchAllPhotos, fetchPlacePhoto } from './photos.js';
import { renderFavorites, toggleFavView, renderFavMap } from './favorites.js';
import { initSearch, openSearch } from './search.js';
import { initQuiz, openQuiz } from './quiz.js';
import { renderCommentsSection, unsubscribeComments } from './comments.js';
import { renderRatingBlock, loadRating } from './ratings.js';
import { ic, catIcon } from './icons.js';

// Sinaliza que toda a cadeia de módulos (firebase, store, auth, xp…)
// carregou. O watchdog em index.html usa isto para detectar quando o
// app não inicializa (ex.: SDK do Firebase bloqueado em webview/rede).
window.__dmBooted = true;

// ── State ──────────────────────────────────────────────────────────
let P        = [];
let CATS     = ['Todos'];
let CE       = {};  // emojis do banco não são mais usados na UI
let cat      = 'Todos';
let filtered = [];
let idx      = 0;
let saved    = [];      // favoritos permanentes
let wantToday = [];     // quero ir hoje
let skipped   = {};     // pulados hoje {id: true}
let beenThere = {};     // já fui {id: {visitedAt}}

let cardPhotos    = [];
let cardPhotosPos = [];   // foco de cada foto do card (paralelo a cardPhotos)
let cardPhotoIdx  = 0;
let profilePhotos = [];
let profilePhotosPos = []; // foco de cada foto do perfil (paralelo a profilePhotos)
let profilePhotoIdx = 0;

let lastAction  = null;  // {type:'skip'|'want'|'been', place, prevIdx} — para desfazer
let userPos     = null;  // {lat,lng} do usuário (geolocalização)

let activeCard  = null;
let dragActive  = false;
let dragStartX  = 0;
let dragStartY  = 0;
let dragCurX    = 0;
let dragLocked  = false;
let dragHappened = false; // impede o click no bottom-tap após um swipe

// ── Helpers ────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

// Interesses do usuário (categorias favoritas), guardados no login/edição.
// Lidos do localStorage → disponíveis de forma síncrona ao montar o baralho.
function getUserInterests() {
  try { return JSON.parse(localStorage.getItem('cwb_interests') || '[]'); }
  catch { return []; }
}

// Ordem do baralho: SEMPRE embaralhada (ordem diferente a cada abertura).
// Se a pessoa tem interesses, os lugares dessas categorias vêm primeiro
// (também embaralhados entre si) — sem esconder os demais. Sem interesses,
// é só aleatório.
function orderDeck(places) {
  const shuffled = shuffle(places);
  const interests = getUserInterests();
  if (!interests.length) return shuffled;
  const match = [], rest = [];
  for (const p of shuffled) {
    const cats = Array.isArray(p.cats) ? p.cats : (p.c ? [p.c] : []);
    (cats.some(c => interests.includes(c)) ? match : rest).push(p);
  }
  return [...match, ...rest];
}

// ── Init ───────────────────────────────────────────────────────────

// Carrega ratings de todos os lugares em paralelo e atualiza os cards visíveis
async function loadAllRatings() {
  if (!P.length) return;
  const results = await Promise.allSettled(
    P.map(p => loadRating(p.id).then(r => ({ id: p.id, ...r })))
  );
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value.avg > 0) {
      const p = P.find(x => x.id === r.value.id);
      if (p) p._avgRating = r.value;
    }
  });
  // Re-renderiza os cards para mostrar as notas
  renderCard();
}
async function init() {
  // IMPORTANTE: não usar stack.innerHTML aqui — isso apagava os stamps
  // (#likeStamp etc.) e quebrava o arrastar do card.
  const stack = document.getElementById('cardStack');
  const loader = document.createElement('div');
  loader.className = 'stack-loading';
  loader.innerHTML = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:14px;color:var(--text3)">
      <div style="width:36px;height:36px;border:3px solid var(--bg4);
        border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite"></div>
      <span style="font-size:14px">Carregando lugares…</span>
    </div>`;
  if (stack) stack.appendChild(loader);

  // Rede de segurança: se as leituras não voltarem (transporte do Firestore
  // bloqueado, offline), não deixa o spinner "Carregando lugares…" para
  // sempre — mostra um aviso com botão de tentar de novo.
  const TIMEOUT = Symbol('timeout');
  const loadData = Promise.all([fsLoadCategories(), fsLoadPlaces()]);
  const result = await Promise.race([
    loadData,
    new Promise(res => setTimeout(() => res(TIMEOUT), 20000)),
  ]);

  if (result === TIMEOUT) {
    loader.remove();
    renderLoadError(stack);
    return;
  }

  const [cats, places] = result;
  loader.remove();

  if (cats.length) {
    CATS = ['Todos', ...cats.map(c => c.name)];
    CE   = {};
    cats.forEach(c => { CE[c.name] = c.emoji || ''; });
  }

  if (places.length) P = orderDeck(places);

  filtered = [...P];
  initSearch(P);
  initQuiz(P);

  buildCategoryRow();
  renderCard();
  renderProgress();
  showWelcomeScreen();

  const [allSaved, allWant, allSkipped, allBeen] = await Promise.all([
    fsLoadAll(), fsLoadWantToday(), fsLoadSkipped(), fsLoadBeenThere()
  ]);
  if (allSaved?.length) { saved = allSaved; updateBadge(); }
  if (allWant?.length)  { wantToday = allWant; updateWantBadge(); }
  skipped   = allSkipped || {};
  beenThere = allBeen    || {};

  // Filtra feed excluindo pulados hoje e já fui < 10 dias
  applyUserFilters();

  // Carrega médias de rating em background e atualiza cards
  if (window.FEATURES?.ratings) loadAllRatings();

  // Distância até o usuário (pede permissão só se ainda não decidiu)
  requestUserLocation();

  // Dica de swipe na primeira visita
  maybeShowSwipeHint();
}

// ── Geolocalização (distância nos cards) ──────────────────────────
function requestUserLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      renderCard(); // re-renderiza para mostrar as distâncias
    },
    () => {}, // negado/erro: segue sem distância
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
  );
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat/2)**2 +
    Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

function distLabel(p) {
  if (!userPos || !p.lat || !p.lng) return '';
  const km = distanceKm(userPos, { lat: p.lat, lng: p.lng });
  const txt = km < 1 ? `${Math.round(km*1000)} m` : `${km.toFixed(1).replace('.',',')} km`;
  return `<span class="dist-chip">${ic('navigation', 11)} ${txt}</span>`;
}

// ── Aberto agora (parse de "Seg-Dom 09h-20h") ──────────────────────
const DAY_IDX = { dom:0, seg:1, ter:2, qua:3, qui:4, sex:5, sab:6, 'sáb':6 };

function parseOpenNow(hoursStr) {
  if (!hoursStr) return null;
  const s = hoursStr.toLowerCase();
  const dayMatch  = s.match(/(dom|seg|ter|qua|qui|sex|sab|sáb)\s*[-–a]\s*(dom|seg|ter|qua|qui|sex|sab|sáb)/);
  const timeMatch = s.match(/(\d{1,2})(?:[h:](\d{2})?)?\s*[-–às]+\s*(\d{1,2})(?:[h:](\d{2})?)?/);
  if (!timeMatch) return null;

  const now = new Date();
  const today = now.getDay();

  if (dayMatch) {
    const d1 = DAY_IDX[dayMatch[1]], d2 = DAY_IDX[dayMatch[2]];
    const inRange = d1 <= d2 ? (today >= d1 && today <= d2)
                             : (today >= d1 || today <= d2); // ex: Sex-Dom cruzando a semana
    if (!inRange) return false;
  }

  const openMin  = parseInt(timeMatch[1],10)*60 + (parseInt(timeMatch[2]||'0',10));
  let   closeMin = parseInt(timeMatch[3],10)*60 + (parseInt(timeMatch[4]||'0',10));
  const nowMin   = now.getHours()*60 + now.getMinutes();
  if (closeMin === 0) closeMin = 24*60; // "00h" = meia-noite
  if (closeMin < openMin) { // fecha depois da meia-noite (ex: 18h-02h)
    return nowMin >= openMin || nowMin < closeMin;
  }
  return nowMin >= openMin && nowMin < closeMin;
}

function openBadgeHTML(p) {
  const open = parseOpenNow(p.h);
  if (open === null) return '';
  return open
    ? '<span class="open-badge open">● Aberto agora</span>'
    : '<span class="open-badge closed">● Fechado</span>';
}

// ── Category row ───────────────────────────────────────────────────
function buildCategoryRow() {
  const row = document.getElementById('catsRow');
  row.innerHTML = '';
  CATS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'cat-pill' + (c === cat ? ' on' : '');
    b.innerHTML = `${catIcon(c, 14)}${c}`;
    b.onclick = () => setCat(c);
    row.appendChild(b);
  });
}

// ── Filtro "Abertos agora" ─────────────────────────────────────────
let openNowOnly = false;

window.toggleOpenNow = () => {
  openNowOnly = !openNowOnly;
  const btn = document.getElementById('openNowBtn');
  if (btn) btn.classList.toggle('on', openNowOnly);
  applyUserFilters();
  renderCard(); renderProgress();
  const mapView = document.getElementById('mapView');
  if (mapView && mapView.style.display !== 'none') renderMapView();
};

export function setCat(c) {
  cat = c;
  document.querySelectorAll('#catsRow .cat-pill').forEach((b,i) => b.classList.toggle('on', CATS[i]===c));
  applyUserFilters();
  idx=0; renderCard(); renderProgress();
  // Se a aba Mapa estiver aberta, atualiza os pins
  const mapView = document.getElementById('mapView');
  if (mapView && mapView.style.display !== 'none') renderMapView();
}

function applyUserFilters() {
  const base = cat==='Todos' ? [...P] : P.filter(p => {
    const cats = Array.isArray(p.cats) ? p.cats : (p.c ? [p.c] : []);
    return cats.includes(cat);
  });
  // "Já fui" (beenThere) NÃO exclui mais do baralho — o lugar continua
  // aparecendo. Só "pulados hoje" e "quero ir hoje" saem do feed.
  filtered = base.filter(p =>
    !skipped[p.id] && !wantToday.find(w => w.id === p.id)
    && (!openNowOnly || parseOpenNow(p.h) === true)
  );
  idx = 0;
}

function place() { return filtered[idx % filtered.length]; }

// ── Progress dots ──────────────────────────────────────────────────
function renderProgress() {
  const row = document.getElementById('progressRow');
  if (!row) return; // indicador de progresso removido
  const total = Math.min(filtered.length, 5);
  row.innerHTML = '';
  for (let i=0; i<total; i++) {
    const d = document.createElement('div');
    d.className = 'pdot' + (i === idx%total ? ' on' : '');
    row.appendChild(d);
  }
}

// ── Cards ──────────────────────────────────────────────────────────
function renderCard() {
  const stack = document.getElementById('cardStack');
  stack.querySelectorAll('.place-card').forEach(e => e.remove());
  stack.querySelector('.deck-empty')?.remove();
  if (!filtered.length) { renderDeckEmpty(stack); return; }

  for (let i=Math.min(2,filtered.length-1); i>=0; i--) {
    const p = filtered[(idx+i)%filtered.length];
    const card = makeCard(p);
    if (i > 0) {
      // Cartas de trás em leque: pivô na base + leve rotação pros lados,
      // então elas "vazam" pra esquerda/direita em vez de pra baixo (o que
      // deixava tudo grudado nos botões). Sobe um tico pra base ficar limpa.
      const rot = i === 1 ? 4 : -4;
      card.style.transformOrigin = 'bottom center';
      card.style.transform = `translateY(${-i*4}px) rotate(${rot}deg) scale(${1-i*0.035})`;
      card.style.zIndex    = 10 - i;
      card.style.opacity   = 1 - i*0.18;
      card.style.pointerEvents = 'none';
    } else {
      card.style.zIndex = 20;
      card.dataset.top  = '1';
      bindDrag(card);
    }
    stack.appendChild(card);
    // Já define a foto dos 3 cards visíveis (topo + 2 de trás), então
    // quando um card de trás vira o topo a foto já está lá.
    setCardBg(card, p);
  }

  const top = filtered[idx%filtered.length];
  initCardPhotos(top);

  // Pré-baixa as fotos das PRÓXIMAS cartas pro cache do navegador,
  // pra troca não ter atraso ao arrastar.
  prefetchUpcoming(3);
}

// Ponto de foco do enquadramento salvo no admin (ex: "50% 30%").
// Sem valor salvo → 'center' (comportamento antigo).
function photoPos(p, i) {
  const pos = p && Array.isArray(p.photosPos) ? p.photosPos[i] : null;
  return pos || 'center';
}

// Define a foto de fundo de um card (usa foto salva ou busca no Google)
function setCardBg(card, p) {
  const bg = card.querySelector('.card-bg');
  if (!bg) return;
  if (Array.isArray(p.photos) && p.photos.length) {
    bg.style.backgroundImage = `url("${p.photos[0]}")`;
    bg.style.backgroundSize  = 'cover';
    bg.style.backgroundPosition = photoPos(p, 0);
  } else if (p.pid && !p.pid.startsWith('ID_GOOGLE_')) {
    // Usa fetchAllPhotos (mesmo cache do story do card) → 1 chamada por
    // lugar, compartilhada entre o fundo, o story e o pré-carregamento.
    fetchAllPhotos(p.pid).then(urls => {
      if (!urls.length) return;
      bg.style.backgroundImage = `url("${urls[0]}")`;
      bg.style.backgroundSize  = 'cover';
    });
  }
}

// ── Pré-carregamento das fotos das próximas cartas ────────────────
const _preloadedUrls = new Set();
function preloadImage(url) {
  if (!url || _preloadedUrls.has(url)) return;
  _preloadedUrls.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.src = url; // baixa e deixa no cache do navegador
}

function prefetchUpcoming(count = 3) {
  if (!filtered.length) return;
  const seen = new Set();
  for (let i = 1; i <= count; i++) {
    const p = filtered[(idx + i) % filtered.length];
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    if (Array.isArray(p.photos) && p.photos.length) {
      p.photos.slice(0, 3).forEach(preloadImage); // 1ª + próximas do card
    } else if (p.pid && !p.pid.startsWith('ID_GOOGLE_')) {
      // Mesmo fetchAllPhotos (com cache) usado no card → não gera chamada
      // extra: só adianta a que aconteceria quando a carta chegar ao topo.
      fetchAllPhotos(p.pid).then(urls => urls.slice(0, 3).forEach(preloadImage));
    }
  }
}

// ── Erro ao carregar (rede/transporte do Firestore) ───────────────
function renderLoadError(stack) {
  if (!stack) return;
  stack.querySelector('.deck-empty')?.remove();
  const el = document.createElement('div');
  el.className = 'deck-empty';
  el.innerHTML = `
    <div class="deck-empty-ico">${ic('frown', 40, 1.5)}</div>
    <div class="deck-empty-title">Não conseguimos carregar</div>
    <div class="deck-empty-sub">Verifique sua conexão. Se estiver usando<br>VPN ou Modo Privado, tente desativar.</div>
    <button class="deck-empty-btn" onclick="location.reload()">Tentar de novo</button>`;
  stack.appendChild(el);
}

// ── Fim do baralho ─────────────────────────────────────────────────
function renderDeckEmpty(stack) {
  const baseCount = cat === 'Todos' ? P.length : P.filter(p => {
    const cats = Array.isArray(p.cats) ? p.cats : (p.c ? [p.c] : []);
    return cats.includes(cat);
  }).length;

  const el = document.createElement('div');
  el.className = 'deck-empty';

  if (openNowOnly && baseCount) {
    el.innerHTML = `
      <div class="deck-empty-ico">${ic('clock', 40, 1.5)}</div>
      <div class="deck-empty-title">Nada aberto agora</div>
      <div class="deck-empty-sub">Nenhum lugar aberto neste horário<br>com esses filtros.</div>
      <button class="deck-empty-btn" onclick="window.toggleOpenNow()">Mostrar todos os horários</button>`;
  } else if (!baseCount) {
    el.innerHTML = `
      <div class="deck-empty-ico">${ic('search', 40, 1.5)}</div>
      <div class="deck-empty-title">Nada por aqui ainda</div>
      <div class="deck-empty-sub">Nenhum lugar nessa categoria.<br>Explore outra!</div>
      <button class="deck-empty-btn" onclick="window.setCatTodos()">Ver todos os lugares</button>`;
  } else {
    el.innerHTML = `
      <div class="deck-empty-ico">${ic('check-circle', 40, 1.5)}</div>
      <div class="deck-empty-title">Você viu tudo por hoje!</div>
      <div class="deck-empty-sub">Os lugares que você pulou<br>voltam amanhã.</div>
      <button class="deck-empty-btn" onclick="window.resetSkipped()">Rever lugares pulados</button>
      ${cat !== 'Todos' ? '<button class="deck-empty-btn ghost" onclick="window.setCatTodos()">Ver outras categorias</button>' : ''}`;
  }
  stack.appendChild(el);
}

window.setCatTodos = () => setCat('Todos');

window.resetSkipped = () => {
  skipped = {};
  fsClearSkipped();
  applyUserFilters();
  renderCard(); renderProgress();
  showToast('Lugares pulados de volta ao baralho!');
};

function makeCard(p) {
  const el = document.createElement('div');
  // ATENÇÃO: nada de classe com animation aqui — animação CSS com
  // fill-mode sobrescreve o style.transform e mata o drag do card.
  el.className = 'place-card';

  const ratingHTML = (window.FEATURES?.ratings && p._avgRating?.avg > 0)
    ? `<div class="card-rating">★ ${p._avgRating.avg.toFixed(1)}</div>`
    : '';

  el.innerHTML = `
    <div class="card-bg bg-${p.bg}"><div class="photo-loading">${catIcon(p.c, 44, 1.5)}</div></div>
    <div class="card-overlay"></div>
    <div class="card-glow"></div>
    <div class="card-top">
      <div class="cat-tag">${p.c}</div>
      ${openBadgeHTML(p)}
    </div>
    <div class="card-story-bars"></div>
    <div class="card-photo-tap card-photo-tap-left"></div>
    <div class="card-photo-tap card-photo-tap-right"></div>
    <div class="card-bottom card-bottom-tap"
         onclick="event.stopPropagation();window._openProfileCurrent()">
      <div class="card-name-row">
        <div class="card-name">${p.n}</div>
        <div class="card-name-right">
          ${ratingHTML}
          <div class="price-tag">${p.p}</div>
        </div>
      </div>
      <div class="card-addr">${ic('map-pin', 13)} ${p.a}</div>
      <div class="card-meta">
        <span>${p.b}</span><div class="meta-sep"></div><span>${ic('clock', 12)} ${p.h}</span>
      </div>
      <div class="card-status-row">${distLabel(p)}</div>
      <div class="card-footer">
        <div class="ig-chip">${ic('camera', 12)}${p.ig}</div>
        <div class="card-profile-hint">Ver perfil →</div>
      </div>
    </div>`;
  return el;
}

window._openProfileCurrent = () => {
  if (dragHappened) return; // ignorar clique que vem logo após um swipe
  openProfile(filtered[idx % filtered.length]);
};

// ── Card photos (story) ────────────────────────────────────────────
function initCardPhotos(p) {
  cardPhotos = []; cardPhotoIdx = 0;
  updateCardStoryBars();

  const bindTap = (el, fn) => {
    if (!el) return;
    let tsX = 0, touched = false;
    el.addEventListener('touchstart', e => { tsX = e.touches[0].clientX; touched = true; }, {passive:true});
    el.addEventListener('touchend',   e => {
      // Só conta como "tap" se o dedo não arrastou (senão é swipe do card)
      if (Math.abs(e.changedTouches[0].clientX - tsX) < 15) {
        e.preventDefault(); e.stopPropagation(); fn();
      }
    });
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (touched) { touched = false; return; } // no toque, o touchend já tratou
      fn();
    });
  };
  // IMPORTANTE: escopar ao card do TOPO — os 3 cards têm as mesmas
  // classes, e um seletor global pegaria o card de trás (inerte).
  const topCard = document.querySelector('.place-card[data-top="1"]');
  bindTap(topCard?.querySelector('.card-photo-tap-left'),  cardPhotoPrev);
  bindTap(topCard?.querySelector('.card-photo-tap-right'), cardPhotoNext);

  if (Array.isArray(p.photos) && p.photos.length) {
    cardPhotos = p.photos; cardPhotosPos = Array.isArray(p.photosPos) ? p.photosPos : [];
    cardPhotoIdx = 0; updateCardStoryBars();
    cardPhotos.slice(1, 4).forEach(preloadImage); // pré-carrega as próximas fotos do card
    return;
  }
  if (!p.pid || p.pid.startsWith('ID_GOOGLE_')) return;
  fetchAllPhotos(p.pid).then(urls => {
    if (!urls.length) return;
    cardPhotos = urls; cardPhotosPos = []; cardPhotoIdx = 0; updateCardStoryBars();
    urls.slice(1, 4).forEach(preloadImage); // pré-carrega as próximas fotos do card
  });
}

function setCardPhoto(i) {
  const bg = document.querySelector('.place-card[data-top="1"] .card-bg');
  if (!bg || !cardPhotos.length) return;
  bg.style.opacity = '0';
  setTimeout(() => {
    bg.style.backgroundImage = `url("${cardPhotos[i]}")`; bg.style.backgroundSize='cover';
    bg.style.backgroundPosition = cardPhotosPos[i] || 'center';
    bg.style.opacity='1';
    const fl = bg.querySelector('.photo-loading'); if (fl) fl.style.opacity='0';
  }, 150);
}

function updateCardStoryBars() {
  const bars = document.querySelector('.place-card[data-top="1"] .card-story-bars');
  if (!bars) return;
  if (cardPhotos.length <= 1) { bars.innerHTML=''; return; }
  bars.innerHTML='';
  for (let i=0; i<cardPhotos.length; i++) {
    const bar  = document.createElement('div'); bar.className='card-sbar';
    const fill = document.createElement('div');
    fill.className = 'card-sbar-fill' + (i<=cardPhotoIdx?' done':'');
    bar.appendChild(fill); bars.appendChild(bar);
  }
}

function cardPhotoNext() {
  if (!cardPhotos.length || cardPhotoIdx>=cardPhotos.length-1) return;
  cardPhotoIdx++; setCardPhoto(cardPhotoIdx); updateCardStoryBars();
}
function cardPhotoPrev() {
  if (!cardPhotos.length || cardPhotoIdx<=0) return;
  cardPhotoIdx--; setCardPhoto(cardPhotoIdx); updateCardStoryBars();
}

// ── Drag & swipe ───────────────────────────────────────────────────
function bindDrag(card) {
  activeCard = card;
  card.addEventListener('touchstart', onDragStart, {passive:true});
  card.addEventListener('mousedown',  onDragStart);
}

function onDragStart(e) {
  // Permite drag de qualquer área do card.
  // O click do bottom-tap só abre o perfil se não houve swipe (ver dragHappened).
  dragActive=true; dragLocked=false; dragCurX=0;
  const pt = e.touches ? e.touches[0] : e;
  dragStartX = pt.clientX; dragStartY = pt.clientY;
  if (activeCard) activeCard.style.transition='none';
}

function onDragMove(e) {
  if (!dragActive || !activeCard) return;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - dragStartX;
  const dy = pt.clientY - dragStartY;
  if (!dragLocked) {
    // Aguarda pelo menos 8px de movimento para determinar direção
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    // Cancela só se for claramente vertical (2× mais vertical que horizontal)
    if (Math.abs(dy) > Math.abs(dx) * 2) { dragActive=false; return; }
    dragLocked=true;
  }
  if (e.cancelable) e.preventDefault();
  dragCurX = dx;
  activeCard.style.transform = `translateX(${dx}px) rotate(${dx*0.05}deg)`;
  const ls = document.getElementById('likeStamp');
  const ns = document.getElementById('nopeStamp');
  if (!ls || !ns) return;
  const t  = Math.abs(dx)>20 ? Math.min((Math.abs(dx)-20)/70,1) : 0;
  if (dx>20)       { ls.style.opacity=t; ns.style.opacity=0; }
  else if (dx<-20) { ns.style.opacity=t; ls.style.opacity=0; }
  else             { ls.style.opacity=0; ns.style.opacity=0; }
}

function onDragEnd() {
  if (!dragActive||!activeCard) { dragActive=false; return; }
  dragActive=false;
  const ls = document.getElementById('likeStamp');
  const ns = document.getElementById('nopeStamp');
  if (ls) ls.style.opacity=0;
  if (ns) ns.style.opacity=0;

  // Threshold menor = swipe mais natural (≈85px num 390px)
  const threshold = window.innerWidth * 0.22;
  const card = activeCard;

  if (dragCurX > threshold) {
    dragHappened = true;
    if (!window.currentUser) {
      card.style.transition='transform .45s cubic-bezier(.34,1.4,.64,1)';
      card.style.transform='';
      dragCurX=0;
      setTimeout(() => { dragHappened=false; }, 400);
      window.showAuthModal && window.showAuthModal('like');
      return;
    }
    const p = place();
    animateOut(card,'right');
    promoteBackCards();
    doWantToday(p);
    setTimeout(() => { completeSwipe(p); dragHappened=false; }, 400);
  } else if (dragCurX < -threshold) {
    dragHappened = true;
    const p = place();
    animateOut(card,'left');
    promoteBackCards();
    doSkip(p);
    setTimeout(() => { completeSwipe(p); dragHappened=false; }, 400);
  } else {
    card.style.transition='transform .45s cubic-bezier(.34,1.4,.64,1)';
    card.style.transform='';
  }
  dragCurX=0;
}

function animateOut(card, dir) {
  const x   = dir==='right' ? '130%' : '-130%';
  const rot = dir==='right' ? '25deg' : '-25deg';
  card.style.transition='transform .38s cubic-bezier(.4,0,.2,1), opacity .35s';
  card.style.transform=`translateX(${x}) rotate(${rot})`;
  card.style.opacity='0';
}

// Enquanto o card do topo voa pra fora, as cartas de trás já sobem pro
// lugar delas (com transição) — em vez de ficarem paradas e só "pularem"
// pro lugar quando o renderCard recria tudo. Isso tira o atraso/snap.
function promoteBackCards() {
  const backs = [...document.querySelectorAll('.place-card')]
    .filter(c => c.dataset.top !== '1')
    .sort((a, b) => (parseInt(b.style.zIndex) || 0) - (parseInt(a.style.zIndex) || 0));
  backs.forEach((card, ni) => {
    card.style.transition = 'transform .36s cubic-bezier(.22,1,.36,1), opacity .36s ease';
    if (ni === 0) {
      // vira o novo topo
      card.style.transform = 'translateY(0px) rotate(0deg) scale(1)';
      card.style.opacity   = '1';
      card.style.zIndex    = 20;
    } else {
      const rot = ni === 1 ? 4 : -4;
      card.style.transform = `translateY(${-ni*4}px) rotate(${rot}deg) scale(${1-ni*0.035})`;
      card.style.opacity   = `${1 - ni*0.18}`;
      card.style.zIndex    = 10 - ni;
    }
  });
}

// Remove o card do baralho após o swipe (assim o baralho termina de verdade)
function completeSwipe(p) {
  filtered = filtered.filter(f => f.id !== p.id);
  if (idx >= filtered.length) idx = 0;
  renderCard(); renderProgress();
}

// ── Desfazer ───────────────────────────────────────────────────────
window.undoSwipe = undoLast;
function undoLast() {
  if (!lastAction) return;
  const { type, place: p } = lastAction;
  setLastAction(null);

  if (type === 'skip') {
    delete skipped[p.id];
    fsUnskip(p.id);
  } else if (type === 'want') {
    wantToday = wantToday.filter(w => w.id !== p.id);
    fsRemoveWantToday(p.id);
    fsRemoveLike(p.id);
    updateWantBadge();
  } else if (type === 'been') {
    delete beenThere[p.id];
    fsRemoveBeenThere(p.id);
  }

  // Devolve o card ao topo do baralho
  if (!filtered.find(f => f.id === p.id)) {
    filtered.splice(idx % (filtered.length || 1), 0, p);
  }
  renderCard(); renderProgress();
  showToast('Desfeito!');
}

document.addEventListener('touchmove', onDragMove, {passive:false});
document.addEventListener('mousemove', onDragMove);
document.addEventListener('touchend',  onDragEnd);
document.addEventListener('mouseup',   onDragEnd);

// ── Swipe buttons ──────────────────────────────────────────────────
window.swipe = (dir, fromBtn = false) => {
  if (!activeCard || !filtered.length) return;
  const p = place();
  if (dir === 'right') {
    if (!window.currentUser) {
      window.showAuthModal && window.showAuthModal('like');
      return;
    }
    doWantToday(p);
    pulseBtn(document.querySelector('.b-like .c'));
    if (fromBtn) showHeartBurst();
  }
  if (dir === 'left') {
    doSkip(p);
    if (fromBtn) pulseBtn(document.querySelector('.b-pass .c'));
  }
  animateOut(activeCard, dir);
  promoteBackCards();
  setTimeout(() => completeSwipe(p), 380);
};

window.savePlace = () => {
  if (!filtered.length) return;
  const p = place();
  const alreadySaved = !!saved.find(s => s.id === p.id);
  if (!alreadySaved) doSave(p);
  pulseBtn(document.querySelector('.b-save .c'));
  const st = document.getElementById('saveStamp');
  if (st) {
    st.style.opacity = '1';
    clearTimeout(st._to);
    st._to = setTimeout(() => { st.style.opacity = '0'; }, 900);
  }
  if (alreadySaved) {
    showToast('✓ Já está nos salvos');
  } else if (!localStorage.getItem('cwb_hint_save')) {
    localStorage.setItem('cwb_hint_save','1');
    showToast('Salvo para depois! Fica na aba "Salvos"', true);
  } else {
    showToast('Salvo para depois!');
  }
};

window.markBeenThere = () => {
  if (!window.currentUser) { window.showAuthModal && window.showAuthModal('like'); return; }
  if (!filtered.length) return;
  const p = place();
  doBeenThere(p);
  pulseBtn(document.querySelector('.b-been .c'));
  const bs = document.getElementById('beenStamp');
  if (bs) { bs.style.opacity='1'; setTimeout(()=>{ bs.style.opacity='0'; },600); }
  showToast('Marcado como visitado!');
  if (activeCard) animateOut(activeCard, 'left');
  setTimeout(() => completeSwipe(p), 380);
};

// "Já fui" a partir do perfil do lugar (o botão saiu dos cards)
window.markBeenThereProfile = () => {
  if (!window.currentUser) { window.showAuthModal && window.showAuthModal('like'); return; }
  const p = _profilePlace;
  if (!p || beenThere[p.id]) return;
  doBeenThere(p);
  const btn = document.getElementById('profileBeenBtn');
  if (btn) {
    btn.classList.add('done');
    btn.disabled = true;
    btn.innerHTML = `${ic('check', 17)} Você já foi aqui`;
  }
  showToast('Marcado como visitado!');
  // O lugar sai do baralho (o feed atrás do perfil já reflete isso)
  applyUserFilters(); renderCard(); renderProgress();
};

function doSave(p) {
  if (!saved.find(s=>s.id===p.id)) {
    saved.push(p);
    updateBadge();
    fsSave(p);
  }
}

function setLastAction(a) {
  lastAction = a;
  const btn = document.getElementById('undoBtn');
  if (btn) btn.classList.toggle('undo-available', !!a);
}

function doWantToday(p) {
  if (!wantToday.find(w=>w.id===p.id)) {
    wantToday.push(p);
    fsWantToday(p);
    fsIncrementLike(p.id);
    updateWantBadge();
  }
  setLastAction({ type:'want', place: p });
  // Explica só na primeira vez — depois o badge da aba já dá o feedback
  if (!localStorage.getItem('cwb_hint_want')) {
    localStorage.setItem('cwb_hint_want','1');
    showToast('Salvo no rolê de hoje — veja na aba "Quero ir"', true);
  }
}

function doSkip(p) {
  skipped[p.id] = true;
  fsSkip(p.id);
  setLastAction({ type:'skip', place: p });
  // Explica só na primeira vez
  if (!localStorage.getItem('cwb_hint_skip')) {
    localStorage.setItem('cwb_hint_skip','1');
    showToast('Pulado — esse lugar volta amanhã', true);
  }
}

function doBeenThere(p) {
  beenThere[p.id] = { visitedAt: new Date().toISOString(), ...p };
  fsBeenThere(p);
  setLastAction({ type:'been', place: p });
  // Concede XP e verifica badges por visita (badges só se a feature estiver on)
  awardXp('visited', { placeId: p.id, placeName: p.n, category: p.c, bairro: p.b });
  if (window.FEATURES?.badges) checkAndAwardBadges();
  // Marcar "Já fui" NÃO tira o card do baralho — ele continua aparecendo.
}

function updateBadge() {
  const b = document.getElementById('nbadge');
  if (!b) return;
  if (saved.length) { b.style.display='inline'; b.textContent=saved.length; }
  else b.style.display='none';
}

function updateWantBadge() {
  const b = document.getElementById('wantBadge');
  if (!b) return;
  if (wantToday.length) { b.style.display='inline'; b.textContent=wantToday.length; }
  else b.style.display='none';
}

// ── Animation helpers ──────────────────────────────────────────────
function showToast(msg, longer = false) {
  let t = document.getElementById('appToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'appToast';
    document.querySelector('.phone').appendChild(t);
  }
  t.textContent = msg;
  t.classList.remove('toast-in');
  void t.offsetWidth; // force reflow
  t.classList.add('toast-in');
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.remove('toast-in'), longer ? 2600 : 1500);
}
// Disponível para outros módulos (ex.: auth.js ao trocar a foto de perfil)
window.showToast = showToast;

// ── Dica de swipe (primeira visita) ────────────────────────────────
function maybeShowSwipeHint() {
  if (localStorage.getItem('cwb_hint_swipe')) return;
  if (!filtered.length) return;

  // Espera a tela de boas-vindas fechar antes de mostrar a dica
  const welcome = document.getElementById('welcomeScreen');
  if (welcome && welcome.style.display !== 'none') {
    window.addEventListener('welcomeClosed', () => maybeShowSwipeHint(), { once:true });
    return;
  }

  const stack = document.getElementById('cardStack');
  if (!stack) return;

  const hint = document.createElement('div');
  hint.className = 'swipe-hint';
  hint.innerHTML = `
    <div class="swipe-hint-label swipe-hint-nope">${ic('x', 13, 2.5)} Não hoje</div>
    <div class="swipe-hint-hand">${ic('move-horizontal', 52, 2)}</div>
    <div class="swipe-hint-label swipe-hint-like">Quero ir! ${ic('heart', 13, 2.5)}</div>
    <div class="swipe-hint-text">Deslize o card para os lados</div>`;
  stack.appendChild(hint);

  const dismiss = () => {
    localStorage.setItem('cwb_hint_swipe','1');
    hint.classList.add('swipe-hint-out');
    setTimeout(() => hint.remove(), 300);
    stack.removeEventListener('touchstart', dismiss);
    stack.removeEventListener('mousedown', dismiss);
  };
  stack.addEventListener('touchstart', dismiss, { once:false, passive:true });
  stack.addEventListener('mousedown', dismiss);
  setTimeout(dismiss, 7000);
}

function showHeartBurst() {
  const stack = document.getElementById('cardStack');
  if (!stack) return;
  const h = document.createElement('div');
  h.className = 'heart-burst';
  h.innerHTML = '<svg width="46" height="46" viewBox="0 0 24 24" fill="#ef4444" stroke="none" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  stack.appendChild(h);
  h.addEventListener('animationend', () => h.remove());
}

function pulseBtn(el) {
  if (!el) return;
  el.classList.remove('btn-pulse');
  void el.offsetWidth;
  el.classList.add('btn-pulse');
  el.addEventListener('animationend', () => el.classList.remove('btn-pulse'), { once: true });
}

// ── Remove favorite ────────────────────────────────────────────────
function removeFav(id) {
  saved = saved.filter(s => s.id !== id);
  updateBadge();
  fsRemove(id);
  // Re-render favorites view if active
  const view = document.getElementById('favoritesView');
  if (view && view.style.display !== 'none') {
    renderFavorites(saved, openProfile, removeFav);
  }
}

// ── Navigation tabs ────────────────────────────────────────────────
window.showTab = (t) => {
  const views = {
    discover:  document.getElementById('discoverView'),
    want:      document.getElementById('wantTodayView'),
    favorites: document.getElementById('favoritesView'),
    map:       document.getElementById('mapView'),
  };
  Object.entries(views).forEach(([k, el]) => {
    if (el) el.style.display = k === t ? 'flex' : 'none';
  });
  ['navDiscover','navWant','navFavorites','navMap','navQuiz'].forEach(id =>
    document.getElementById(id)?.classList.remove('on')
  );
  const navMap = { discover:'navDiscover2', want:'navWant', favorites:'navFavorites', map:'navMap' };
  document.getElementById(navMap[t])?.classList.add('on');

  if (t === 'want')      renderWantToday();
  if (t === 'favorites') renderFavorites(saved, openProfile, removeFav);
  if (t === 'map')       renderMapView();
};

// Toggle map/list inside favorites tab
window.onFavToggle = () => toggleFavView(saved, openProfile, removeFav);

// ── Favorites filter ───────────────────────────────────────────────
let favFilter = 'all';
window.setFavFilter = (f) => {
  favFilter = f;
  document.querySelectorAll('.fav-filter').forEach(b =>
    b.classList.toggle('on', b.dataset.filter === f)
  );
  let list = [...saved];
  let onRemove = removeFav;
  if (f === 'been') {
    // "Já fui" não precisa estar salvo — lista tudo que foi marcado como
    // visitado (o beenThere guarda o lugar inteiro), mais recente primeiro.
    list = Object.values(beenThere).sort((a,b) =>
      new Date(b.visitedAt || 0) - new Date(a.visitedAt || 0));
    onRemove = removeBeen;
  } else if (f === 'rated') {
    // Filtra os que têm _avgRating
    list = saved.filter(p => p._avgRating?.avg > 0 || P.find(x=>x.id===p.id)?._avgRating?.avg > 0);
  }
  renderFavorites(list, openProfile, onRemove);
};

// Remove um lugar da lista "Já fui" (desmarca o visitado)
function removeBeen(id) {
  delete beenThere[id];
  fsRemoveBeenThere(id);
  setFavFilter('been'); // re-renderiza a lista já filtrada
}

// ── Search ─────────────────────────────────────────────────────────
window.openSearchOverlay = () => openSearch(openProfile);

// ── Quiz "Me ajude a escolher" ─────────────────────────────────────
window.openQuizOverlay = () => openQuiz(openProfile);
// Helpers usados pelo quiz.js (salvar/checar/toast) reaproveitando o app
window.dmSavePlace = (p) => doSave(p);
window.dmIsSaved   = (id) => !!saved.find(s => s.id === id);
window.dmToast     = (msg, longer) => showToast(msg, longer);

// ── Profile screen ─────────────────────────────────────────────────
function priceHTML(p) {
  const count = p.length;
  return [1,2,3,4,5].map(i=>`<span class="${i<=count?'active':'inactive'}">$</span>`).join('');
}

window.openProfile = openProfile;

// ── Voltar (botão/gesto do celular) fecha telas sobrepostas ────────
// O app é single-page. Sem gerenciar o histórico, apertar "voltar" no
// celular não fecha o perfil/busca/sheets — tenta sair do app. Aqui
// cada tela aberta empurra um estado; o "voltar" dispara popstate e
// fecha a tela do topo. Fechar pelo X também passa por aqui.
const _overlayStack = []; // { id, closeFn, pushed }

window.registerOverlay = (id, closeFn) => {
  // Evita empilhar a mesma tela duas vezes
  if (_overlayStack.some(o => o.id === id)) return;
  let pushed = false;
  try { history.pushState({ dmOverlay: id }, ''); pushed = true; } catch (e) {}
  _overlayStack.push({ id, closeFn, pushed });
};

// Fecha a tela do topo "por vontade" (X, backdrop, Cancelar): volta no
// histórico; o popstate abaixo executa o fechamento de fato.
window.dismissOverlay = (id) => {
  const idx = _overlayStack.map(o => o.id).lastIndexOf(id);
  if (idx === -1) return;
  const entry = _overlayStack[idx];
  if (idx === _overlayStack.length - 1 && entry.pushed) {
    history.back(); // é o topo → deixa o popstate fechar
  } else {
    // não é o topo, ou sem estado no histórico: remove e fecha direto
    _overlayStack.splice(idx, 1);
    try { entry.closeFn(); } catch (e) {}
  }
};

window._overlayHas = (id) => _overlayStack.some(o => o.id === id);

window.addEventListener('popstate', () => {
  const top = _overlayStack.pop();
  if (top) { try { top.closeFn(); } catch (e) {} }
});

let _profilePlace = null;

async function openProfile(p) {
  window._currentProfilePlaceId = p.id;
  _profilePlace = p;
  profilePhotos=[]; profilePhotosPos=[]; profilePhotoIdx=0;
  const screen = document.getElementById('profileScreen');
  const wasOpen = screen.style.display === 'flex';
  screen.style.display='flex'; screen.classList.remove('closing');
  if (!wasOpen) window.registerOverlay('profile', doCloseProfile);

  document.getElementById('profileName').textContent = p.n;
  document.getElementById('profileCat').textContent  = p.c;
  document.getElementById('profilePrice').innerHTML  = priceHTML(p.p);
  document.getElementById('profilePhotoFallback').innerHTML = catIcon(p.c, 54, 1.5);
  document.getElementById('profilePhotoImg').style.backgroundImage='';
  document.getElementById('profilePhotoImg').style.opacity='1';

  const igHandle = p.ig.replace('@','');
  // Esconder o botão ig antigo — agora fica nas ações rápidas
  const igBtn = document.getElementById('profileIgBtn');
  if (igBtn) igBtn.style.display = 'none';

  // ── Ações rápidas ──────────────────────────────────────────────
  let qEl = document.getElementById('profileQActions');
  if (!qEl) {
    qEl = document.createElement('div');
    qEl.id = 'profileQActions';
    qEl.className = 'profile-qactions';
    const catRow = document.querySelector('.profile-cat-row');
    if (catRow) catRow.insertAdjacentElement('afterend', qEl);
  }
  const addrQ = encodeURIComponent(p.a + ', Curitiba, PR');
  const addrEscQ = p.a.replace(/'/g, "\\'");
  qEl.innerHTML = `
    <a class="pqa" href="https://www.google.com/maps/search/?api=1&query=${addrQ}" target="_blank" rel="noopener">
      <span class="pqa-icon">${ic('map', 18)}</span><span class="pqa-label">Google Maps</span>
    </a>
    <button class="pqa" onclick="window._pqaCopy('${addrEscQ}')">
      <span class="pqa-icon">${ic('copy', 18)}</span><span class="pqa-label">Copiar end.</span>
    </button>
    <a class="pqa" href="https://instagram.com/${igHandle}" target="_blank" rel="noopener">
      <span class="pqa-icon">${ic('instagram', 18)}</span><span class="pqa-label">Instagram</span>
    </a>`;
  window._pqaCopy = (addr) => {
    navigator.clipboard.writeText(addr + ', Curitiba, PR')
      .then(() => showToast('Endereço copiado!'));
  };

  // ── Ações (mesmo estilo dos cards): Já fui · Não hoje · Quero ir · Salvar ──
  let actEl = document.getElementById('profileActions');
  if (!actEl) {
    actEl = document.createElement('div');
    actEl.id = 'profileActions';
    actEl.className = 'profile-abtns';
    actEl.innerHTML = `
      <button class="abtn b-been" id="pab-been" onclick="window.profileBeen()">
        <div class="c"><svg width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
        <div class="lbl" id="pab-been-lbl">Já fui aqui</div>
      </button>
      <button class="abtn b-pass" id="pab-skip" onclick="window.profileSkip()">
        <div class="c"><svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></div>
        <div class="lbl">Não hoje</div>
      </button>
      <button class="abtn b-like" id="pab-want" onclick="window.profileWant()">
        <div class="c"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>
        <div class="lbl">Quero ir!</div>
      </button>
      <button class="abtn b-save" id="pab-save" onclick="window.profileSaveToggle()">
        <div class="c"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></div>
        <div class="lbl" id="pab-save-lbl">Salvar</div>
      </button>`;
    // Fica embaixo de tudo, depois dos cards de info (endereço/bairro/horário).
    const infoGrid = document.getElementById('profileInfoGrid');
    (infoGrid || qEl).insertAdjacentElement('afterend', actEl);
  }
  updateProfileActionStates(p);

  const addrEsc = p.a.replace(/'/g,"\\'");
  document.getElementById('profileInfoGrid').innerHTML=`
    <div class="info-card" style="cursor:pointer;" onclick="openAddrSheet('${addrEsc}')">
      <div class="info-card-icon">${ic('map-pin', 18)}</div>
      <div class="info-card-content">
        <div class="info-card-label">Endereço</div>
        <div class="info-card-value">${p.a}</div>
      </div>
      <button class="info-card-action" onclick="event.stopPropagation();openAddrSheet('${addrEsc}')">Ver opções</button>
    </div>
    <div class="info-card">
      <div class="info-card-icon">${ic('home', 18)}</div>
      <div class="info-card-content">
        <div class="info-card-label">Bairro</div>
        <div class="info-card-value">${p.b}</div>
      </div>
    </div>
    <div class="info-card">
      <div class="info-card-icon">${ic('clock', 18)}</div>
      <div class="info-card-content">
        <div class="info-card-label">Horário</div>
        <div class="info-card-value">${p.h}</div>
      </div>
    </div>`;

  if (window.FEATURES?.ratings  && typeof renderRatingBlock    === 'function') renderRatingBlock(p.id);
  if (window.FEATURES?.comments && typeof renderCommentsSection === 'function') renderCommentsSection(p.id);

  document.getElementById('storyBars').innerHTML='<div class="story-bar"><div class="story-bar-fill"></div></div>';

  if (Array.isArray(p.photos) && p.photos.length) {
    profilePhotos = p.photos; profilePhotosPos = Array.isArray(p.photosPos) ? p.photosPos : [];
    profilePhotoIdx = 0;
    updateProfileStoryBars(); setProfilePhoto(0);
  } else {
    fetchAllPhotos(p.pid).then(urls => {
      if (!urls.length) return;
      profilePhotos=urls; profilePhotosPos=[]; profilePhotoIdx=0;
      updateProfileStoryBars(); setProfilePhoto(0);
    });
  }

  document.getElementById('storyTapLeft').onclick  = storyPrev;
  document.getElementById('storyTapRight').onclick = storyNext;
  document.getElementById('profileClose').onclick  = () => window.dismissOverlay('profile');
}

// ── Ações do perfil (Já fui · Não hoje · Quero ir · Salvar) ────────
// Refletem o estado atual do lugar nos 4 botões e sincronizam o baralho.
function updateProfileActionStates(p) {
  const set = (id, on) => document.getElementById(id)?.classList.toggle('on', on);
  const been = !!beenThere[p.id];
  const save = !!saved.find(s => s.id === p.id);
  set('pab-been', been);
  set('pab-skip', !!skipped[p.id]);
  set('pab-want', !!wantToday.find(w => w.id === p.id));
  set('pab-save', save);
  const bl = document.getElementById('pab-been-lbl'); if (bl) bl.textContent = been ? 'Você já foi' : 'Já fui aqui';
  const sl = document.getElementById('pab-save-lbl'); if (sl) sl.textContent = save ? 'Salvo'       : 'Salvar';
}

function _requireLoginProfile() {
  if (!window.currentUser) { window.showAuthModal && window.showAuthModal('like'); return false; }
  return true;
}

// Refresca o baralho por baixo (skip/want/been mudam o que aparece lá)
function _syncDeckAfterProfileAction() {
  applyUserFilters(); renderCard(); renderProgress();
  const mapView = document.getElementById('mapView');
  if (mapView && mapView.style.display !== 'none') renderMapView();
}

window.profileBeen = () => {
  const p = _profilePlace; if (!p || !_requireLoginProfile()) return;
  if (!beenThere[p.id]) { doBeenThere(p); showToast('Marcado como visitado!'); }
  updateProfileActionStates(p);
  _syncDeckAfterProfileAction();
};

window.profileSkip = () => {
  const p = _profilePlace; if (!p || !_requireLoginProfile()) return;
  if (!skipped[p.id]) doSkip(p);
  // Pular e "quero ir" não convivem: remove do rolê de hoje se estava lá.
  if (wantToday.find(w => w.id === p.id)) {
    wantToday = wantToday.filter(w => w.id !== p.id);
    fsRemoveWantToday(p.id); fsRemoveLike(p.id); updateWantBadge();
  }
  showToast('Pulado — volta amanhã');
  _syncDeckAfterProfileAction();
  // "Não hoje" é um descarte: fecha o perfil (como o card saindo da tela).
  window.dismissOverlay('profile');
};

window.profileWant = () => {
  const p = _profilePlace; if (!p || !_requireLoginProfile()) return;
  if (!wantToday.find(w => w.id === p.id)) { doWantToday(p); updateWantBadge(); showToast('Salvo no rolê de hoje!'); }
  // Se estava pulado, libera pra poder entrar no rolê.
  if (skipped[p.id]) { delete skipped[p.id]; fsUnskip(p.id); }
  updateProfileActionStates(p);
  _syncDeckAfterProfileAction();
};

window.profileSaveToggle = () => {
  const p = _profilePlace; if (!p || !_requireLoginProfile()) return;
  if (saved.find(s => s.id === p.id)) { removeFav(p.id); showToast('Removido dos salvos'); }
  else { doSave(p); showToast('Salvo para depois!'); }
  updateProfileActionStates(p);
};

function setProfilePhoto(i) {
  if (!profilePhotos.length) return;
  const img = document.getElementById('profilePhotoImg');
  img.style.opacity='0';
  setTimeout(()=>{ img.style.backgroundImage=`url("${profilePhotos[i]}")`; img.style.backgroundPosition=profilePhotosPos[i]||'center'; img.style.opacity='1'; },100);
}

function updateProfileStoryBars() {
  const bars  = document.getElementById('storyBars');
  const total = Math.max(profilePhotos.length,1);
  bars.innerHTML='';
  for (let i=0; i<total; i++) {
    const bar  = document.createElement('div'); bar.className='story-bar';
    const fill = document.createElement('div');
    fill.className='story-bar-fill'+(i<profilePhotoIdx?' done':'');
    if (i===profilePhotoIdx) fill.style.width='100%';
    bar.appendChild(fill); bars.appendChild(bar);
  }
}

function storyNext() {
  if (!profilePhotos.length||profilePhotoIdx>=profilePhotos.length-1) return;
  profilePhotoIdx++; setProfilePhoto(profilePhotoIdx); updateProfileStoryBars();
}
function storyPrev() {
  if (!profilePhotos.length||profilePhotoIdx<=0) return;
  profilePhotoIdx--; setProfilePhoto(profilePhotoIdx); updateProfileStoryBars();
}

// Fecha o DOM do perfil (idempotente). Chamado só pelo popstate/dismiss.
function doCloseProfile() {
  const screen = document.getElementById('profileScreen');
  if (!screen || screen.style.display === 'none') return;
  screen.classList.add('closing');
  if (typeof unsubscribeComments==='function') unsubscribeComments();
  setTimeout(()=>{ screen.style.display='none'; screen.classList.remove('closing'); },300);
}
window.closeProfile = () => window.dismissOverlay('profile');

// ── Address sheet ──────────────────────────────────────────────────
window.openAddrSheet = (addr) => {
  document.getElementById('addrSheetTitle').textContent = addr;
  document.getElementById('addrBtnMaps').onclick = () => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr+', Curitiba, PR')}`,'_blank');
    window.closeAddrSheet();
  };
  document.getElementById('addrBtnCopy').onclick = () => {
    navigator.clipboard.writeText(addr+', Curitiba, PR').then(()=>{
      document.getElementById('addrBtnCopy').innerHTML=`<span class="addr-sheet-btn-icon">${ic('check', 16)}</span> Copiado!`;
      setTimeout(window.closeAddrSheet, 1000);
    });
  };
  document.getElementById('addrSheetBackdrop').style.display='flex';
  window.registerOverlay('addrSheet', doCloseAddrSheet);
};
function doCloseAddrSheet() {
  const bd = document.getElementById('addrSheetBackdrop');
  if (bd) bd.style.display='none';
}
window.closeAddrSheet = (e) => {
  if (e && e.target!==document.getElementById('addrSheetBackdrop')) return;
  window.dismissOverlay('addrSheet');
};

// ── City selector ──────────────────────────────────────────────────
let currentCity = 'Curitiba, PR';
window.openCitySheet  = () => {
  document.getElementById('citySheetBackdrop').style.display='flex';
  window.registerOverlay('citySheet', doCloseCitySheet);
};
function doCloseCitySheet() {
  const bd = document.getElementById('citySheetBackdrop');
  if (bd) bd.style.display='none';
}
window.closeCitySheet = (e) => {
  if (e && e.target!==document.getElementById('citySheetBackdrop')) return;
  window.dismissOverlay('citySheet');
};
window.selectCity = (city, id) => {
  currentCity = city;
  document.getElementById('cityLabel').textContent = city;
  document.querySelectorAll('.city-option').forEach(b => b.classList.toggle('active', b.id===id));
  window.dismissOverlay('citySheet');
};

// ── Welcome screen ─────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h<12) return `Bom dia ${ic('sun', 13)}`;
  if (h<18) return `Boa tarde ${ic('sun', 13)}`;
  return `Boa noite ${ic('moon', 13)}`;
}

function showWelcomeScreen() {
  if (sessionStorage.getItem('cwb_welcomed')) return;
  document.getElementById('welcomeGreeting').innerHTML = getGreeting();
  document.getElementById('welcomeScreen').style.display = 'flex';

  const availCats = CATS.filter(c => c !== 'Todos');
  const picked    = shuffle(availCats).slice(0,5);
  const container = document.getElementById('welcomeCats');
  container.innerHTML = picked.map(c => {
    const count = P.filter(p => {
      const cats = Array.isArray(p.cats) ? p.cats : (p.c ? [p.c] : []);
      return cats.includes(c);
    }).length;
    return `<div class="wcat-card" onclick="window.closeWelcome('${c.replace(/'/g,"\\'")}')">
      <div class="wcat-emoji">${catIcon(c, 26, 1.7)}</div>
      <div>
        <div class="wcat-name">${c}</div>
        <div class="wcat-count">${count} lugar${count!==1?'es':''}</div>
      </div>
      <div class="wcat-arrow">›</div>
    </div>`;
  }).join('');
}

window.closeWelcome = (category) => {
  sessionStorage.setItem('cwb_welcomed','1');
  const screen = document.getElementById('welcomeScreen');
  screen.style.transition='opacity .3s';
  screen.style.opacity='0';
  setTimeout(()=>{
    screen.style.display='none'; screen.style.opacity='';
    window.dispatchEvent(new Event('welcomeClosed'));
  },300);
  if (category) setCat(category);
};

// ── Want Today view ───────────────────────────────────────────────
function renderWantToday() {
  const view = document.getElementById('wantTodayView');
  if (!view) return;

  if (!window.currentUser) {
    view.innerHTML = `<div class="empty"><div class="empty-ico">${ic('heart', 40, 1.5)}</div>
      <div class="empty-title">Entre na sua conta</div>
      <div class="empty-sub">Faça login para ver os lugares que quer visitar hoje.</div>
      <button class="login-google-btn" style="margin-top:16px" onclick="showAuthModal()">Entrar</button></div>`;
    return;
  }

  if (!wantToday.length) {
    view.innerHTML = `<div class="want-header"><div class="want-title">Quero ir hoje ${ic('heart', 18, 2.2)}</div>
      <div class="want-sub">Zera à meia-noite</div></div>
      <div class="empty"><div class="empty-ico">${ic('heart', 40, 1.5)}</div>
      <div class="empty-title">Nenhum lugar ainda</div>
      <div class="empty-sub">Deslize para a direita nos cards<br>para adicionar lugares aqui.</div></div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'fav-grid';
  let html = `<div class="want-header"><div class="want-title">Quero ir hoje ${ic('heart', 18, 2.2)}</div>
    <div class="want-sub">${wantToday.length} lugar${wantToday.length>1?'es':''} · zera à meia-noite</div></div>`;
  view.innerHTML = html;
  view.appendChild(grid);

  wantToday.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'saved-row su';
    row.style.animationDelay = `${i * 40}ms`;
    row.onclick = () => openProfile(p);
    row.innerHTML = `
      <div class="saved-thumb bg-${p.bg}" id="wthumb-${p.id}">${catIcon(p.c, 22, 1.7)}</div>
      <div style="flex:1;min-width:0;">
        <div class="saved-name">${p.n}</div>
        <div class="saved-meta">${p.b} · ${p.h}</div>
      </div>
      <div class="saved-price">${p.p}</div>
      <button class="fav-remove-btn" title="Remover" onclick="event.stopPropagation();window._removeWant('${p.id}')">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>`;
    grid.appendChild(row);
    // Foto: usa a hospedada (p.photos) se houver; senão busca no Google pelo
    // pid — igual às abas Salvos e Busca. Sem esse fallback, lugares que só
    // têm pid (sem foto salva) caíam no ícone da categoria.
    if (Array.isArray(p.photos) && p.photos.length) {
      const t = document.getElementById(`wthumb-${p.id}`);
      if (t) { t.style.backgroundImage=`url("${p.photos[0]}")`; t.style.backgroundPosition=photoPos(p,0); t.innerHTML=''; }
    } else if (p.pid && !p.pid.startsWith('ID_GOOGLE_')) {
      fetchPlacePhoto(p.pid).then(url => {
        if (!url) return;
        const t = document.getElementById(`wthumb-${p.id}`);
        if (t) { t.style.backgroundImage=`url("${url}")`; t.innerHTML=''; }
      });
    }
  });

  window._removeWant = (id) => {
    wantToday = wantToday.filter(p => p.id !== id);
    fsRemoveWantToday(id);
    updateWantBadge();
    renderWantToday();
  };
}

// ── Map view (todos os lugares, filtrado pela categoria global) ────
// Estado dos lugares para colorir os pins do mapa
window._isWantToday = (id) => !!wantToday.find(w => w.id === id);
window._isSaved     = (id) => !!saved.find(s => s.id === id);

// Listas para o editor de perfil (interesses e bairro). Avaliadas na hora
// de abrir o editor, então já refletem os dados carregados do Firestore.
window._getCategories = () => CATS.filter(c => c !== 'Todos');
window._getBairros = () => [...new Set(P.map(p => p.b).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

// Re-embaralha o baralho aplicando os interesses atuais. Sem force, só
// age se a pessoa ainda não começou a deslizar (idx===0), pra não
// atrapalhar quem já está navegando. Com force (ex.: salvou o perfil),
// reinicia o baralho do topo de qualquer forma.
window._reshuffleDeck = (force) => {
  if (!P.length) return;
  if (!force && idx > 0) return;
  P = orderDeck(P);
  applyUserFilters();
  renderCard();
  renderProgress();
};

function renderMapView() {
  const view = document.getElementById('mapView');
  if (!view) return;

  if (!P.length) {
    view.innerHTML = `<div class="empty"><div class="empty-ico">${ic('map', 40, 1.5)}</div>
      <div class="empty-title">Mapa</div>
      <div class="empty-sub">Nenhum lugar cadastrado ainda.</div></div>`;
    return;
  }

  view.innerHTML = `
    <div class="map-legend">
      <span><i style="background:#1a73e8"></i>Você</span>
      <span><i style="background:#ef4444"></i>Quero ir</span>
      <span><i style="background:#f59e0b"></i>Salvos</span>
      <span><i style="background:#14140F"></i>Demais</span>
    </div>
    <div id="mainMap" style="flex:1;width:100%;min-height:0;"></div>`;

  let list = cat === 'Todos' ? [...P] : P.filter(p => {
    const cats = Array.isArray(p.cats) ? p.cats : (p.c ? [p.c] : []);
    return cats.includes(cat);
  });

  // Respeita o filtro "Abertos agora" também no mapa
  if (openNowOnly) list = list.filter(p => parseOpenNow(p.h) === true);

  const mapEl = document.getElementById('mainMap');
  if (openNowOnly && !list.length) {
    mapEl.innerHTML = `<div class="empty" style="height:100%"><div class="empty-ico">${ic('clock', 40, 1.5)}</div>
      <div class="empty-title">Nada aberto agora</div>
      <div class="empty-sub">Nenhum lugar aberto neste horário${cat !== 'Todos' ? '<br>nesta categoria' : ''}.</div></div>`;
    return;
  }

  renderFavMap(list, mapEl, openProfile);
}

// ── Badge unlock toast ────────────────────────────────────────────
window.addEventListener('badgeUnlocked', (e) => {
  if (!window.FEATURES?.badges) return; // badges ocultas: sem notificação
  const badge = e.detail;
  if (!badge) return;
  let toast = document.getElementById('badgeToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'badgeToast';
    toast.className = 'badge-toast';
    document.querySelector('.phone')?.appendChild(toast);
  }
  toast.innerHTML = `
    <div class="badge-toast-icon">${badge.icon}</div>
    <div class="badge-toast-text">
      <div class="badge-toast-title">Badge conquistada!</div>
      <div class="badge-toast-name">${badge.name}</div>
    </div>`;
  toast.classList.remove('badge-toast-in');
  void toast.offsetWidth;
  toast.classList.add('badge-toast-in');
  clearTimeout(toast._to);
  toast._to = setTimeout(() => toast.classList.remove('badge-toast-in'), 3500);
});

// ── Boot ───────────────────────────────────────────────────────────
if (typeof fsLoadPlaces === 'function') {
  init();
} else {
  window.addEventListener('firebase-ready', () => init(), { once: true });
}

// Recarrega dados quando o login é confirmado
window.addEventListener('authChanged', async (e) => {
  const user = e.detail;
  if (!user) return;
  const [allSaved, allWant, allSkipped, allBeen] = await Promise.all([
    fsLoadAll(), fsLoadWantToday(), fsLoadSkipped(), fsLoadBeenThere()
  ]);
  if (allSaved?.length)  { saved     = allSaved;    updateBadge(); }
  if (allWant?.length)   { wantToday = allWant;     updateWantBadge(); }
  skipped   = allSkipped || {};
  beenThere = allBeen    || {};
  applyUserFilters();
  renderCard();
  const favView  = document.getElementById('favoritesView');
  const wantView = document.getElementById('wantTodayView');
  if (favView  && favView.style.display  !== 'none') renderFavorites(saved, openProfile, removeFav);
  if (wantView && wantView.style.display !== 'none') renderWantToday();
});
