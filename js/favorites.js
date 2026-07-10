// ── favorites.js ──────────────────────────────────────────────────
import { fetchPlacePhoto } from './photos.js';
import { ic, catIcon } from './icons.js';
import { fsRemove } from './store.js';

const GOOGLE_API_KEY = 'AIzaSyDiLhxU3veHWvx3fvA6kk6TluFFHYWHEzs';

let mapInstance   = null;
let mapMarkers    = [];
let mapInitialized = false;
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
    subtitle.textContent = 'Nenhum lugar salvo';
    document.getElementById('favToggle').style.display = 'none';
    return;
  }

  document.getElementById('favEmpty').style.display = 'none';
  document.getElementById('favToggle').style.display = 'flex';
  subtitle.textContent = `${saved.length} lugar${saved.length > 1 ? 'es' : ''} salvo${saved.length > 1 ? 's' : ''}`;

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
          <div class="saved-meta">${p.b} · ${p.h}</div>
        </div>
        <div class="saved-price">${p.p}</div>
        <button class="fav-remove-btn" title="Remover" onclick="event.stopPropagation();window._removeFav('${p.id}')">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>`;
      grid.appendChild(row);

      // Load photo async
      if (p.pid && !p.pid.startsWith('ID_GOOGLE_')) {
        fetchPlacePhoto(p.pid).then(url => {
          if (!url) return;
          const t = document.getElementById(`fthumb-${p.id}`);
          if (t) { t.style.backgroundImage = `url("${url}")`; t.innerHTML = ''; }
        });
      } else if (Array.isArray(p.photos) && p.photos.length) {
        const t = document.getElementById(`fthumb-${p.id}`);
        if (t) { t.style.backgroundImage = `url("${p.photos[0]}")`; t.innerHTML = ''; }
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
  } else {
    mapInstance.setCenter(center);
  }

  // Geocode and place markers for each favorite
  // Use Places API for places that have a placeId
  const bounds = new window.google.maps.LatLngBounds();
  let boundsExtended = false;

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
}

function placeMarker(place, coords, bounds) {
  if (!window.google?.maps || !mapInstance) return;

  const marker = new window.google.maps.Marker({
    position: coords,
    map: mapInstance,
    title: place.n,
    icon: {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: '#14140F',
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: 2,
    }
  });

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
}

async function fetchPlaceLatLng(placeId) {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=location&key=${GOOGLE_API_KEY}`,
      { headers: { 'X-Goog-FieldMask': 'location' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.location) return null;
    return { lat: data.location.latitude, lng: data.location.longitude };
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
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (!isDark) return [];
  return [
    { elementType: 'geometry', stylers: [{ color: '#1a1625' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1625' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#746abd' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2e2445' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9490a8' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#100d1a' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181324' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  ];
}

// ── Mapa genérico (aba Mapa — todos os lugares) ────────────────────
let mainMapInstance = null;
let mainMapMarkers  = [];
let mainMapEl       = null;

export function renderFavMap(places, mapEl, onOpenProfile) {
  if (!mapEl) return;
  // Se o elemento mudou (view re-renderizada), descarta a instância antiga
  if (mainMapEl !== mapEl) { mainMapInstance = null; mainMapMarkers = []; mainMapEl = mapEl; }

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
  }

  mainMapMarkers.forEach(m => m.setMap(null));
  mainMapMarkers = [];

  const bounds = new window.google.maps.LatLngBounds();
  let boundsCount = 0;
  const infoWindow = new window.google.maps.InfoWindow();

  const addMarker = (p, coords) => {
    const isWant  = !!window._isWantToday?.(p.id);
    const isSaved = !!window._isSaved?.(p.id);
    const color = isWant ? '#ef4444' : isSaved ? '#f59e0b' : '#14140F';
    const marker = new window.google.maps.Marker({
      position: coords,
      map: mainMapInstance,
      title: p.n,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      }
    });
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
    bounds.extend(coords);
    boundsCount++;
    if (boundsCount > 1) mainMapInstance.fitBounds(bounds, 48);
  };

  window._mapOpenProfile = (id) => {
    const p = places.find(x => x.id === id);
    if (p && onOpenProfile) onOpenProfile(p);
  };

  places.forEach(p => {
    if (p.lat && p.lng) addMarker(p, { lat: p.lat, lng: p.lng });
    else if (p.pid && !p.pid.startsWith('ID_GOOGLE_')) {
      fetchPlaceLatLng(p.pid).then(coords => { if (coords) addMarker(p, coords); });
    } else if (p.a) {
      geocodeAddress(p.a + ', Curitiba, PR').then(coords => { if (coords) addMarker(p, coords); });
    }
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
