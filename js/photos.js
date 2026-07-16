// ── photos.js ─────────────────────────────────────────────────────
const GOOGLE_API_KEY = 'AIzaSyDIiBLGHZ_zgo-wKaHNK7qa4O-C_EZJJuY';
const cache1 = {}; // single photo
const cache2 = {}; // all photos

// ── FREIO DE CUSTO ─────────────────────────────────────────────────
// Por padrão o app NÃO chama a Places API (paga) ao vivo. Ele só exibe
// fotos já HOSPEDADAS no nosso Storage (campo p.photos, populado pelo admin
// em "Salvar fotos"). Lugares sem foto hospedada mostram o ícone da categoria.
// Isso garante custo ZERO com o Google no app, mesmo que a API esteja ativa
// no console. Para religar a busca ao vivo (só depois de restringir a chave e
// pôr teto de cota), mude para true.
const ENABLE_GOOGLE_PHOTOS = false;

export async function fetchPlacePhoto(placeId) {
  if (!ENABLE_GOOGLE_PHOTOS) return null;
  if (!placeId || placeId.startsWith('ID_GOOGLE_')) return null;
  if (cache1[placeId]) return cache1[placeId];
  try {
    const res  = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${GOOGLE_API_KEY}`,
      { headers: { 'X-Goog-FieldMask': 'photos' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.photos?.length) return null;
    const url = `https://places.googleapis.com/v1/${data.photos[0].name}/media?maxHeightPx=1000&maxWidthPx=800&key=${GOOGLE_API_KEY}`;
    cache1[placeId] = url;
    return url;
  } catch { return null; }
}

export async function fetchAllPhotos(placeId) {
  if (!ENABLE_GOOGLE_PHOTOS) return [];
  if (!placeId || placeId.startsWith('ID_GOOGLE_')) return [];
  if (cache2[placeId]) return cache2[placeId];
  try {
    const res  = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${GOOGLE_API_KEY}`,
      { headers: { 'X-Goog-FieldMask': 'photos' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.photos) return [];
    const urls = data.photos.slice(0,8).map(ph =>
      `https://places.googleapis.com/v1/${ph.name}/media?maxHeightPx=1000&maxWidthPx=800&key=${GOOGLE_API_KEY}`
    );
    cache2[placeId] = urls;
    return urls;
  } catch { return []; }
}
