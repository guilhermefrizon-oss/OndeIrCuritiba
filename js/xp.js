// ── xp.js ─────────────────────────────────────────────────────────
// Sistema de XP e níveis do usuário.
// Eventos são gravados em xp_events/{uid}/events/{eventId}
// O total de XP fica em user_profiles/{uid}.totalXp (via increment)
// para evitar recalcular tudo do zero a cada leitura.

import {
  db,
  doc, getDoc, setDoc, addDoc,
  collection, increment, serverTimestamp
} from './firebase.js';

// ── Configuração de XP ─────────────────────────────────────────────
export const XP_VALUES = {
  visited:         10,  // marcou Já fui
  comment:         20,  // comentário + avaliação
  comment_photo:   20,  // foto no comentário (futuro)
};

// ── Configuração de níveis ─────────────────────────────────────────
import { ic } from './icons.js';

export const LEVELS = [
  { name: 'Novato',      minXp: 0,    icon: ic('leaf', 18) },
  { name: 'Curioso',     minXp: 50,   icon: ic('eye', 18) },
  { name: 'Explorador',  minXp: 150,  icon: ic('compass', 18) },
  { name: 'Conhecedor',  minXp: 350,  icon: ic('target', 18) },
  { name: 'Expert',      minXp: 700,  icon: ic('star', 18) },
];

export function getLevelInfo(totalXp) {
  let current = LEVELS[0];
  let next    = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVELS[i].minXp) {
      current = LEVELS[i];
      next    = LEVELS[i + 1] || null;
      break;
    }
  }
  const xpIntoLevel = totalXp - current.minXp;
  const xpNeeded    = next ? next.minXp - current.minXp : null;
  const progress    = next ? Math.min(xpIntoLevel / xpNeeded, 1) : 1;
  return { current, next, totalXp, xpIntoLevel, xpNeeded, progress };
}

// ── Gravar evento de XP ────────────────────────────────────────────
// type: 'visited' | 'comment' | 'comment_photo'
// meta: objeto extra (placeId, placeName, etc.)
// Idempotência: para 'visited' e 'comment' por lugar, usamos um doc
// com ID fixo para evitar duplicatas.
export async function awardXp(type, meta = {}) {
  const user = window.currentUser;
  if (!user) return;

  const xpAmount = XP_VALUES[type];
  if (!xpAmount) return;

  const uid         = user.uid;
  const profileRef  = doc(db, 'user_profiles', uid);
  const eventsCol   = collection(db, 'xp_events', uid, 'events');

  // Para visited e comment, usa ID fixo = type_placeId para evitar duplicata
  const fixedId = meta.placeId ? `${type}_${meta.placeId}` : null;

  try {
    if (fixedId) {
      const eventRef = doc(db, 'xp_events', uid, 'events', fixedId);
      const existing = await getDoc(eventRef);
      if (existing.exists()) return; // já ganhou XP por isso

      await setDoc(eventRef, {
        type,
        xp: xpAmount,
        meta,
        createdAt: new Date().toISOString(),
      });
    } else {
      // Sem ID fixo (ex: futuro comment_photo) — sempre adiciona
      await addDoc(eventsCol, {
        type,
        xp: xpAmount,
        meta,
        createdAt: new Date().toISOString(),
      });
    }

    // Atualiza total no perfil atomicamente
    await setDoc(profileRef, {
      totalXp:   increment(xpAmount),
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    // Dispara evento local para UI atualizar em tempo real
    window.dispatchEvent(new CustomEvent('xpAwarded', {
      detail: { type, xpAmount, meta }
    }));

  } catch (e) {
    console.warn('awardXp:', e);
  }
}

// ── Carregar XP total do usuário ───────────────────────────────────
export async function loadUserXp(uid) {
  try {
    const snap = await getDoc(doc(db, 'user_profiles', uid));
    return snap.exists() ? (snap.data().totalXp || 0) : 0;
  } catch (e) {
    console.warn('loadUserXp:', e);
    return 0;
  }
}

// ── Carregar histórico de eventos ──────────────────────────────────
export async function loadXpEvents(uid) {
  try {
    const { getDocs, orderBy, query } = await import('./firebase.js');
    const q    = query(collection(db, 'xp_events', uid, 'events'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('loadXpEvents:', e);
    return [];
  }
}

// Expose globally
window.awardXp     = awardXp;
window.loadUserXp  = loadUserXp;
window.getLevelInfo = getLevelInfo;
