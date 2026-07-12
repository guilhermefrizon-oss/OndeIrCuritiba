// ── store.js ──────────────────────────────────────────────────────
import {
  db,
  doc, getDoc, setDoc, deleteDoc, getDocs,
  collection, increment
} from './firebase.js';

// Usa o UID do usuário autenticado se disponível, senão anônimo por dispositivo
function getUid() {
  return window.currentUser?.uid || localStorage.getItem('cwb_uid') || (() => {
    const id = crypto.randomUUID();
    localStorage.setItem('cwb_uid', id);
    return id;
  })();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10); // "2026-04-18"
}

function isSameDay(isoStr) {
  return isoStr?.slice(0, 10) === todayStr();
}

function daysPassed(isoStr) {
  if (!isoStr) return 999;
  return Math.floor((Date.now() - new Date(isoStr).getTime()) / 86400000);
}

// ── Fallback REST (Firestore) ──────────────────────────────────────
// Em algumas redes (dados móveis/operadora, alta latência) o canal do SDK
// do Firestore não completa e getDocs() fica pendurado — spinner infinito.
// A leitura pública via REST é um GET curto e simples, que passa onde o
// streaming trava. Usamos como rede de segurança para lugares e categorias
// (as duas coleções que travam a exibição dos cards).
const PROJECT_ID = 'ondeircuritiba-91390';
const REST_BASE  = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function _restUnwrap(v) {
  if (v == null) return null;
  if ('stringValue'    in v) return v.stringValue;
  if ('integerValue'   in v) return Number(v.integerValue);
  if ('doubleValue'    in v) return v.doubleValue;
  if ('booleanValue'   in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue'      in v) return null;
  if ('arrayValue'     in v) return (v.arrayValue.values || []).map(_restUnwrap);
  if ('mapValue'       in v) return _restUnwrapFields(v.mapValue.fields || {});
  return null;
}
function _restUnwrapFields(fields) {
  const o = {};
  for (const k in fields) o[k] = _restUnwrap(fields[k]);
  return o;
}
async function _restCollection(name) {
  const res = await fetch(`${REST_BASE}/${name}?pageSize=300`);
  if (!res.ok) throw new Error('REST ' + res.status);
  const data = await res.json();
  return (data.documents || []).map(doc => ({
    id: doc.name.split('/').pop(),
    ..._restUnwrapFields(doc.fields || {}),
  }));
}
// Corre o SDK contra um timeout; se estourar (ou o SDK falhar), tenta REST.
async function _loadWithRestFallback(name, sdkPromise) {
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('sdk-timeout')), 7000));
    return await Promise.race([sdkPromise, timeout]);
  } catch (e) {
    console.warn(`${name}: SDK indisponível (${e.message}), tentando REST…`);
    return await _restCollection(name);
  }
}

// ── Salvos (lista permanente) ──────────────────────────────────────
export const fsSave = async (place) => {
  try { await setDoc(doc(db, 'favorites', getUid(), 'places', place.id), place); }
  catch (e) { console.warn('fsSave:', e); }
};

export const fsRemove = async (placeId) => {
  try { await deleteDoc(doc(db, 'favorites', getUid(), 'places', placeId)); }
  catch (e) { console.warn('fsRemove:', e); }
};

export const fsLoadAll = async () => {
  try {
    const snap = await getDocs(collection(db, 'favorites', getUid(), 'places'));
    return snap.docs.map(d => d.data());
  } catch (e) { console.warn('fsLoadAll:', e); return []; }
};

// ── Quero ir (lista do dia, zera meia-noite) ───────────────────────
export const fsWantToday = async (place) => {
  const uid = getUid();
  if (!window.currentUser) return;
  try {
    await setDoc(doc(db, 'want_today', uid, 'places', place.id), {
      ...place, addedAt: new Date().toISOString()
    });
  } catch (e) { console.warn('fsWantToday:', e); }
};

export const fsLoadWantToday = async () => {
  const uid = getUid();
  if (!window.currentUser) return [];
  try {
    const snap = await getDocs(collection(db, 'want_today', uid, 'places'));
    // Filtra só os de hoje
    return snap.docs
      .map(d => d.data())
      .filter(p => isSameDay(p.addedAt));
  } catch (e) { console.warn('fsLoadWantToday:', e); return []; }
};

export const fsRemoveWantToday = async (placeId) => {
  const uid = getUid();
  try { await deleteDoc(doc(db, 'want_today', uid, 'places', placeId)); }
  catch (e) { console.warn('fsRemoveWantToday:', e); }
};

// ── Passar (volta amanhã) ──────────────────────────────────────────
export const fsSkip = async (placeId) => {
  const uid = getUid();
  try {
    await setDoc(doc(db, 'skipped', uid, 'places', placeId), {
      skippedAt: new Date().toISOString()
    });
  } catch (e) { console.warn('fsSkip:', e); }
};

export const fsUnskip = async (placeId) => {
  const uid = getUid();
  try { await deleteDoc(doc(db, 'skipped', uid, 'places', placeId)); }
  catch (e) { console.warn('fsUnskip:', e); }
};

export const fsClearSkipped = async () => {
  const uid = getUid();
  try {
    const snap = await getDocs(collection(db, 'skipped', uid, 'places'));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  } catch (e) { console.warn('fsClearSkipped:', e); }
};

export const fsLoadSkipped = async () => {
  const uid = getUid();
  try {
    const snap = await getDocs(collection(db, 'skipped', uid, 'places'));
    // Retorna só os pulados HOJE (volta amanhã)
    const skipped = {};
    snap.docs.forEach(d => {
      const data = d.data();
      if (isSameDay(data.skippedAt)) skipped[d.id] = true;
    });
    return skipped;
  } catch (e) { console.warn('fsLoadSkipped:', e); return {}; }
};

// ── Já fui (some por 10 dias) ──────────────────────────────────────
export const fsBeenThere = async (place) => {
  const uid = getUid();
  try {
    await setDoc(doc(db, 'been_there', uid, 'places', place.id), {
      ...place, visitedAt: new Date().toISOString()
    });
  } catch (e) { console.warn('fsBeenThere:', e); }
};

export const fsRemoveBeenThere = async (placeId) => {
  const uid = getUid();
  try { await deleteDoc(doc(db, 'been_there', uid, 'places', placeId)); }
  catch (e) { console.warn('fsRemoveBeenThere:', e); }
};

export const fsLoadBeenThere = async () => {
  const uid = getUid();
  try {
    const snap = await getDocs(collection(db, 'been_there', uid, 'places'));
    // Retorna mapa id→data; app filtra os < 10 dias
    const been = {};
    snap.docs.forEach(d => {
      const data = d.data();
      if (daysPassed(data.visitedAt) < 10) been[d.id] = data;
    });
    return been;
  } catch (e) { console.warn('fsLoadBeenThere:', e); return {}; }
};

// ── Places & categories ────────────────────────────────────────────
// Fotos antigas foram salvas em baixa resolução (maxWidthPx=600/700).
// Reescreve a URL do Google pra pedir sempre em alta (1600/1200), assim
// os cards ficam nítidos mesmo sem re-salvar no admin.
// Chave atual do Google. Fotos antigas foram salvas com uma chave que já
// não vale mais — reescrevemos o key= da URL para a chave atual, senão a
// imagem quebra no app até o lugar ser re-salvo. (URLs do Storage não têm
// 'places.googleapis.com', então passam intactas.)
const GOOGLE_API_KEY = 'AIzaSyDIiBLGHZ_zgo-wKaHNK7qa4O-C_EZJJuY';
function upgradePhotoRes(url) {
  if (typeof url !== 'string' || !url.includes('places.googleapis.com')) return url;
  return url
    .replace(/maxHeightPx=\d+/, 'maxHeightPx=1600')
    .replace(/maxWidthPx=\d+/,  'maxWidthPx=1200')
    .replace(/([?&])key=[^&]*/, '$1key=' + GOOGLE_API_KEY);
}
function normalizePlacePhotos(p) {
  if (Array.isArray(p.photos)) p.photos = p.photos.map(upgradePhotoRes);
  return p;
}

export const fsLoadPlaces = async () => {
  try {
    const viaSdk = getDocs(collection(db, 'places'))
      .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
    const places = await _loadWithRestFallback('places', viaSdk);
    return Array.isArray(places) ? places.map(normalizePlacePhotos) : places;
  } catch (e) { console.warn('fsLoadPlaces:', e); return []; }
};

export const fsLoadCategories = async () => {
  try {
    const viaSdk = getDocs(collection(db, 'categories'))
      .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
    const cats = await _loadWithRestFallback('categories', viaSdk);
    cats.sort((a,b) => (a.order||99) - (b.order||99));
    return cats;
  } catch (e) { console.warn('fsLoadCategories:', e); return []; }
};

export const fsIncrementLike = async (placeId) => {
  const user = window.currentUser;
  if (!user) return;
  try {
    const likeRef = doc(db, 'likes', placeId, 'users', user.uid);
    const existing = await getDoc(likeRef);
    if (existing.exists()) return;
    await Promise.all([
      setDoc(likeRef, { likedAt: new Date().toISOString() }),
      setDoc(doc(db, 'likes_by_user', user.uid, 'places', placeId), { likedAt: new Date().toISOString() }),
      setDoc(doc(db, 'places', placeId), { _likes: increment(1) }, { merge: true }),
    ]);
  } catch (e) { console.warn('fsIncrementLike:', e); }
};

export const fsRemoveLike = async (placeId) => {
  const user = window.currentUser;
  if (!user) return;
  try {
    const likeRef = doc(db, 'likes', placeId, 'users', user.uid);
    const existing = await getDoc(likeRef);
    if (!existing.exists()) return;
    await Promise.all([
      deleteDoc(likeRef),
      deleteDoc(doc(db, 'likes_by_user', user.uid, 'places', placeId)),
      setDoc(doc(db, 'places', placeId), { _likes: increment(-1) }, { merge: true }),
    ]);
  } catch (e) { console.warn('fsRemoveLike:', e); }
};

// ── Exclusão de conta (LGPD / exigência das lojas) ─────────────────
// Apaga TODOS os dados pessoais do usuário no Firestore. Cada bloco é
// isolado (try/catch) pra que uma falha não impeça o resto — o objetivo é
// remover o máximo possível de forma resiliente.
async function _deleteAllDocsIn(...path) {
  try {
    const snap = await getDocs(collection(db, ...path));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(() => {})));
  } catch (e) { console.warn('_deleteAllDocsIn', path.join('/'), e); }
}

export const fsDeleteAllUserData = async (uid) => {
  if (!uid) return;
  // 1) Coleta os lugares avaliados/curtidos ANTES de apagar, para remover
  //    também os espelhos públicos (voto e curtida em cada lugar).
  let ratedPlaceIds = [], likedPlaceIds = [];
  try { ratedPlaceIds = (await getDocs(collection(db, 'ratings_by_user', uid, 'places'))).docs.map(d => d.id); } catch {}
  try { likedPlaceIds = (await getDocs(collection(db, 'likes_by_user',  uid, 'places'))).docs.map(d => d.id); } catch {}

  // 2) Apaga os espelhos públicos (voto/curtida por lugar).
  await Promise.all([
    ...ratedPlaceIds.map(pid => deleteDoc(doc(db, 'ratings', pid, 'votes', uid)).catch(() => {})),
    ...likedPlaceIds.map(pid => deleteDoc(doc(db, 'likes',   pid, 'users', uid)).catch(() => {})),
  ]);

  // 3) Apaga todas as coleções pessoais.
  await _deleteAllDocsIn('favorites',       uid, 'places');
  await _deleteAllDocsIn('want_today',      uid, 'places');
  await _deleteAllDocsIn('skipped',         uid, 'places');
  await _deleteAllDocsIn('been_there',      uid, 'places');
  await _deleteAllDocsIn('ratings_by_user', uid, 'places');
  await _deleteAllDocsIn('likes_by_user',   uid, 'places');
  await _deleteAllDocsIn('xp_events',       uid, 'events');

  // 4) Apaga o perfil (foto, badges, XP, privacidade).
  try { await deleteDoc(doc(db, 'user_profiles', uid)); } catch (e) { console.warn('delete user_profiles:', e); }
};

// Expose globally
window.fsDeleteAllUserData = fsDeleteAllUserData;
window.fsSave           = fsSave;
window.fsRemove         = fsRemove;
window.fsLoadAll        = fsLoadAll;
window.fsLoadPlaces     = fsLoadPlaces;
window.fsLoadCategories = fsLoadCategories;
window.fsIncrementLike  = fsIncrementLike;
window.fsWantToday      = fsWantToday;
window.fsLoadWantToday  = fsLoadWantToday;
window.fsRemoveWantToday = fsRemoveWantToday;
window.fsSkip           = fsSkip;
window.fsBeenThere      = fsBeenThere;
