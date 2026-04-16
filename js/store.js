// ── store.js ──────────────────────────────────────────────────────
import {
  db,
  doc, getDoc, setDoc, deleteDoc, getDocs,
  collection, increment
} from './firebase.js';

let userId = localStorage.getItem('cwb_uid');
if (!userId) { userId = crypto.randomUUID(); localStorage.setItem('cwb_uid', userId); }

export const fsSave = async (place) => {
  try { await setDoc(doc(db, 'favorites', userId, 'places', place.id), place); }
  catch (e) { console.warn('fsSave:', e); }
};

export const fsRemove = async (placeId) => {
  try { await deleteDoc(doc(db, 'favorites', userId, 'places', placeId)); }
  catch (e) { console.warn('fsRemove:', e); }
};

export const fsLoadAll = async () => {
  try {
    const snap = await getDocs(collection(db, 'favorites', userId, 'places'));
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
    await setDoc(likeRef, { likedAt: new Date().toISOString() });
    await setDoc(doc(db, 'places', placeId), { _likes: increment(1) }, { merge: true });
  } catch (e) { console.warn('fsIncrementLike:', e); }
};

// Expose globally for legacy callers
window.fsSave           = fsSave;
window.fsRemove         = fsRemove;
window.fsLoadAll        = fsLoadAll;
window.fsLoadPlaces     = fsLoadPlaces;
window.fsLoadCategories = fsLoadCategories;
window.fsIncrementLike  = fsIncrementLike;
