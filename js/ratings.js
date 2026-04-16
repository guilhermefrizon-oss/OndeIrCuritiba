// ── ratings.js ────────────────────────────────────────────────────
// Sistema de avaliação por estrelas (1–5) por lugar
// Regras:
//  - Só usuários logados com Google podem avaliar
//  - Podem reavaliar (sobrescreve nota anterior)
//  - Avaliação EXIGE um comentário junto
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
    await setDoc(
      doc(db, 'ratings', placeId, 'votes', user.uid),
      { stars, userId: user.uid, updatedAt: Date.now() }
    );

    const snap = await getDocs(collection(db, 'ratings', placeId, 'votes'));
    const votes = snap.docs.map(d => d.data().stars);
    const avg   = votes.reduce((s,v) => s+v, 0) / votes.length;
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

    const votes = snap.docs.map(d => d.data());
    const avg   = votes.reduce((s,v) => s+v.stars, 0) / votes.length;

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

// ── Renderiza bloco de rating no profile ──────────────────────────
export async function renderRatingBlock(placeId) {
  document.getElementById('ratingBlock')?.remove();

  const block = document.createElement('div');
  block.id = 'ratingBlock';
  block.className = 'rating-block';
  block.innerHTML = `<div class="rating-loading"><div class="spinner"></div></div>`;

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
      ${hasRating
        ? `<div class="rating-avg-row">
            <div class="rating-avg-score">${avg.toFixed(1)}</div>
            <div class="rating-avg-detail">
              <div class="rating-stars-display">${renderStarsDisplay(avg)}</div>
              <div class="rating-count">${count} avaliação${count > 1 ? 'ões' : ''}</div>
            </div>
          </div>`
        : `<div class="rating-empty-state">
            <div class="rating-empty-stars">${renderStarsDisplay(0)}</div>
            <p class="rating-empty-text">Este estabelecimento ainda não possui avaliações no DayMatch</p>
          </div>`
      }
    </div>

    ${user
      ? `<div class="rating-user-section">
           <div class="rating-user-label">
             ${userStars > 0
               ? `Sua avaliação <span class="rating-user-prev">${userStars}★</span> — alterar:`
               : 'Avalie este lugar:'}
           </div>
           <div class="rating-picker" id="ratingPicker" data-selected="${userStars}" data-pending="0">
             ${[1,2,3,4,5].map(i => `
               <button class="rstar${userStars >= i ? ' on' : ''}"
                       data-val="${i}"
                       onclick="window._handleStarSelect(${i})">★</button>
             `).join('')}
           </div>
           <div class="rating-comment-wrap" id="ratingCommentWrap" style="display:none">
             <textarea class="rating-comment-input" id="ratingCommentInput"
               placeholder="Conta o que achou deste lugar... (obrigatório)" rows="2" maxlength="400"></textarea>
             <div class="rating-comment-actions">
               <button class="rating-cancel-btn" onclick="window._cancelRating('${placeId}')">Cancelar</button>
               <button class="rating-submit-btn" id="ratingSubmitBtn" disabled
                 onclick="window._confirmRating('${placeId}')">Enviar avaliação</button>
             </div>
           </div>
         </div>`
      : `<div class="rating-login-hint">
           <button class="rating-login-btn" onclick="showAuthModal()">
             Faça login para avaliar
           </button>
         </div>`
    }`;

  // Habilita botão enviar conforme digita
  const textarea = document.getElementById('ratingCommentInput');
  if (textarea) {
    textarea.addEventListener('input', () => {
      const btn = document.getElementById('ratingSubmitBtn');
      if (btn) btn.disabled = textarea.value.trim().length === 0;
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    });
  }

  window.addEventListener('authChanged', () => {
    const current = document.getElementById('ratingBlock');
    if (current) renderRatingBlock(placeId);
  }, { once: true });
}

// Seleciona estrelas → mostra área de comentário
window._handleStarSelect = (val) => {
  const picker = document.getElementById('ratingPicker');
  if (!picker) return;
  picker.querySelectorAll('.rstar').forEach((b,i) => {
    b.classList.toggle('on', i < val);
  });
  picker.dataset.pending = val;

  const wrap = document.getElementById('ratingCommentWrap');
  if (wrap) {
    wrap.style.display = 'block';
    document.getElementById('ratingCommentInput')?.focus();
  }
};

// Confirmar avaliação (estrelas + comentário)
window._confirmRating = async (placeId) => {
  const picker  = document.getElementById('ratingPicker');
  const textarea = document.getElementById('ratingCommentInput');
  const val     = parseInt(picker?.dataset.pending || 0);
  const comment = textarea?.value.trim();
  if (!val || !comment) return;

  const btn = document.getElementById('ratingSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  // Salva rating
  const result = await submitRating(placeId, val);

  // Salva comentário com estrelas vinculadas
  try {
    const { db, addDoc, collection, serverTimestamp } = await import('./firebase.js');
    await addDoc(collection(db, 'comments', placeId, 'items'), {
      text:      comment,
      stars:     val,
      userId:    window.currentUser.uid,
      userName:  window.currentUser.displayName || 'Usuário',
      userPhoto: window.currentUser.photoURL || null,
      createdAt: serverTimestamp()
    });
  } catch(e) { console.warn('Erro ao salvar comentário de rating:', e); }

  if (!result) return;
  const block = document.getElementById('ratingBlock');
  if (block) renderRatingHTML(block, placeId, result.avg, result.count, result.userStars);
};

// Cancelar seleção de estrelas
window._cancelRating = (placeId) => {
  const block = document.getElementById('ratingBlock');
  if (!block) return;
  // Recarrega com estado atual (sem pending)
  loadRating(placeId).then(({ avg, count, userStars }) => {
    renderRatingHTML(block, placeId, avg, count, userStars);
  });
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
  const sel = parseInt(picker.dataset.pending || picker.dataset.selected || 0);
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
