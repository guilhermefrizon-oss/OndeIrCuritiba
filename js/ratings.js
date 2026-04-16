// ── ratings.js ────────────────────────────────────────────────────
// Responsabilidade: salvar/carregar notas e exibir o RESUMO no perfil.
// A interação do usuário (escolher estrelas + comentar) ficou em comments.js.

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
    await setDoc(
      doc(db, 'ratings', placeId, 'votes', user.uid),
      { stars, userId: user.uid, updatedAt: Date.now() }
    );

    const snap  = await getDocs(collection(db, 'ratings', placeId, 'votes'));
    const votes = snap.docs.map(d => d.data().stars);
    const avg   = votes.reduce((s, v) => s + v, 0) / votes.length;
    const count = votes.length;

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

    const votes    = snap.docs.map(d => d.data());
    const avg      = votes.reduce((s, v) => s + v.stars, 0) / votes.length;
    const user     = window.currentUser;
    const userVote = user ? votes.find(v => v.userId === user.uid) : null;

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

// ── Renderiza apenas o resumo (média) no topo do perfil ───────────
export async function renderRatingBlock(placeId) {
  document.getElementById('ratingBlock')?.remove();

  const { avg, count } = await loadRating(placeId);
  if (avg === 0) return; // sem avaliações → não exibe nada no topo

  const block = document.createElement('div');
  block.id        = 'ratingBlock';
  block.className = 'rating-block';
  block.innerHTML = `
    <div class="rating-summary">
      <div class="rating-avg-row">
        <div class="rating-avg-score">${avg.toFixed(1)}</div>
        <div class="rating-avg-detail">
          <div class="rating-stars-display">${renderStarsDisplay(avg)}</div>
          <div class="rating-count">${count} avaliação${count > 1 ? 'ões' : ''}</div>
        </div>
      </div>
    </div>`;

  const infoGrid = document.getElementById('profileInfoGrid');
  if (infoGrid) infoGrid.before(block);

  window.addEventListener('authChanged', () => {
    renderRatingBlock(placeId);
  }, { once: true });
}

// ── Helpers ────────────────────────────────────────────────────────
function renderStarsDisplay(avg) {
  if (!avg) return [1,2,3,4,5].map(() => `<span class="sdot empty">★</span>`).join('');
  return [1,2,3,4,5].map(i => {
    if (avg >= i)     return `<span class="sdot full">★</span>`;
    if (avg >= i-0.5) return `<span class="sdot half">★</span>`;
    return                   `<span class="sdot empty">★</span>`;
  }).join('');
}

window.renderRatingBlock = renderRatingBlock;
