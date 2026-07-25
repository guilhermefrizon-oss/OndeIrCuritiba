// ── favorites.js ──────────────────────────────────────────────────
import { fetchPlacePhoto } from './photos.js';
import { ic, catIcon, catIconName, iconPath } from './icons.js';
import { fsRemove } from './store.js';
import { todayHoursText, isOpenNow } from './hours.js';

const GOOGLE_API_KEY = 'AIzaSyDIiBLGHZ_zgo-wKaHNK7qa4O-C_EZJJuY';

// ── Marcadores com ícone + nome e agrupamento (clustering) ─────────
// A partir deste zoom os nomes dos lugares aparecem embaixo do pin.
// Abaixo dele (mais afastado) mostramos só o círculo com o ícone — e
// os pins próximos ficam agrupados em clusters.
const LABEL_ZOOM   = 16;
const CLUSTER_COLOR = '#F26522'; // laranja dos clusters (igual à referência)

function _escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Cor do pin conforme o estado do lugar (Quero ir / Salvo / normal).
function _pinColor(p) {
  const isWant  = !!window._isWantToday?.(p.id);
  const isSaved = !!window._isSaved?.(p.id);
  return isWant ? '#ef4444' : isSaved ? '#f59e0b' : '#14140F';
}

// Ícone (google.maps) de um lugar: círculo branco com o ícone da
// categoria e, quando `labeled`, o nome do lugar embaixo.
function placePinIcon(p, labeled) {
  if (!window.google?.maps) return null;
  const color = _pinColor(p);
  const path  = iconPath(catIconName(p.c));

  const pad = 6, D = 38, R = 19, ICON = 20, isc = ICON / 24;
  const fs = 13, gap = 5;

  let name = (p.n || '').trim();
  if (name.length > 24) name = name.slice(0, 23) + '…';

  const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
  const txtFill   = isDark ? '#F2F2ED' : '#14140F';
  const txtStroke = isDark ? 'rgba(11,11,9,.85)' : '#FFFFFF';

  const textW = labeled ? Math.ceil(name.length * (fs * 0.62)) + 10 : 0;
  const W  = Math.max(D + pad * 2, textW);
  const CX = W / 2;
  const CY = pad + R;
  const H  = labeled ? (pad + D + gap + fs + 4) : (pad + D + pad);
  const iconX = CX - ICON / 2, iconY = CY - ICON / 2;

  const label = labeled
    ? `<text x="${CX}" y="${pad + D + gap + fs - 2}" text-anchor="middle" ` +
      `font-family="Manrope,-apple-system,'Segoe UI',Roboto,Arial,sans-serif" ` +
      `font-size="${fs}" font-weight="700" fill="${txtFill}" stroke="${txtStroke}" ` +
      `stroke-width="3" paint-order="stroke" style="stroke-linejoin:round">${_escXml(name)}</text>`
    : '';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><filter id="sh" x="-50%" y="-50%" width="200%" height="200%">` +
    `<feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.28)"/></filter></defs>` +
    `<circle cx="${CX}" cy="${CY}" r="${R}" fill="#fff" stroke="#EDECE7" stroke-width="1" filter="url(#sh)"/>` +
    `<g transform="translate(${iconX},${iconY}) scale(${isc})" fill="none" stroke="${color}" ` +
    `stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${path}</g>` +
    label +
    `</svg>`;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new window.google.maps.Size(W, H),
    anchor: new window.google.maps.Point(CX, CY),
  };
}

// Renderer dos clusters: círculo laranja com a contagem no centro.
function makeClusterRenderer() {
  return {
    render: ({ count, position }) => {
      const size = count < 10 ? 40 : count < 50 ? 48 : count < 100 ? 56 : 64;
      const r = size / 2;
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
        `<circle cx="${r}" cy="${r}" r="${r - 2}" fill="${CLUSTER_COLOR}" ` +
        `stroke="#fff" stroke-width="3"/></svg>`;
      return new window.google.maps.Marker({
        position,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
          scaledSize: new window.google.maps.Size(size, size),
          anchor: new window.google.maps.Point(r, r),
        },
        label: {
          text: String(count), color: '#fff',
          fontSize: '13px', fontWeight: '800',
          fontFamily: 'Manrope,-apple-system,Arial,sans-serif',
        },
        zIndex: 1000 + count,
      });
    },
  };
}

// Carrega a lib de clustering (uma vez). Retorna a classe MarkerClusterer.
let _clustererLib = null;
function loadClusterer() {
  if (_clustererLib) return Promise.resolve(_clustererLib);
  return import('https://cdn.jsdelivr.net/npm/@googlemaps/markerclusterer@2/+esm')
    .then(mod => { _clustererLib = mod; return mod; })
    .catch(() => null); // sem clustering se o CDN falhar — mapa segue funcionando
}

let mapInstance   = null;
let mapMarkers    = [];
let mapInitialized = false;
let favMapCluster = null; // MarkerClusterer do mapa de favoritos
let favMapLabeled = null; // estado atual dos rótulos no mapa de favoritos
let favViewMode   = 'list'; // 'list' | 'map'

// ── Render entry point ─────────────────────────────────────────────
export function renderFavorites(saved, onOpenProfile, onRemove) {
  const view = document.getElementById('favoritesView');
  const grid = document.getElementById('favGrid');
  const mapEl = document.getElementById('favMap');
  const subtitle = document.getElementById('favSubtitle');

  if (!view) return;

  if (!saved.length) {
    document.getElementById('favEmpty').style.display = 'flex';
    grid.style.display = 'none';
    if (mapEl) mapEl.style.display = 'none';
    subtitle.textContent = 'Nenhum lugar favoritado';
    document.getElementById('favToggle').style.display = 'none';
    return;
  }

  document.getElementById('favEmpty').style.display = 'none';
  document.getElementById('favToggle').style.display = 'flex';
  subtitle.textContent = `${saved.length} lugar${saved.length > 1 ? 'es' : ''} favoritado${saved.length > 1 ? 's' : ''}`;

  if (favViewMode === 'map') {
    grid.style.display = 'none';
    if (mapEl) { mapEl.style.display = 'block'; initMap(saved); }
  } else {
    grid.style.display = 'flex';
    if (mapEl) mapEl.style.display = 'none';
    renderList(saved, grid, onOpenProfile, onRemove);
  }
}

// ── List view (grouped by category) ───────────────────────────────
function renderList(saved, grid, onOpenProfile, onRemove) {
  grid.innerHTML = '';
  let animIdx = 0;

  // Group by category
  const groups = {};
  saved.forEach(p => {
    const cat = p.c || 'Outros';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  });

  Object.entries(groups).forEach(([cat, places]) => {
    // Category header
    const header = document.createElement('div');
    header.className = 'fav-cat-header';
    // Use emoji from first place in group as category indicator
    header.innerHTML = `<span class="fav-cat-emoji">${catIcon(cat, 15)}</span>${cat}<span class="fav-cat-count">${places.length}</span>`;
    grid.appendChild(header);

    places.forEach(p => {
      const row = document.createElement('div');
      row.className = 'saved-row su';
      row.style.animationDelay = `${animIdx * 40}ms`;
      animIdx++;
      row.onclick = () => onOpenProfile(p);

      row.innerHTML = `
        <div class="saved-thumb bg-${p.bg}" id="fthumb-${p.id}">${catIcon(p.c, 22, 1.7)}</div>
        <div style="flex:1;min-width:0;">
          <div class="saved-name">${p.n}</div>
          <div class="saved-meta">${p.b} · ${todayHoursText(p)}${isOpenNow(p) ? ' <span class="open-dot" title="Aberto agora"></span>' : ''}</div>
        </div>
        <div class="saved-price">${p.p}</div>
        <button class="fav-remove-btn" title="Remover" onclick="event.stopPropagation();window._removeFav('${p.id}')">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>`;
      grid.appendChild(row);

      // Foto: a HOSPEDADA por nós (/fotos) vem primeiro. Antes tentava o
      // Google antes e, como a busca paga está desligada, o thumb ficava
      // cinza mesmo com o lugar tendo foto local.
      if (Array.isArray(p.photos) && p.photos.length) {
        const t = document.getElementById(`fthumb-${p.id}`);
        if (t) { t.style.backgroundImage = `url("${p.photos[0]}")`; t.innerHTML = ''; }
      } else if (p.pid && !p.pid.startsWith('ID_GOOGLE_')) {
        fetchPlacePhoto(p.pid).then(url => {
          if (!url) return;
          const t = document.getElementById(`fthumb-${p.id}`);
          if (t) { t.style.backgroundImage = `url("${url}")`; t.innerHTML = ''; }
        });
      }
    });
  });

  // Remove handler exposed globally (needed for inline onclick)
  window._removeFav = (id) => {
    onRemove(id);
  };
}

// ── Map view ───────────────────────────────────────────────────────
function initMap(saved) {
  const mapEl = document.getElementById('favMap');
  if (!mapEl) return;

  // Clear old markers from previous renders
  mapMarkers.forEach(m => m.setMap(null));
  mapMarkers = [];

  if (!mapInitialized) {
    // Load Google Maps JS API dynamically if not loaded yet
    if (!window.google?.maps) {
      if (!document.getElementById('gmapsScript')) {
        const s = document.createElement('script');
        s.id  = 'gmapsScript';
        s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&callback=_initGoogleMap`;
        s.async = true;
        document.head.appendChild(s);
        window._initGoogleMap = () => { mapInitialized = true; buildMap(saved); };
      }
      return;
    }
    mapInitialized = true;
  }

  buildMap(saved);
}

function buildMap(saved) {
  const mapEl = document.getElementById('favMap');
  if (!mapEl || !window.google?.maps) return;

  const center = { lat: -25.4284, lng: -49.2733 }; // Curitiba

  if (!mapInstance) {
    mapInstance = new window.google.maps.Map(mapEl, {
      center,
      zoom: 13,
      styles: getMapStyle(),
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    // Ao dar zoom, alterna entre "só ícone" e "ícone + nome" nos pins.
    mapInstance.addListener('zoom_changed', () => { applyFavLabelState(); });
  } else {
    mapInstance.setCenter(center);
  }

  // Limpa o cluster anterior antes de replotar (os marcadores antigos já
  // foram removidos do mapa em initMap).
  if (favMapCluster) favMapCluster.clearMarkers();
  favMapLabeled = (mapInstance.getZoom() || 13) >= LABEL_ZOOM;

  // Geocode and place markers for each favorite
  // Use Places API for places that have a placeId
  const bounds = new window.google.maps.LatLngBounds();
  let boundsExtended = false;

  loadClusterer().then(lib => {
    if (!mapInstance) return;
    if (lib?.MarkerClusterer && !favMapCluster) {
      favMapCluster = new lib.MarkerClusterer({
        map: mapInstance,
        renderer: makeClusterRenderer(),
      });
    }

    saved.forEach(p => {
      // Try to use lat/lng stored in place data, fallback to geocoding
      if (p.lat && p.lng) {
        placeMarker(p, { lat: p.lat, lng: p.lng }, bounds);
        boundsExtended = true;
      } else if (p.pid && !p.pid.startsWith('ID_GOOGLE_')) {
        // Fetch lat/lng from Places API
        fetchPlaceLatLng(p.pid).then(coords => {
          if (coords) { placeMarker(p, coords, null); }
        });
      } else {
        // Geocode from address
        geocodeAddress(p.a + ', Curitiba, PR').then(coords => {
          if (coords) { placeMarker(p, coords, null); }
        });
      }
    });

    if (boundsExtended && saved.length > 1) {
      mapInstance.fitBounds(bounds);
    }
  });
}

// Alterna rótulos (nome) dos pins do mapa de favoritos conforme o zoom.
function applyFavLabelState() {
  if (!mapInstance) return;
  const labeled = (mapInstance.getZoom() || 13) >= LABEL_ZOOM;
  if (labeled === favMapLabeled) return;
  favMapLabeled = labeled;
  mapMarkers.forEach(m => {
    if (m._place) m.setIcon(placePinIcon(m._place, labeled));
  });
}

function placeMarker(place, coords, bounds) {
  if (!window.google?.maps || !mapInstance) return;

  const marker = new window.google.maps.Marker({
    position: coords,
    title: place.n,
    icon: placePinIcon(place, favMapLabeled),
  });
  marker._place = place;

  const infoWindow = new window.google.maps.InfoWindow({
    content: `
      <div style="font-family:'Manrope',sans-serif;padding:4px 2px;max-width:200px;">
        <div style="font-weight:800;font-size:14px;color:#14140F;margin-bottom:2px;">${place.n}</div>
        <div style="font-size:12px;color:#57564E;">${place.c} · ${place.b}</div>
        <div style="font-size:11px;color:#9A988E;margin-top:2px;">${place.h}</div>
      </div>`
  });

  marker.addListener('click', () => {
    infoWindow.open(mapInstance, marker);
  });

  if (bounds) bounds.extend(coords);
  mapMarkers.push(marker);
  if (favMapCluster) favMapCluster.addMarker(marker);
  else marker.setMap(mapInstance);
}

// Cache das coordenadas por placeId — evita refazer as ~57 chamadas à
// Places API a cada re-render do mapa (ligar/desligar "Abertos agora",
// trocar de categoria). Só guarda sucesso; falha volta a tentar depois.
const latLngCache = {};

async function fetchPlaceLatLng(placeId) {
  if (!placeId) return null;
  if (latLngCache[placeId]) return latLngCache[placeId];
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=location&key=${GOOGLE_API_KEY}`,
      { headers: { 'X-Goog-FieldMask': 'location' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.location) return null;
    const coords = { lat: data.location.latitude, lng: data.location.longitude };
    latLngCache[placeId] = coords;
    return coords;
  } catch { return null; }
}

async function geocodeAddress(address) {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`
    );
    const data = await res.json();
    if (data.results?.[0]) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  } catch { return null; }
}

// ── Map style (auto dark/light from theme) ─────────────────────────
function getMapStyle() {
  // "Limpa" o mapa: esconde os pontos de interesse do próprio Google
  // (estabelecimentos, museus, estádios, shoppings, hospitais…) e o
  // transporte público. Mantém ruas, nomes de bairro e o verde dos
  // parques — sobra só o mapa base + os nossos marcadores.
  const clean = [
    { featureType: 'poi',      elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit',  elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit',  elementType: 'geometry', stylers: [{ visibility: 'off' }] },
    { featureType: 'road',     elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  ];

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (!isDark) return clean;

  return [
    { elementType: 'geometry', stylers: [{ color: '#1a1625' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1625' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746abd' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2e2445' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9490a8' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#100d1a' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181324' }] },
    ...clean,
  ];
}

// ── Mapa genérico (aba Mapa — todos os lugares) ────────────────────
let mainMapInstance = null;
let mainMapMarkers  = [];
let mainMapEl       = null;
let mainMapBuild    = 0; // token de geração: descarta callbacks de builds antigos
let mainMapCluster  = null; // instância do MarkerClusterer
let mainMapLabeled  = null; // estado atual dos rótulos (true/false) p/ evitar re-render à toa

export function renderFavMap(places, mapEl, onOpenProfile) {
  if (!mapEl) return;
  // Se o elemento mudou (view re-renderizada), descarta a instância antiga
  // (o marcador/círculo do usuário pertenciam a ela → também zeram).
  if (mainMapEl !== mapEl) {
    mainMapInstance = null; mainMapMarkers = []; mainMapEl = mapEl;
    userMarker = null; userAccuracy = null;
    mainMapCluster = null; mainMapLabeled = null;
  }

  if (!window.google?.maps) {
    if (!document.getElementById('gmapsScript')) {
      const s = document.createElement('script');
      s.id  = 'gmapsScript';
      s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&callback=_initGoogleMap`;
      s.async = true;
      document.head.appendChild(s);
    }
    // Encadeia no callback (pode já existir um pendente do mapa de favoritos)
    const prev = window._initGoogleMap;
    window._initGoogleMap = () => {
      if (prev) prev();
      mapInitialized = true;
      buildMainMap(places, mapEl, onOpenProfile);
    };
    return;
  }
  buildMainMap(places, mapEl, onOpenProfile);
}

// ── Localização do usuário no mapa ─────────────────────────────────
let userMarker   = null;   // ponto azul "você está aqui" (por instância)
let userAccuracy = null;   // círculo de precisão (por instância)
let lastUserLoc  = null;   // última localização conhecida (cache p/ re-renders)
let geoRequested = false;  // já pedimos o GPS uma vez nesta sessão de página?

// Desenha (ou atualiza) o ponto azul + o círculo de precisão na instância
// atual. Não pede permissão nem recentraliza — só pinta o que já sabemos.
function drawUserMarker(c, accuracy) {
  if (!mainMapInstance || !c) return;
  if (userMarker) userMarker.setPosition(c);
  else userMarker = new window.google.maps.Marker({
    position: c, map: mainMapInstance, title: 'Você está aqui',
    zIndex: 9999, clickable: false,
    icon: {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 8, fillColor: '#1a73e8', fillOpacity: 1,
      strokeColor: '#fff', strokeWeight: 3,
    },
  });
  const acc = accuracy || 0;
  if (userAccuracy) { userAccuracy.setCenter(c); userAccuracy.setRadius(acc); }
  else userAccuracy = new window.google.maps.Circle({
    map: mainMapInstance, center: c, radius: acc, clickable: false,
    fillColor: '#1a73e8', fillOpacity: 0.12, strokeColor: '#1a73e8',
    strokeOpacity: 0.25, strokeWeight: 1,
  });
}

// Pede a localização do navegador e mostra no mapa. Silencioso se a pessoa
// negar ou o dispositivo não suportar — o mapa continua funcionando normal.
// center=true recentraliza no usuário (pra ver os lugares próximos).
function locateUser(center) {
  if (!mainMapInstance || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (!mainMapInstance) return;
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      lastUserLoc = c;
      drawUserMarker(c, pos.coords.accuracy);
      if (center) { mainMapInstance.setCenter(c); mainMapInstance.setZoom(14); }
    },
    () => { /* negado/indisponível → segue sem localização, sem erro */ },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

// Botão flutuante "minha localização" (controle nativo do mapa).
function addLocateControl() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = 'Minha localização';
  btn.setAttribute('aria-label', 'Centralizar na minha localização');
  btn.style.cssText =
    'width:40px;height:40px;margin:10px;border:none;border-radius:10px;' +
    'background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;' +
    'display:flex;align-items:center;justify-content:center;';
  btn.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14140F" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
  btn.onclick = () => locateUser(true);
  mainMapInstance.controls[window.google.maps.ControlPosition.RIGHT_BOTTOM].push(btn);
}

function buildMainMap(places, mapEl, onOpenProfile) {
  if (!mapEl || !window.google?.maps) return;

  if (!mainMapInstance) {
    mainMapInstance = new window.google.maps.Map(mapEl, {
      center: { lat: -25.4284, lng: -49.2733 }, // Curitiba
      zoom: 13,
      styles: getMapStyle(),
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
    });
    addLocateControl();

    // Ao dar zoom, alterna entre "só ícone" e "ícone + nome" nos pins.
    mainMapInstance.addListener('zoom_changed', () => {
      applyMainLabelState();
    });
  }

  // Localização da pessoa: se já sabemos (cache), repinta e centraliza na
  // hora — cada re-render cria um mapa novo, então recentralizamos nela pra
  // continuar mostrando os lugares próximos. Se ainda não pedimos nesta
  // sessão, pedimos uma vez (o navegador mostra o prompt). Negou → o mapa
  // segue em Curitiba, sem erro.
  if (lastUserLoc) {
    drawUserMarker(lastUserLoc);
    mainMapInstance.setCenter(lastUserLoc);
    mainMapInstance.setZoom(14);
  } else if (!geoRequested) {
    geoRequested = true;
    locateUser(true);
  }

  // Limpa marcadores e cluster anteriores.
  if (mainMapCluster) { mainMapCluster.clearMarkers(); mainMapCluster.setMap(null); mainMapCluster = null; }
  mainMapMarkers.forEach(m => m.setMap(null));
  mainMapMarkers = [];
  mainMapLabeled = null;

  // Cada build recebe um token; buscas assíncronas de builds anteriores
  // (ex.: filtro "Abertos agora" recém-alternado) são ignoradas para não
  // "vazar" pinos de uma lista antiga no mapa atual.
  const myBuild = ++mainMapBuild;

  const bounds = new window.google.maps.LatLngBounds();
  let boundsCount = 0;
  const infoWindow = new window.google.maps.InfoWindow();
  const labeled = (mainMapInstance.getZoom() || 13) >= LABEL_ZOOM;

  const addMarker = (p, coords) => {
    const marker = new window.google.maps.Marker({
      position: coords,
      title: p.n,
      icon: placePinIcon(p, labeled),
    });
    marker._place = p; // guarda o lugar p/ recolorir/rotular depois
    marker.addListener('click', () => {
      infoWindow.setContent(`
        <div style="font-family:'Manrope',sans-serif;padding:4px 2px;max-width:210px;">
          <div style="font-weight:800;font-size:14px;color:#14140F;margin-bottom:2px;">${p.n}</div>
          <div style="font-size:12px;color:#57564E;">${p.c} · ${p.b}</div>
          <div style="font-size:11px;color:#9A988E;margin:2px 0 8px;">${p.h}</div>
          <button onclick="window._mapOpenProfile('${p.id}')"
            style="width:100%;padding:8px;border-radius:10px;border:none;background:#14140F;color:#fff;
            font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;">Ver perfil →</button>
        </div>`);
      infoWindow.open(mainMapInstance, marker);
    });
    mainMapMarkers.push(marker);
    if (mainMapCluster) mainMapCluster.addMarker(marker);
    else marker.setMap(mainMapInstance);
    bounds.extend(coords);
    boundsCount++;
    // Só reenquadra em todos os lugares quando NÃO temos a localização da
    // pessoa. Com localização, mantemos o mapa centrado nela (lugares próximos).
    if (!lastUserLoc && boundsCount > 1) mainMapInstance.fitBounds(bounds, 48);
  };

  window._mapOpenProfile = (id) => {
    const p = places.find(x => x.id === id);
    if (p && onOpenProfile) onOpenProfile(p);
  };

  // Inicializa o agrupador (clustering) e só então adiciona os marcadores.
  loadClusterer().then(lib => {
    if (myBuild !== mainMapBuild || !mainMapInstance) return;
    if (lib?.MarkerClusterer) {
      mainMapCluster = new lib.MarkerClusterer({
        map: mainMapInstance,
        renderer: makeClusterRenderer(),
      });
      // Marcadores já criados antes da lib carregar entram no cluster agora.
      if (mainMapMarkers.length) {
        mainMapMarkers.forEach(m => m.setMap(null));
        mainMapCluster.addMarkers(mainMapMarkers);
      }
    }
    mainMapLabeled = labeled;

    places.forEach(p => {
      if (p.lat && p.lng) addMarker(p, { lat: p.lat, lng: p.lng });
      else if (p.pid && !p.pid.startsWith('ID_GOOGLE_')) {
        fetchPlaceLatLng(p.pid).then(coords => { if (coords && myBuild === mainMapBuild) addMarker(p, coords); });
      } else if (p.a) {
        geocodeAddress(p.a + ', Curitiba, PR').then(coords => { if (coords && myBuild === mainMapBuild) addMarker(p, coords); });
      }
    });
  });
}

// Alterna rótulos (nome) dos pins do mapa principal conforme o zoom atual.
function applyMainLabelState() {
  if (!mainMapInstance) return;
  const labeled = (mainMapInstance.getZoom() || 13) >= LABEL_ZOOM;
  if (labeled === mainMapLabeled) return; // nada mudou
  mainMapLabeled = labeled;
  mainMapMarkers.forEach(m => {
    if (m._place) m.setIcon(placePinIcon(m._place, labeled));
  });
}

// ── Toggle list/map ────────────────────────────────────────────────
export function toggleFavView(saved, onOpenProfile, onRemove) {
  favViewMode = favViewMode === 'list' ? 'map' : 'list';
  const btn = document.getElementById('favToggle');
  if (btn) {
    btn.innerHTML = favViewMode === 'list'
      ? `${ic('map', 14)} Ver no mapa`
      : `${ic('list', 14)} Ver lista`;
  }
  renderFavorites(saved, onOpenProfile, onRemove);
}

export { favViewMode };
