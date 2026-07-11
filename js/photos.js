// ── photos.js ─────────────────────────────────────────────────────
const GOOGLE_API_KEY = 'AIzaSyDiLhxU3veHWvx3fvA6kk6TluFFHYWHEzs';
const cache1 = {}; // single photo
const cache2 = {}; // all photos

export async function fetchPlacePhoto(placeId) {
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
    const url = `https://places.googleapis.com/v1/${data.photos[0].name}/media?maxHeightPx=1600&maxWidthPx=1200&key=${GOOGLE_API_KEY}`;
    cache1[placeId] = url;
    return url;
  } catch { return null; }
}

export async function fetchAllPhotos(placeId) {
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
      `https://places.googleapis.com/v1/${ph.name}/media?maxHeightPx=1600&maxWidthPx=1200&key=${GOOGLE_API_KEY}`
    );
    cache2[placeId] = urls;
    return urls;
  } catch { return []; }
}
