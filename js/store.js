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
  if (!user) return; // só usuários autenticados
  try {
    const likeRef = doc(db, 'likes', placeId, 'users', user.uid);
    const existing = await getDoc(likeRef);
    if (existing.exists()) return; // já curtiu, não incrementa de novo
    // Grava nos dois índices em paralelo
    await Promise.all([
      setDoc(likeRef, { likedAt: new Date().toISOString() }),
      setDoc(doc(db, 'likes_by_user', user.uid, 'places', placeId), { likedAt: new Date().toISOString() }),
      setDoc(doc(db, 'places', placeId), { _likes: increment(1) }, { merge: true }),
    ]);
  } catch (e) { console.warn('fsIncrementLike:', e); }
};

// Expose globally for legacy callers
window.fsSave           = fsSave;
window.fsRemove         = fsRemove;
window.fsLoadAll        = fsLoadAll;
window.fsLoadPlaces     = fsLoadPlaces;
window.fsLoadCategories = fsLoadCategories;
window.fsIncrementLike  = fsIncrementLike;
