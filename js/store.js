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
export const fsLoadPlaces = async () => {
  try {
    const snap = await getDocs(collection(db, 'places'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.warn('fsLoadPlaces:', e); return []; }
};

export const fsLoadCategories = async () => {
  try {
    const snap = await getDocs(collection(db, 'categories'));
    const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

// Expose globally
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
