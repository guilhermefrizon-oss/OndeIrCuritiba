// ── search.js ─────────────────────────────────────────────────────
import { fetchPlacePhoto } from './photos.js';
import { ic, catIcon } from './icons.js';

let searchOpen = false;
let allPlaces  = [];

export function initSearch(placesRef) {
  allPlaces = placesRef;
}

export function openSearch(onOpenProfile) {
  searchOpen = true;
  let overlay = document.getElementById('searchOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'searchOverlay';
    overlay.className = 'search-overlay';
    overlay.innerHTML = `
      <div class="search-top">
        <div class="search-input-wrap">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
               viewBox="0 0 24 24" style="flex-shrink:0;opacity:.45">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input id="searchInput" class="search-input"
            placeholder="Buscar lugar…" autocomplete="off" autocorrect="off" spellcheck="false">
        </div>
        <button class="search-cancel-btn" id="searchCancelBtn">Cancelar</button>
      </div>
      <div class="search-filters" id="searchFilters"></div>
      <div class="search-results" id="searchResults">
        <div class="search-hint">
          <span style="opacity:.5">${ic('search', 34, 1.5)}</span>
          <span>Digite para buscar lugares</span>
        </div>
      </div>`;
    document.querySelector('.phone').appendChild(overlay);

    document.getElementById('searchCancelBtn').onclick = closeSearch;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSearch(); });
  }

  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('open'));

  const input = document.getElementById('searchInput');
  input.focus();
  input.value = '';
  renderFilters(onOpenProfile);

  let debounce;
  input.oninput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(input.value, onOpenProfile), 180);
  };
}

function closeSearch() {
  searchOpen = false;
  const overlay = document.getElementById('searchOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 280);
}

// ── Neighborhood filter chips ──────────────────────────────────────
let activeNeighborhood = null;

function renderFilters(onOpenProfile) {
  const container = document.getElementById('searchFilters');
  if (!container) return;

  const neighborhoods = [...new Set(allPlaces.map(p => p.b).filter(Boolean))].sort();
  if (!neighborhoods.length) { container.style.display = 'none'; return; }

  container.style.display = 'flex';
  container.innerHTML = neighborhoods.map(n =>
    `<button class="search-filter-chip${activeNeighborhood===n?' on':''}"
       onclick="window._setNeighborhood('${n.replace(/'/g,"\\'")}')">${n}</button>`
  ).join('');

  window._setNeighborhood = (n) => {
    activeNeighborhood = activeNeighborhood === n ? null : n;
    renderFilters(onOpenProfile);
    const input = document.getElementById('searchInput');
    runSearch(input?.value || '', onOpenProfile);
  };
}

// ── Search logic ───────────────────────────────────────────────────
function runSearch(query, onOpenProfile) {
  const results = document.getElementById('searchResults');
  if (!results) return;

  const q = query.toLowerCase().trim();

  let filtered = allPlaces;
  if (activeNeighborhood) filtered = filtered.filter(p => p.b === activeNeighborhood);

  if (q) {
    filtered = filtered.filter(p =>
      p.n?.toLowerCase().includes(q) ||
      p.b?.toLowerCase().includes(q) ||
      p.c?.toLowerCase().includes(q) ||
      p.a?.toLowerCase().includes(q)
    );
  } else if (!activeNeighborhood) {
    results.innerHTML = `
      <div class="search-hint">
        <span style="opacity:.5">${ic('search', 34, 1.5)}</span>
        <span>Digite para buscar lugares</span>
      </div>`;
    return;
  }

  if (!filtered.length) {
    results.innerHTML = `
      <div class="search-hint">
        <span style="opacity:.5">${ic('frown', 34, 1.5)}</span>
        <span>Nenhum resultado encontrado</span>
      </div>`;
    return;
  }

  results.innerHTML = '';

  // Group results by neighborhood if no text query
  if (!q && activeNeighborhood) {
    renderResultGroup(activeNeighborhood, filtered, results, onOpenProfile);
    return;
  }

  // Group by neighborhood for text results
  const groups = {};
  filtered.forEach(p => {
    const bairro = p.b || 'Outros';
    if (!groups[bairro]) groups[bairro] = [];
    groups[bairro].push(p);
  });

  // Sort groups: most results first
  Object.entries(groups)
    .sort((a,b) => b[1].length - a[1].length)
    .forEach(([bairro, places]) => {
      renderResultGroup(bairro, places, results, onOpenProfile);
    });
}

function renderResultGroup(label, places, container, onOpenProfile) {
  const header = document.createElement('div');
  header.className = 'search-group-header';
  header.textContent = label;
  container.appendChild(header);

  places.forEach(p => {
    const row = document.createElement('div');
    row.className = 'search-result-row';
    row.onclick = () => { closeSearch(); onOpenProfile(p); };
    row.innerHTML = `
      <div class="search-result-thumb bg-${p.bg}" id="sthumb-${p.id}">${catIcon(p.c, 20, 1.7)}</div>
      <div style="flex:1;min-width:0;">
        <div class="search-result-name">${p.n}</div>
        <div class="search-result-meta">${p.c} · ${p.b}</div>
      </div>
      <div class="search-result-price">${p.p}</div>`;
    container.appendChild(row);

    // Foto: a hospedada por nós (/fotos) primeiro; Google só como fallback.
    if (Array.isArray(p.photos) && p.photos.length) {
      const t = document.getElementById(`sthumb-${p.id}`);
      if (t) { t.style.backgroundImage = `url("${p.photos[0]}")`; t.innerHTML = ''; }
    } else if (p.pid && !p.pid.startsWith('ID_GOOGLE_')) {
      fetchPlacePhoto(p.pid).then(url => {
        if (!url) return;
        const t = document.getElementById(`sthumb-${p.id}`);
        if (t) { t.style.backgroundImage = `url("${url}")`; t.innerHTML = ''; }
      });
    }
  });
}

window.closeSearch = closeSearch;
