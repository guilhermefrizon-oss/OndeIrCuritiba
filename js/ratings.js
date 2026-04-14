// ── ratings.js ────────────────────────────────────────────────────
// Sistema de avaliação por estrelas (1–5) por lugar
// Regras:
//  - Só usuários logados com Google podem avaliar
//  - Podem reavaliar (sobrescreve nota anterior)
//  - Média calculada no cliente a partir de todos os votos
//  - Armazenado em: Firestore → ratings/{placeId}/votes/{userId}
//  - Contador desnormalizado em: ratings/{placeId} → { avg, count }

import {
  db,
  doc, setDoc, getDocs,
  collection
} from './firebase.js';

// ── Salva/atualiza voto ────────────────────────────────────────────
export async function submitRating(placeId, stars) {
  const user = window.currentUser;
  if (!user) return false;

  try {
    // Salva voto individual
    await setDoc(
      doc(db, 'ratings', placeId, 'votes', user.uid),
      { stars, userId: user.uid, updatedAt: Date.now() }
    );

    // Recalcula média lendo todos os votos
    const snap = await getDocs(collection(db, 'ratings', placeId, 'votes'));
    const votes = snap.docs.map(d => d.data().stars);
    const avg   = votes.reduce((s,v) => s+v, 0) / votes.length;
    const count = votes.length;

    // Persiste resumo no doc pai (para leitura rápida)
    await setDoc(
      doc(db, 'ratings', placeId),
      { avg: Math.round(avg * 10) / 10, count },
      { merge: true }
    );

    return { avg: Math.round(avg * 10) / 10, count, userStars: stars };
  } catch (e) {
    console.warn('submitRating:', e);
    return null;
  }
}

// ── Carrega média + voto do usuário atual ──────────────────────────
export async function loadRating(placeId) {
  try {
    const snap = await getDocs(collection(db, 'ratings', placeId, 'votes'));
    if (snap.empty) return { avg: 0, count: 0, userStars: 0 };

    const votes = snap.docs.map(d => d.data());
    const avg   = votes.reduce((s,v) => s+v.stars, 0) / votes.length;

    const user       = window.currentUser;
    const userVote   = user ? votes.find(v => v.userId === user.uid) : null;

    return {
      avg:       Math.round(avg * 10) / 10,
      count:     votes.length,
      userStars: userVote?.stars || 0
    };
  } catch (e) {
    console.warn('loadRating:', e);
    return { avg: 0, count: 0, userStars: 0 };
  }
}

// ── Renderiza bloco de rating no profile ──────────────────────────
export async function renderRatingBlock(placeId) {
  // Remove bloco anterior
  document.getElementById('ratingBlock')?.remove();

  const block = document.createElement('div');
  block.id = 'ratingBlock';
  block.className = 'rating-block';
  block.innerHTML = `<div class="rating-loading"><div class="spinner"></div></div>`;

  // Insere antes dos info-cards
  const infoGrid = document.getElementById('profileInfoGrid');
  if (infoGrid) infoGrid.before(block);

  const { avg, count, userStars } = await loadRating(placeId);
  renderRatingHTML(block, placeId, avg, count, userStars);
}

function renderRatingHTML(block, placeId, avg, count, userStars) {
  const user      = window.currentUser;
  const hasRating = avg > 0;

  block.innerHTML = `
    <div class="rating-summary">
      <div class="rating-avg-wrap">
        <div class="rating-avg-score">${hasRating ? avg.toFixed(1) : '—'}</div>
        <div>
          <div class="rating-stars-display">${renderStarsDisplay(avg)}</div>
          <div class="rating-count">${count > 0 ? `${count} avaliação${count > 1 ? 'ões' : ''}` : 'Sem avaliações'}</div>
        </div>
      </div>
    </div>

    ${user
      ? `<div class="rating-user-section">
           <div class="rating-user-label">
             ${userStars > 0
               ? `Sua avaliação <span class="rating-user-prev">${userStars}★</span> — alterar:`
               : 'Avalie este lugar:'}
           </div>
           <div class="rating-picker" id="ratingPicker" data-selected="${userStars}">
             ${[1,2,3,4,5].map(i => `
               <button class="rstar${userStars >= i ? ' on' : ''}"
                       data-val="${i}"
                       onclick="window._handleStarClick(${i},'${placeId}')">★</button>
             `).join('')}
           </div>
         </div>`
      : `<div class="rating-login-hint">
           <button class="rating-login-btn" onclick="showAuthModal()">
             Faça login para avaliar
           </button>
         </div>`
    }`;

  // Re-render ao logar/deslogar
  window.addEventListener('authChanged', () => {
    const current = document.getElementById('ratingBlock');
    if (current) renderRatingBlock(placeId);
  }, { once: true });
}

// Hover + click nas estrelas
window._handleStarClick = async (val, placeId) => {
  const picker = document.getElementById('ratingPicker');
  if (!picker) return;

  // Feedback visual imediato
  picker.querySelectorAll('.rstar').forEach((b,i) => {
    b.classList.toggle('on', i < val);
  });
  picker.dataset.selected = val;

  const result = await submitRating(placeId, val);
  if (!result) return;

  // Atualiza bloco com nova média
  const block = document.getElementById('ratingBlock');
  if (block) renderRatingHTML(block, placeId, result.avg, result.count, result.userStars);
};

// Hover effect
document.addEventListener('mouseover', e => {
  const btn = e.target.closest('.rstar');
  if (!btn) return;
  const picker = btn.closest('#ratingPicker');
  if (!picker) return;
  const val = parseInt(btn.dataset.val);
  picker.querySelectorAll('.rstar').forEach((b,i) => {
    b.classList.toggle('hover', i < val);
  });
});
document.addEventListener('mouseout', e => {
  const btn = e.target.closest('.rstar');
  if (!btn) return;
  const picker = btn.closest('#ratingPicker');
  if (!picker) return;
  const sel = parseInt(picker.dataset.selected || 0);
  picker.querySelectorAll('.rstar').forEach((b,i) => {
    b.classList.remove('hover');
    b.classList.toggle('on', i < sel);
  });
});

// ── Helpers ────────────────────────────────────────────────────────
function renderStarsDisplay(avg) {
  if (!avg) return [1,2,3,4,5].map(() => `<span class="sdot empty">★</span>`).join('');
  return [1,2,3,4,5].map(i => {
    if (avg >= i)      return `<span class="sdot full">★</span>`;
    if (avg >= i-0.5)  return `<span class="sdot half">★</span>`;
    return             `<span class="sdot empty">★</span>`;
  }).join('');
}

window.renderRatingBlock = renderRatingBlock;
