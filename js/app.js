// ── app.js ────────────────────────────────────────────────────────
import {
  fsLoadPlaces, fsLoadCategories,
  fsLoadAll, fsSave, fsRemove, fsIncrementLike,
  fsWantToday, fsLoadWantToday, fsRemoveWantToday,
  fsSkip, fsLoadSkipped,
  fsBeenThere, fsLoadBeenThere
} from './store.js';
import { fetchPlacePhoto, fetchAllPhotos } from './photos.js';
import { renderFavorites, toggleFavView } from './favorites.js';
import { initSearch, openSearch } from './search.js';
import { renderCommentsSection, unsubscribeComments } from './comments.js';
import { renderRatingBlock, loadRating } from './ratings.js';

// ── State ──────────────────────────────────────────────────────────
let P        = [];
let CATS     = ['Todos'];
let CE       = { Todos: '🗺️' };
let cat      = 'Todos';
let filtered = [];
let idx      = 0;
let saved    = [];      // favoritos permanentes
let wantToday = [];     // quero ir hoje
let skipped   = {};     // pulados hoje {id: true}
let beenThere = {};     // já fui {id: {visitedAt}}

let cardPhotos    = [];
let cardPhotoIdx  = 0;
let profilePhotos = [];
let profilePhotoIdx = 0;

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

function sortByLikesThenShuffle(places) {
  const sorted = [...places].sort((a,b)=>(b._likes||0)-(a._likes||0));
  const groups = [];
  let g = [];
  for (const p of sorted) {
    if (!g.length || g[0]._likes === p._likes) g.push(p);
    else { groups.push(g); g=[p]; }
  }
  if (g.length) groups.push(g);
  return groups.flatMap(grp => shuffle(grp));
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
  const stack = document.getElementById('cardStack');
  if (stack) stack.innerHTML = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:14px;color:var(--text3)">
      <div style="width:36px;height:36px;border:3px solid var(--bg4);
        border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite"></div>
      <span style="font-size:14px">Carregando lugares…</span>
    </div>`;

  const [cats, places] = await Promise.all([
    fsLoadCategories(), fsLoadPlaces()
  ]);

  if (cats.length) {
    CATS = ['Todos', ...cats.map(c => c.name)];
    CE   = { Todos: '🗺️' };
    cats.forEach(c => { CE[c.name] = c.emoji || ''; });
  }

  if (places.length) P = sortByLikesThenShuffle(places);

  filtered = [...P];
  initSearch(P);

  buildCategoryRow();
  renderCard();
  renderProgress();
  showWelcomeScreen();

  const [allSaved, allSkipped, allBeen] = await Promise.all([
    fsLoadAll(), fsLoadSkipped(), fsLoadBeenThere()
  ]);
  if (allSaved?.length) { saved = allSaved; updateBadge(); }
  skipped   = allSkipped || {};
  beenThere = allBeen    || {};

  // Filtra feed excluindo pulados hoje e já fui < 10 dias
  applyUserFilters();

  // Carrega médias de rating em background e atualiza cards
  loadAllRatings();
}

// ── Category row ───────────────────────────────────────────────────
function buildCategoryRow() {
  const row = document.getElementById('catsRow');
  row.innerHTML = '';
  CATS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'cat-pill' + (c === cat ? ' on' : '');
    b.innerHTML = `<span style="font-size:13px">${CE[c]||''}</span>${c}`;
    b.onclick = () => setCat(c);
    row.appendChild(b);
  });
}

export function setCat(c) {
  cat = c;
  document.querySelectorAll('.cat-pill').forEach((b,i) => b.classList.toggle('on', CATS[i]===c));
  applyUserFilters();
  idx=0; renderCard(); renderProgress();
}

function applyUserFilters() {
  const base = cat==='Todos' ? [...P] : P.filter(p => {
    const cats = Array.isArray(p.cats) ? p.cats : (p.c ? [p.c] : []);
    return cats.includes(cat);
  });
  filtered = base.filter(p => !skipped[p.id] && !beenThere[p.id]);
  idx = 0;
}

function place() { return filtered[idx % filtered.length]; }

// ── Progress dots ──────────────────────────────────────────────────
function renderProgress() {
  const row = document.getElementById('progressRow');
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
  if (!filtered.length) return;

  for (let i=Math.min(2,filtered.length-1); i>=0; i--) {
    const p = filtered[(idx+i)%filtered.length];
    const card = makeCard(p);
    if (i > 0) {
      card.style.transform = `translateY(${i*10}px) scale(${1-i*0.04})`;
      card.style.zIndex    = 10 - i;
      card.style.opacity   = 1 - i*0.2;
      card.style.pointerEvents = 'none';
    } else {
      card.style.zIndex = 20;
      card.dataset.top  = '1';
      bindDrag(card);
    }
    stack.appendChild(card);
  }

  const top = filtered[idx%filtered.length];
  if (Array.isArray(top.photos) && top.photos.length) {
    const bg = stack.querySelector('.place-card[data-top="1"] .card-bg');
    if (bg) { bg.style.backgroundImage=`url("${top.photos[0]}")`; bg.style.backgroundSize='cover'; }
  } else if (top.pid && !top.pid.startsWith('ID_GOOGLE_')) {
    fetchPlacePhoto(top.pid).then(url => {
      if (!url) return;
      const bg = stack.querySelector('.place-card[data-top="1"] .card-bg');
      if (bg) { bg.style.backgroundImage=`url("${url}")`; bg.style.backgroundSize='cover'; }
    });
  }
  initCardPhotos(top);
}

function makeCard(p) {
  const el = document.createElement('div');
  el.className = 'place-card su';

  const ratingHTML = p._avgRating?.avg > 0
    ? `<div class="card-rating">★ ${p._avgRating.avg.toFixed(1)}</div>`
    : '';

  el.innerHTML = `
    <div class="card-bg bg-${p.bg}"><div class="photo-loading">${p.e}</div></div>
    <div class="card-overlay"></div>
    <div class="card-glow"></div>
    <div class="card-top">
      <div class="cat-tag">${p.c}</div>
      <div class="price-tag">${p.p}</div>
    </div>
    <div class="card-story-bars" id="cardStoryBars"></div>
    <div class="card-photo-tap card-photo-tap-left"  id="cardTapLeft"></div>
    <div class="card-photo-tap card-photo-tap-right" id="cardTapRight"></div>
    <div class="card-bottom card-bottom-tap"
         onclick="event.stopPropagation();window._openProfileCurrent()">
      <div class="card-name-row">
        <div class="card-name">${p.n}</div>
        ${ratingHTML}
      </div>
      <div class="card-addr">📍 ${p.a}</div>
      <div class="card-meta">
        <span>${p.b}</span><div class="meta-sep"></div><span>🕐 ${p.h}</span>
      </div>
      <div class="card-footer">
        <div class="ig-chip"><span style="font-size:12px">📷</span>${p.ig}</div>
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
    let tsX = 0;
    el.addEventListener('touchstart', e => { tsX = e.touches[0].clientX; }, {passive:true});
    el.addEventListener('touchend',   e => {
      if (Math.abs(e.changedTouches[0].clientX - tsX) < 15) { e.stopPropagation(); fn(); }
    });
    el.addEventListener('click', e => { e.stopPropagation(); fn(); });
  };
  bindTap(document.getElementById('cardTapLeft'),  cardPhotoPrev);
  bindTap(document.getElementById('cardTapRight'), cardPhotoNext);

  if (Array.isArray(p.photos) && p.photos.length) {
    cardPhotos = p.photos; cardPhotoIdx = 0; updateCardStoryBars(); return;
  }
  if (!p.pid || p.pid.startsWith('ID_GOOGLE_')) return;
  fetchAllPhotos(p.pid).then(urls => {
    if (!urls.length) return;
    cardPhotos = urls; cardPhotoIdx = 0; updateCardStoryBars();
  });
}

function setCardPhoto(i) {
  const bg = document.querySelector('.place-card[data-top="1"] .card-bg');
  if (!bg || !cardPhotos.length) return;
  bg.style.opacity = '0';
  setTimeout(() => {
    bg.style.backgroundImage = `url("${cardPhotos[i]}")`; bg.style.backgroundSize='cover'; bg.style.opacity='1';
    const fl = bg.querySelector('.photo-loading'); if (fl) fl.style.opacity='0';
  }, 150);
}

function updateCardStoryBars() {
  const bars = document.getElementById('cardStoryBars');
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
  const t  = Math.abs(dx)>20 ? Math.min((Math.abs(dx)-20)/70,1) : 0;
  if (dx>20)       { ls.style.opacity=t; ns.style.opacity=0; }
  else if (dx<-20) { ns.style.opacity=t; ls.style.opacity=0; }
  else             { ls.style.opacity=0; ns.style.opacity=0; }
}

function onDragEnd() {
  if (!dragActive||!activeCard) { dragActive=false; return; }
  dragActive=false;
  document.getElementById('likeStamp').style.opacity=0;
  document.getElementById('nopeStamp').style.opacity=0;

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
    animateOut(card,'right');
    doWantToday(place());
    setTimeout(() => { nextCard(); dragHappened=false; }, 400);
  } else if (dragCurX < -threshold) {
    dragHappened = true;
    animateOut(card,'left');
    doSkip(place());
    setTimeout(() => { nextCard(); dragHappened=false; }, 400);
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

function nextCard() {
  idx = (idx+1) % filtered.length;
  renderCard(); renderProgress();
}

document.addEventListener('touchmove', onDragMove, {passive:false});
document.addEventListener('mousemove', onDragMove);
document.addEventListener('touchend',  onDragEnd);
document.addEventListener('mouseup',   onDragEnd);

// ── Swipe buttons ──────────────────────────────────────────────────
window.swipe = (dir, fromBtn = false) => {
  if (!activeCard) return;
  if (dir === 'right') {
    if (!window.currentUser) {
      window.showAuthModal && window.showAuthModal('like');
      return;
    }
    doWantToday(place());
    pulseBtn(document.querySelector('.b-like .c'));
    if (fromBtn) showHeartBurst();
  }
  if (dir === 'left') {
    doSkip(place());
    if (fromBtn) pulseBtn(document.querySelector('.b-pass .c'));
  }
  animateOut(activeCard, dir);
  setTimeout(nextCard, 380);
};

window.savePlace = () => {
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
  showToast(alreadySaved ? '✓ Já está nos favoritos' : '🔖 Adicionado aos favoritos!');
};

window.markBeenThere = () => {
  if (!window.currentUser) { window.showAuthModal && window.showAuthModal('like'); return; }
  const p = place();
  doBeenThere(p);
  pulseBtn(document.querySelector('.b-been .c'));
  const bs = document.getElementById('beenStamp');
  if (bs) { bs.style.opacity='1'; setTimeout(()=>{ bs.style.opacity='0'; },600); }
  showToast('📍 Marcado como visitado!');
  if (activeCard) animateOut(activeCard, 'left');
  setTimeout(nextCard, 380);
};

function doSave(p) {
  if (!saved.find(s=>s.id===p.id)) {
    saved.push(p);
    updateBadge();
    fsSave(p);
  }
}

function doWantToday(p) {
  if (!wantToday.find(w=>w.id===p.id)) {
    wantToday.push(p);
    fsWantToday(p);
    fsIncrementLike(p.id);
    updateWantBadge();
  }
}

function doSkip(p) {
  skipped[p.id] = true;
  fsSkip(p.id);
}

function doBeenThere(p) {
  beenThere[p.id] = { visitedAt: new Date().toISOString(), ...p };
  fsBeenThere(p);
  // Remove do feed imediatamente
  filtered = filtered.filter(f => f.id !== p.id);
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
function showToast(msg) {
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
  t._to = setTimeout(() => t.classList.remove('toast-in'), 1800);
}

function showHeartBurst() {
  const stack = document.getElementById('cardStack');
  if (!stack) return;
  const h = document.createElement('div');
  h.className = 'heart-burst';
  h.textContent = '❤️';
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
  ['navDiscover','navWant','navFavorites','navMap','navSearch'].forEach(id =>
    document.getElementById(id)?.classList.remove('on')
  );
  const navMap = { discover:'navDiscover2', want:'navWant', favorites:'navFavorites', map:'navMap', search:'navSearch' };
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
  if (f === 'been') {
    const beenIds = Object.keys(beenThere);
    list = saved.filter(p => beenIds.includes(p.id));
  } else if (f === 'rated') {
    // Filtra os que têm _avgRating
    list = saved.filter(p => p._avgRating?.avg > 0 || P.find(x=>x.id===p.id)?._avgRating?.avg > 0);
  }
  renderFavorites(list, openProfile, removeFav);
};

// ── Search ─────────────────────────────────────────────────────────
window.openSearchOverlay = () => openSearch(openProfile);

// ── Profile screen ─────────────────────────────────────────────────
function priceHTML(p) {
  const count = p.length;
  return [1,2,3,4,5].map(i=>`<span class="${i<=count?'active':'inactive'}">$</span>`).join('');
}

window.openProfile = openProfile;

async function openProfile(p) {
  window._currentProfilePlaceId = p.id;
  profilePhotos=[]; profilePhotoIdx=0;
  const screen = document.getElementById('profileScreen');
  screen.style.display='flex'; screen.classList.remove('closing');

  document.getElementById('profileName').textContent = p.n;
  document.getElementById('profileCat').textContent  = p.c;
  document.getElementById('profilePrice').innerHTML  = priceHTML(p.p);
  document.getElementById('profilePhotoFallback').textContent = p.e;
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
      <span class="pqa-icon">🗺️</span><span class="pqa-label">Google Maps</span>
    </a>
    <button class="pqa" onclick="window._pqaCopy('${addrEscQ}')">
      <span class="pqa-icon">📋</span><span class="pqa-label">Copiar end.</span>
    </button>
    <a class="pqa" href="https://instagram.com/${igHandle}" target="_blank" rel="noopener">
      <span class="pqa-icon">📸</span><span class="pqa-label">Instagram</span>
    </a>`;
  window._pqaCopy = (addr) => {
    navigator.clipboard.writeText(addr + ', Curitiba, PR')
      .then(() => showToast('📋 Endereço copiado!'));
  };

  const addrEsc = p.a.replace(/'/g,"\\'");
  document.getElementById('profileInfoGrid').innerHTML=`
    <div class="info-card" style="cursor:pointer;" onclick="openAddrSheet('${addrEsc}')">
      <div class="info-card-icon">📍</div>
      <div class="info-card-content">
        <div class="info-card-label">Endereço</div>
        <div class="info-card-value">${p.a}</div>
      </div>
      <button class="info-card-action" onclick="event.stopPropagation();openAddrSheet('${addrEsc}')">Ver opções</button>
    </div>
    <div class="info-card">
      <div class="info-card-icon">🏘️</div>
      <div class="info-card-content">
        <div class="info-card-label">Bairro</div>
        <div class="info-card-value">${p.b}</div>
      </div>
    </div>
    <div class="info-card">
      <div class="info-card-icon">🕐</div>
      <div class="info-card-content">
        <div class="info-card-label">Horário</div>
        <div class="info-card-value">${p.h}</div>
      </div>
    </div>`;

  if (typeof renderRatingBlock === 'function') renderRatingBlock(p.id);
  if (typeof renderCommentsSection === 'function') renderCommentsSection(p.id);

  document.getElementById('storyBars').innerHTML='<div class="story-bar"><div class="story-bar-fill"></div></div>';

  if (Array.isArray(p.photos) && p.photos.length) {
    profilePhotos = p.photos; profilePhotoIdx = 0;
    updateProfileStoryBars(); setProfilePhoto(0);
  } else {
    fetchAllPhotos(p.pid).then(urls => {
      if (!urls.length) return;
      profilePhotos=urls; profilePhotoIdx=0;
      updateProfileStoryBars(); setProfilePhoto(0);
    });
  }

  document.getElementById('storyTapLeft').onclick  = storyPrev;
  document.getElementById('storyTapRight').onclick = storyNext;
  document.getElementById('profileClose').onclick  = closeProfile;
}

function setProfilePhoto(i) {
  if (!profilePhotos.length) return;
  const img = document.getElementById('profilePhotoImg');
  img.style.opacity='0';
  setTimeout(()=>{ img.style.backgroundImage=`url("${profilePhotos[i]}")`; img.style.opacity='1'; },100);
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

function closeProfile() {
  const screen = document.getElementById('profileScreen');
  screen.classList.add('closing');
  if (typeof unsubscribeComments==='function') unsubscribeComments();
  setTimeout(()=>{ screen.style.display='none'; },300);
}

// ── Address sheet ──────────────────────────────────────────────────
window.openAddrSheet = (addr) => {
  document.getElementById('addrSheetTitle').textContent = addr;
  document.getElementById('addrBtnMaps').onclick = () => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr+', Curitiba, PR')}`,'_blank');
    window.closeAddrSheet();
  };
  document.getElementById('addrBtnCopy').onclick = () => {
    navigator.clipboard.writeText(addr+', Curitiba, PR').then(()=>{
      document.getElementById('addrBtnCopy').innerHTML='<span class="addr-sheet-btn-icon">✅</span> Copiado!';
      setTimeout(window.closeAddrSheet, 1000);
    });
  };
  document.getElementById('addrSheetBackdrop').style.display='flex';
};
window.closeAddrSheet = (e) => {
  if (e && e.target!==document.getElementById('addrSheetBackdrop')) return;
  document.getElementById('addrSheetBackdrop').style.display='none';
};

// ── City selector ──────────────────────────────────────────────────
let currentCity = 'Curitiba, PR';
window.openCitySheet  = () => document.getElementById('citySheetBackdrop').style.display='flex';
window.closeCitySheet = (e) => {
  if (e && e.target!==document.getElementById('citySheetBackdrop')) return;
  document.getElementById('citySheetBackdrop').style.display='none';
};
window.selectCity = (city, id) => {
  currentCity = city;
  document.getElementById('cityLabel').textContent = city;
  document.querySelectorAll('.city-option').forEach(b => b.classList.toggle('active', b.id===id));
  document.getElementById('citySheetBackdrop').style.display='none';
};

// ── Welcome screen ─────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h<12) return 'Bom dia ☀️';
  if (h<18) return 'Boa tarde 🌤️';
  return 'Boa noite ✨';
}

function showWelcomeScreen() {
  if (sessionStorage.getItem('cwb_welcomed')) return;
  document.getElementById('welcomeGreeting').textContent = getGreeting();
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
      <div class="wcat-emoji">${CE[c]||'📍'}</div>
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
  setTimeout(()=>{ screen.style.display='none'; screen.style.opacity=''; },300);
  if (category) setCat(category);
};

// ── Want Today view ───────────────────────────────────────────────
function renderWantToday() {
  const view = document.getElementById('wantTodayView');
  if (!view) return;

  if (!window.currentUser) {
    view.innerHTML = `<div class="empty"><div class="empty-ico">❤️</div>
      <div class="empty-title">Entre na sua conta</div>
      <div class="empty-sub">Faça login para ver os lugares que quer visitar hoje.</div>
      <button class="login-google-btn" style="margin-top:16px" onclick="showAuthModal()">Entrar</button></div>`;
    return;
  }

  if (!wantToday.length) {
    view.innerHTML = `<div class="want-header"><div class="want-title">Quero ir hoje ❤️</div>
      <div class="want-sub">Zera à meia-noite</div></div>
      <div class="empty"><div class="empty-ico">❤️</div>
      <div class="empty-title">Nenhum lugar ainda</div>
      <div class="empty-sub">Deslize para a direita nos cards<br>para adicionar lugares aqui.</div></div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'fav-grid';
  let html = `<div class="want-header"><div class="want-title">Quero ir hoje ❤️</div>
    <div class="want-sub">${wantToday.length} lugar${wantToday.length>1?'es':''} · zera à meia-noite</div></div>`;
  view.innerHTML = html;
  view.appendChild(grid);

  wantToday.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'saved-row su';
    row.style.animationDelay = `${i * 40}ms`;
    row.onclick = () => openProfile(p);
    row.innerHTML = `
      <div class="saved-thumb bg-${p.bg}" id="wthumb-${p.id}">${p.e}</div>
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
    if (Array.isArray(p.photos) && p.photos.length) {
      const t = document.getElementById(`wthumb-${p.id}`);
      if (t) { t.style.backgroundImage=`url("${p.photos[0]}")`; t.textContent=''; }
    }
  });

  window._removeWant = (id) => {
    wantToday = wantToday.filter(p => p.id !== id);
    fsRemoveWantToday(id);
    updateWantBadge();
    renderWantToday();
  };
}

// ── Map view (placeholder — abre busca por enquanto) ───────────────
function renderMapView() {
  const view = document.getElementById('mapView');
  if (!view) return;
  // Reutiliza o mapa de favoritos se tiver lugares salvos
  if (saved.length) {
    view.innerHTML = '';
    const favMap = document.createElement('div');
    favMap.id = 'mainMap';
    favMap.style.cssText = 'flex:1;width:100%;min-height:0;';
    view.appendChild(favMap);
    // Importa e usa o mapa de favoritos
    import('./favorites.js').then(({ renderFavMap }) => {
      if (renderFavMap) renderFavMap(saved, favMap, openProfile);
    }).catch(() => {
      view.innerHTML = `<div class="empty"><div class="empty-ico">🗺️</div>
        <div class="empty-title">Mapa</div>
        <div class="empty-sub">Salve lugares para vê-los no mapa.</div></div>`;
    });
  } else {
    view.innerHTML = `<div class="empty"><div class="empty-ico">🗺️</div>
      <div class="empty-title">Mapa</div>
      <div class="empty-sub">Salve lugares para vê-los no mapa.</div></div>`;
  }
}

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
