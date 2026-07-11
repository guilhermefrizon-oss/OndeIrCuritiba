// ── badges.js ──────────────────────────────────────────────────────
// Sistema de badges automáticas.
// Badges são gravadas em user_profiles/{uid}.badges (array de IDs)
// Ao conquistar uma badge nova, dispara evento 'badgeUnlocked' para UI.

import {
  db,
  doc, getDoc, setDoc,
  collection, getDocs
} from './firebase.js';
import { ic } from './icons.js';

// ── Definição das badges ───────────────────────────────────────────
export const BADGES = [
  // ── Visitas ───────────────────────────────────────────────────────
  {
    id:       'pioneer',
    icon:     ic('award', 24),
    name:     'Pioneiro',
    desc:     'Marcou seu primeiro lugar visitado.',
    check:    ({ visited }) => visited.length >= 1,
  },
  {
    id:       'cwb_20',
    icon:     ic('trophy', 24),
    name:     'Curitibano de Carteirinha',
    desc:     'Visitou 20 lugares em Curitiba.',
    check:    ({ visited }) => visited.length >= 20,
  },
  {
    id:       'coffee_5',
    icon:     ic('coffee', 24),
    name:     'Cafézinho',
    desc:     'Visitou 5 cafés ou cafeterias.',
    check:    ({ visited }) =>
      visited.filter(p => _matchCat(p, ['café','cafeteria','café da tarde'])).length >= 5,
  },
  {
    id:       'bar_5',
    icon:     ic('moon', 24),
    name:     'Notívago',
    desc:     'Visitou 5 barzinhos ou baladas.',
    check:    ({ visited }) =>
      visited.filter(p => _matchCat(p, ['bar','barzinho','balada','pub','cervejaria'])).length >= 5,
  },
  {
    id:       'explorer_3',
    icon:     ic('map', 24),
    name:     'Explorador',
    desc:     'Visitou lugares em 3 bairros diferentes.',
    check:    ({ visited }) =>
      new Set(visited.map(p => p.b).filter(Boolean)).size >= 3,
  },
  {
    id:       'foodie',
    icon:     ic('utensils', 24),
    name:     'Gourmet',
    desc:     'Visitou 5 restaurantes.',
    check:    ({ visited }) =>
      visited.filter(p => _matchCat(p, ['restaurante','culinária','comida','gastronomia'])).length >= 5,
  },

  // ── Comentários ───────────────────────────────────────────────────
  {
    id:       'first_comment',
    icon:     ic('message-circle', 24),
    name:     'Primeira Impressão',
    desc:     'Deixou seu primeiro comentário.',
    check:    ({ commentCount }) => commentCount >= 1,
  },
  {
    id:       'active_voice',
    icon:     ic('message-circle', 24),
    name:     'Voz Ativa',
    desc:     'Deixou 10 comentários.',
    check:    ({ commentCount }) => commentCount >= 10,
  },
  {
    id:       'local_critic',
    icon:     ic('edit', 24),
    name:     'Crítico Local',
    desc:     'Deixou 25 comentários.',
    check:    ({ commentCount }) => commentCount >= 25,
  },
  {
    id:       'influencer',
    icon:     ic('mic', 24),
    name:     'Influenciador',
    desc:     'Deixou 50 comentários.',
    check:    ({ commentCount }) => commentCount >= 50,
  },
];

// ── Helper: verifica categoria ─────────────────────────────────────
function _matchCat(place, keywords) {
  const cat = (place.c || place.category || '').toLowerCase();
  return keywords.some(k => cat.includes(k));
}

// ── Verificar e conceder badges ────────────────────────────────────
// Chamado após cada evento de XP (visited ou comment).
export async function checkAndAwardBadges() {
  const user = window.currentUser;
  if (!user) return;

  const uid        = user.uid;
  const profileRef = doc(db, 'user_profiles', uid);

  try {
    // Carrega estado atual do perfil (badges já conquistadas)
    const profileSnap = await getDoc(profileRef);
    const existing    = new Set(profileSnap.exists() ? (profileSnap.data().badges || []) : []);

    // Carrega dados necessários para os checks
    const [visitedSnap, xpSnap] = await Promise.all([
      getDocs(collection(db, 'been_there', uid, 'places')),
      getDocs(collection(db, 'xp_events', uid, 'events')),
    ]);

    const visited      = visitedSnap.docs.map(d => d.data());
    const commentCount = xpSnap.docs.filter(d => d.data().type === 'comment').length;

    const ctx = { visited, commentCount };

    // Verifica cada badge
    const newBadges = [];
    for (const badge of BADGES) {
      if (existing.has(badge.id)) continue; // já tem
      if (badge.check(ctx)) newBadges.push(badge.id);
    }

    if (!newBadges.length) return;

    // Grava as novas badges no perfil
    const allBadges = [...existing, ...newBadges];
    await setDoc(profileRef, { badges: allBadges, updatedAt: new Date().toISOString() }, { merge: true });

    // Dispara notificação para cada nova badge
    for (const id of newBadges) {
      const badge = BADGES.find(b => b.id === id);
      window.dispatchEvent(new CustomEvent('badgeUnlocked', { detail: badge }));
    }

  } catch (e) {
    console.warn('checkAndAwardBadges:', e);
  }
}

// ── Carregar badges do usuário ─────────────────────────────────────
export async function loadUserBadges(uid) {
  try {
    const snap = await getDoc(doc(db, 'user_profiles', uid));
    return snap.exists() ? (snap.data().badges || []) : [];
  } catch (e) {
    console.warn('loadUserBadges:', e);
    return [];
  }
}

// ── Renderizar badges no perfil ────────────────────────────────────
export function renderBadges(earnedIds, container) {
  if (!container) return;
  container.innerHTML = '';
  earnedIds = Array.isArray(earnedIds) ? earnedIds : [];

  // Sempre mostra todas: conquistadas primeiro, depois as bloqueadas
  // ("a conquistar") — mesmo quem ainda não tem nenhuma vê o que dá pra ganhar.
  const earned  = BADGES.filter(b =>  earnedIds.includes(b.id));
  const locked  = BADGES.filter(b => !earnedIds.includes(b.id));

  [...earned, ...locked].forEach(badge => {
    const isEarned = earnedIds.includes(badge.id);
    const el = document.createElement('div');
    el.className = `badge-card ${isEarned ? 'earned' : 'locked'}`;
    el.innerHTML = `
      <div class="badge-icon">${badge.icon}</div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-desc">${badge.desc}</div>
      ${isEarned ? '<div class="badge-check">✓</div>' : `<div class="badge-lock">${ic('lock', 12)}</div>`}`;
    container.appendChild(el);
  });
}

// Expose globally
window.checkAndAwardBadges = checkAndAwardBadges;
window.loadUserBadges      = loadUserBadges;
window.renderBadges        = renderBadges;
window.BADGES              = BADGES;
