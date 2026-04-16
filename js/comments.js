// ── comments.js ───────────────────────────────────────────────────
// Seção unificada de avaliação + comentário.
// Estrelas são opcionais; comentário é obrigatório para enviar.
// Se estrelas forem selecionadas, chama submitRating() de ratings.js.

import {
  db,
  addDoc, collection, query, orderBy, onSnapshot, serverTimestamp
} from './firebase.js';
import { loadRating, submitRating } from './ratings.js';

let activeUnsubscribe = null;

// ── Ponto de entrada ───────────────────────────────────────────────
export function renderCommentsSection(placeId) {
  const old = document.getElementById('commentsSection');
  if (old) old.remove();

  const section = document.createElement('div');
  section.className = 'comments-section';
  section.id = 'commentsSection';
  section.innerHTML = `
    <div class="comments-title">⭐ Avalie e comente</div>
    <div id="commentInputArea"></div>
    <div class="comment-list" id="commentList">
      <div class="comment-loading"><div class="spinner"></div></div>
    </div>`;

  const profileBody = document.getElementById('profileBody');
  if (profileBody) profileBody.appendChild(section);

  renderCommentInput(placeId);
  subscribeToComments(placeId);
}

// ── Input area (async: carrega nota existente do usuário) ──────────
async function renderCommentInput(placeId) {
  const area = document.getElementById('commentInputArea');
  if (!area) return;
  const user = window.currentUser;

  if (!user) {
    area.innerHTML = `
      <div class="comment-login-prompt">
        <p>Faça login para avaliar e comentar este lugar.</p>
        <button class="login-google-btn" onclick="showAuthModal()">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Entrar com Google
        </button>
      </div>`;
    return;
  }

  // Renderiza imediatamente com 0 estrelas; atualiza depois
  buildUnifiedInput(area, placeId, 0);

  const { userStars } = await loadRating(placeId);
  if (userStars > 0) {
    const picker = document.getElementById('uStarPicker');
    const label  = area.querySelector('.unified-stars-label');
    if (picker) {
      picker.dataset.pending = userStars;
      picker.querySelectorAll('.rstar').forEach((b, i) => b.classList.toggle('on', i < userStars));
    }
    if (label) label.textContent = `Sua nota: ${userStars}★ — alterar:`;
  }
}

// ── Monta o card unificado (estrelas + caixa de texto) ─────────────
function buildUnifiedInput(area, placeId, initialStars) {
  const user = window.currentUser;
  const avatarHTML = user.photoURL
    ? `<img src="${user.photoURL}" alt="">`
    : (user.displayName || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  area.innerHTML = `
    <div class="unified-review-wrap">
      <div class="unified-stars-row">
        <span class="unified-stars-label">Sua nota (opcional):</span>
        <div class="unified-star-picker" id="uStarPicker" data-pending="0">
          ${[1,2,3,4,5].map(i => `<button class="rstar" data-val="${i}" type="button">★</button>`).join('')}
        </div>
      </div>
      <div class="unified-comment-row">
        <div class="comment-avatar-mini">${avatarHTML}</div>
        <textarea class="comment-textarea" id="commentTextarea"
          placeholder="Conta o que achou deste lugar..." rows="1" maxlength="500"></textarea>
        <button class="comment-send-btn" id="commentSendBtn" disabled>Enviar</button>
      </div>
    </div>`;

  const picker   = document.getElementById('uStarPicker');
  const textarea = document.getElementById('commentTextarea');
  const sendBtn  = document.getElementById('commentSendBtn');

  // ── Lógica do picker de estrelas ──────────────────────────────
  picker.addEventListener('click', e => {
    const btn = e.target.closest('.rstar');
    if (!btn) return;
    const val = parseInt(btn.dataset.val);
    picker.dataset.pending = val;
    picker.querySelectorAll('.rstar').forEach((b, i) => b.classList.toggle('on', i < val));
    const label = area.querySelector('.unified-stars-label');
    if (label) label.textContent = `Sua nota: ${val}★`;
  });
  picker.addEventListener('mouseover', e => {
    const btn = e.target.closest('.rstar');
    if (!btn) return;
    const val = parseInt(btn.dataset.val);
    picker.querySelectorAll('.rstar').forEach((b, i) => b.classList.toggle('hover', i < val));
  });
  picker.addEventListener('mouseout', () => {
    const pending = parseInt(picker.dataset.pending || 0);
    picker.querySelectorAll('.rstar').forEach((b, i) => {
      b.classList.remove('hover');
      b.classList.toggle('on', i < pending);
    });
  });

  // ── Lógica do textarea ────────────────────────────────────────
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    sendBtn.disabled = textarea.value.trim().length === 0;
  });

  const doSubmit = () => submitUnifiedReview(placeId, textarea, sendBtn, picker, area);
  sendBtn.addEventListener('click', doSubmit);
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && textarea.value.trim()) {
      e.preventDefault();
      doSubmit();
    }
  });
}

// ── Envio unificado (rating opcional + comentário) ─────────────────
async function submitUnifiedReview(placeId, textarea, sendBtn, picker, area) {
  const text  = textarea.value.trim();
  const stars = parseInt(picker?.dataset.pending || 0);
  if (!text || !window.currentUser) return;

  sendBtn.disabled    = true;
  sendBtn.textContent = '...';

  try {
    if (stars > 0) {
      await submitRating(placeId, stars);
    }
    await addDoc(collection(db, 'comments', placeId, 'items'), {
      text,
      stars:     stars || null,
      userId:    window.currentUser.uid,
      userName:  window.currentUser.displayName || 'Usuário',
      userPhoto: window.currentUser.photoURL || null,
      createdAt: serverTimestamp()
    });

    textarea.value = '';
    textarea.style.height = 'auto';
    sendBtn.textContent = 'Enviar';

    // Atualiza label de estrelas pós-envio
    const label = area?.querySelector('.unified-stars-label');
    if (label && stars > 0) label.textContent = `Sua nota: ${stars}★ — alterar:`;

    // Atualiza o bloco de resumo (topo do perfil)
    if (stars > 0 && typeof window.renderRatingBlock === 'function') {
      window.renderRatingBlock(placeId);
    }
  } catch (e) {
    console.warn('Erro ao enviar:', e);
    sendBtn.textContent = 'Erro';
    setTimeout(() => { sendBtn.textContent = 'Enviar'; sendBtn.disabled = false; }, 2000);
  }
}

// ── Listener de comentários em tempo real ─────────────────────────
function subscribeToComments(placeId) {
  if (activeUnsubscribe) activeUnsubscribe();
  const q = query(
    collection(db, 'comments', placeId, 'items'),
    orderBy('createdAt', 'desc')
  );
  activeUnsubscribe = onSnapshot(q, snap => {
    const list = document.getElementById('commentList');
    if (!list) return;
    if (snap.empty) {
      list.innerHTML = '<div class="comment-empty">Nenhum comentário ainda. Seja o primeiro! 🙌</div>';
      return;
    }
    list.innerHTML = '';
    snap.forEach(docSnap => {
      const c        = docSnap.data();
      const dateStr  = c.createdAt?.toDate ? formatDate(c.createdAt.toDate()) : 'agora';
      const initials = (c.userName || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      const avatar   = c.userPhoto ? `<img src="${c.userPhoto}" alt="${esc(c.userName)}">` : initials;
      const starsHTML = c.stars
        ? `<span class="comment-stars">${'★'.repeat(c.stars)}${'★'.repeat(5 - c.stars).replace(/★/g,'<span style="opacity:.3">★</span>')}</span>`
        : '';
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML = `
        <div class="comment-user-avatar">${avatar}</div>
        <div class="comment-bubble">
          <div class="comment-bubble-header">
            <span class="comment-user-name">${esc(c.userName)}</span>
            <span class="comment-date">${dateStr}</span>
          </div>
          ${starsHTML}
          <div class="comment-text">${esc(c.text)}</div>
        </div>`;
      list.appendChild(item);
    });
  }, err => {
    console.warn('Erro ao carregar comentários:', err);
    const list = document.getElementById('commentList');
    if (list) list.innerHTML = '<div class="comment-empty">Não foi possível carregar comentários.</div>';
  });
}

export function unsubscribeComments() {
  if (activeUnsubscribe) { activeUnsubscribe(); activeUnsubscribe = null; }
}

// ── Helpers ────────────────────────────────────────────────────────
function formatDate(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)    return 'agora';
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Atualiza input quando auth muda (login/logout)
window.addEventListener('authChanged', () => {
  const placeId = window._currentProfilePlaceId;
  if (placeId) renderCommentInput(placeId);
});

window.renderCommentsSection = renderCommentsSection;
window.unsubscribeComments   = unsubscribeComments;
