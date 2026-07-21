// ── comments.js ───────────────────────────────────────────────────
// Seção de avaliação + comentário (com foto opcional).
// Estrelas são opcionais; comentário é obrigatório para enviar.
// Se estrelas forem selecionadas, chama submitRating() de ratings.js.

import {
  db, doc, deleteDoc,
  addDoc, collection, query, orderBy, onSnapshot, serverTimestamp
} from './firebase.js';
import { ic } from './icons.js';
import { loadRating, submitRating } from './ratings.js';
import { awardXp } from './xp.js';
import { checkAndAwardBadges } from './badges.js';

let activeUnsubscribe = null;
let pendingPhoto = null; // data URL da foto anexada ao comentário em digitação

// ── Ponto de entrada ───────────────────────────────────────────────
export function renderCommentsSection(placeId) {
  const old = document.getElementById('commentsSection');
  if (old) old.remove();
  pendingPhoto = null;

  const section = document.createElement('div');
  section.className = 'comments-section';
  section.id = 'commentsSection';
  section.innerHTML = `
    <div class="comments-title">${ic('message-circle', 16)} Avaliações e comentários</div>
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

// ── Monta o card unificado (estrelas + texto + foto) ───────────────
function buildUnifiedInput(area, placeId, initialStars) {
  const user = window.currentUser;
  pendingPhoto = null;
  const avatarHTML = user.photoURL
    ? `<img src="${esc(user.photoURL)}" alt="">`
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
      </div>
      <div class="unified-photo-preview" id="uPhotoPreview" style="display:none"></div>
      <div class="unified-actions">
        <button class="comment-photo-btn" id="commentPhotoBtn" type="button" title="Adicionar foto">
          ${ic('camera', 16)} <span>Foto</span>
        </button>
        <input type="file" id="commentPhotoInput" accept="image/*" style="display:none">
        <button class="comment-send-btn" id="commentSendBtn" disabled>Enviar</button>
      </div>
    </div>`;

  const picker    = document.getElementById('uStarPicker');
  const textarea  = document.getElementById('commentTextarea');
  const sendBtn   = document.getElementById('commentSendBtn');
  const photoBtn  = document.getElementById('commentPhotoBtn');
  const photoInput= document.getElementById('commentPhotoInput');
  const preview   = document.getElementById('uPhotoPreview');

  const refreshSend = () => {
    sendBtn.disabled = textarea.value.trim().length === 0;
  };

  // ── Picker de estrelas ────────────────────────────────────────
  picker.addEventListener('click', e => {
    const btn = e.target.closest('.rstar');
    if (!btn) return;
    const val = parseInt(btn.dataset.val);
    picker.dataset.pending = val;
    picker.querySelectorAll('.rstar').forEach((b, i) => b.classList.toggle('on', i < val));
    const label = area.querySelector('.unified-stars-label');
    if (label) label.textContent = `Sua nota: ${val}★`;
  });

  // ── Textarea ──────────────────────────────────────────────────
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    refreshSend();
  });

  // ── Foto ──────────────────────────────────────────────────────
  photoBtn.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    photoInput.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { window.showToast?.('Selecione uma imagem.', 'error'); return; }
    try {
      preview.style.display = 'block';
      preview.innerHTML = '<div class="upp-loading">Processando foto…</div>';
      pendingPhoto = await resizeImageMax(file, 900, 380000);
      preview.innerHTML = `
        <div class="upp-thumb">
          <img src="${pendingPhoto}" alt="">
          <button class="upp-remove" type="button" title="Remover foto">${ic('x', 14)}</button>
        </div>`;
      preview.querySelector('.upp-remove').addEventListener('click', () => {
        pendingPhoto = null; preview.style.display = 'none'; preview.innerHTML = '';
      });
    } catch (e) {
      console.warn('resize foto comentário:', e);
      pendingPhoto = null; preview.style.display = 'none'; preview.innerHTML = '';
      window.showToast?.('Não consegui processar a foto.', 'error');
    }
  });

  // ── Enviar ────────────────────────────────────────────────────
  const doSubmit = () => submitUnifiedReview(placeId, textarea, sendBtn, picker, area, preview);
  sendBtn.addEventListener('click', doSubmit);
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && textarea.value.trim()) {
      e.preventDefault();
      doSubmit();
    }
  });
}

// ── Envio unificado (rating opcional + comentário + foto opcional) ─
async function submitUnifiedReview(placeId, textarea, sendBtn, picker, area, preview) {
  const text  = textarea.value.trim().slice(0, 500);
  const stars = parseInt(picker?.dataset.pending || 0);
  if (!text || !window.currentUser) return;

  sendBtn.disabled    = true;
  sendBtn.textContent = '...';

  try {
    if (stars > 0) await submitRating(placeId, stars);

    const payload = {
      text,
      stars:     stars || null,
      userId:    window.currentUser.uid,
      userName:  window.currentUser.displayName || 'Usuário',
      userPhoto: window.currentUser.photoURL || null,
      createdAt: serverTimestamp()
    };
    if (pendingPhoto) payload.photo = pendingPhoto; // só inclui se houver foto

    await addDoc(collection(db, 'comments', placeId, 'items'), payload);

    // Limpa o formulário
    textarea.value = '';
    textarea.style.height = 'auto';
    pendingPhoto = null;
    if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
    sendBtn.textContent = 'Enviar';

    awardXp('comment', { placeId });
    checkAndAwardBadges();

    const label = area?.querySelector('.unified-stars-label');
    if (label && stars > 0) label.textContent = `Sua nota: ${stars}★ — alterar:`;
    if (stars > 0 && typeof window.renderRatingBlock === 'function') window.renderRatingBlock(placeId);
  } catch (e) {
    console.warn('Erro ao enviar:', e);
    sendBtn.textContent = 'Erro';
    setTimeout(() => { sendBtn.textContent = 'Enviar'; sendBtn.disabled = false; }, 2000);
  }
}

// ── Listener de comentários em tempo real ─────────────────────────
function subscribeToComments(placeId) {
  if (activeUnsubscribe) activeUnsubscribe();
  const q = query(collection(db, 'comments', placeId, 'items'), orderBy('createdAt', 'desc'));
  activeUnsubscribe = onSnapshot(q, snap => {
    const list = document.getElementById('commentList');
    if (!list) return;
    if (snap.empty) {
      list.innerHTML = '<div class="comment-empty">Nenhum comentário ainda. Seja o primeiro!</div>';
      return;
    }
    list.innerHTML = '';
    snap.forEach(docSnap => list.appendChild(buildCommentCard(placeId, docSnap.id, docSnap.data())));
  }, err => {
    console.warn('Erro ao carregar comentários:', err);
    const list = document.getElementById('commentList');
    if (list) list.innerHTML = '<div class="comment-empty">Não foi possível carregar comentários.</div>';
  });
}

// ── Card de um comentário ──────────────────────────────────────────
function buildCommentCard(placeId, commentId, c) {
  const dateStr  = c.createdAt?.toDate ? formatDate(c.createdAt.toDate()) : 'agora';
  const initials = (c.userName || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const photoOk  = typeof c.userPhoto === 'string' && /^https:\/\//i.test(c.userPhoto);
  const avatar   = photoOk ? `<img src="${esc(c.userPhoto)}" alt="${esc(c.userName)}">` : initials;
  const isMine   = window.currentUser && c.userId === window.currentUser.uid;

  const starsHTML = c.stars
    ? `<div class="cm-stars">${'★'.repeat(c.stars)}<span class="cm-stars-off">${'★'.repeat(5 - c.stars)}</span></div>`
    : '';

  // Foto do comentário: aceita data URL de imagem ou https
  const cPhotoOk = typeof c.photo === 'string' && /^(data:image\/|https:\/\/)/i.test(c.photo);
  const photoHTML = cPhotoOk
    ? `<div class="cm-photo"><img src="${esc(c.photo)}" alt="Foto do comentário" loading="lazy"></div>`
    : '';

  const item = document.createElement('div');
  item.className = 'cm-item';
  item.innerHTML = `
    <div class="cm-top">
      <div class="cm-avatar">${avatar}</div>
      <div class="cm-name">${esc(c.userName)}</div>
      ${starsHTML}
    </div>
    <div class="cm-body">
      ${photoHTML}
      <div class="cm-text">${esc(c.text)}</div>
    </div>
    <div class="cm-foot"><span class="cm-time">${dateStr}</span></div>`;

  // Expandir texto/foto ao tocar no corpo (não na foto — a foto abre o zoom)
  const body = item.querySelector('.cm-body');
  const textEl = item.querySelector('.cm-text');
  body.addEventListener('click', (e) => {
    if (e.target.closest('.cm-photo')) return;      // clique na foto → lightbox
    if (item._wasLongPress) { item._wasLongPress = false; return; }
    item.classList.toggle('expanded');
  });
  // marca se o texto é grande (pra mostrar o "ver mais")
  requestAnimationFrame(() => {
    if (textEl.scrollHeight > textEl.clientHeight + 4) item.classList.add('cm-clampable');
  });

  // Clique na foto → lightbox
  const photoEl = item.querySelector('.cm-photo img');
  if (photoEl) photoEl.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(photoEl.src); });

  // Segurar (long-press) → menu Denunciar / Excluir
  attachLongPress(item, () => showCommentMenu(item, placeId, commentId, c, isMine));

  return item;
}

// ── Long-press (toque/mouse) ───────────────────────────────────────
function attachLongPress(el, onLongPress, ms = 480) {
  let timer = null, sx = 0, sy = 0;
  const start = (x, y) => {
    sx = x; sy = y; el._wasLongPress = false;
    timer = setTimeout(() => { el._wasLongPress = true; onLongPress(); }, ms);
  };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('touchstart', (e) => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  el.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) cancel();
  }, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
  // Desktop: mouse
  el.addEventListener('mousedown', (e) => start(e.clientX, e.clientY));
  el.addEventListener('mousemove', (e) => { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) cancel(); });
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
  // Botão direito também abre o menu (desktop)
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); el._wasLongPress = true; onLongPress(); });
}

// ── Menu de ações do comentário (long-press) ───────────────────────
function showCommentMenu(item, placeId, commentId, c, isMine) {
  closeCommentMenu();
  const bd = document.createElement('div');
  bd.className = 'cm-menu-backdrop';
  bd.id = 'cmMenuBackdrop';
  bd.innerHTML = `
    <div class="cm-menu">
      ${isMine
        ? `<button class="cm-menu-item danger" data-act="delete">${ic('trash', 16)} Excluir comentário</button>`
        : `<button class="cm-menu-item danger" data-act="report">${ic('alert', 16)} Denunciar comentário</button>`}
      <button class="cm-menu-item" data-act="cancel">Cancelar</button>
    </div>`;
  document.body.appendChild(bd);
  if (window.navigator?.vibrate) { try { navigator.vibrate(12); } catch {} }

  bd.addEventListener('click', (e) => {
    const btn = e.target.closest('.cm-menu-item');
    if (!btn && e.target === bd) { closeCommentMenu(); return; }
    if (!btn) return;
    const act = btn.dataset.act;
    closeCommentMenu();
    if (act === 'report') reportComment(placeId, commentId, c);
    else if (act === 'delete') deleteComment(placeId, commentId);
  });
}
function closeCommentMenu() {
  document.getElementById('cmMenuBackdrop')?.remove();
}

// ── Lightbox (foto ampliada) ───────────────────────────────────────
function openLightbox(src) {
  const bd = document.createElement('div');
  bd.className = 'cm-lightbox';
  bd.innerHTML = `<img src="${esc(src)}" alt=""><button class="cm-lightbox-close" aria-label="Fechar">${ic('x', 22)}</button>`;
  bd.addEventListener('click', () => bd.remove());
  document.body.appendChild(bd);
}

// ── Denúncia de comentário ─────────────────────────────────────────
async function reportComment(placeId, commentId, c) {
  if (!window.currentUser) { window.showAuthModal?.(); return; }
  if (!confirm('Denunciar este comentário como impróprio?')) return;
  try {
    await addDoc(collection(db, 'comment_reports'), {
      placeId,
      commentId,
      commentText:     (c.text || '').slice(0, 300),
      commentUserId:   c.userId || null,
      commentUserName: c.userName || null,
      reporterId:      window.currentUser.uid,
      status:          'pending',
      createdAt:       serverTimestamp()
    });
    window.showToast?.('Denúncia enviada. Obrigado!', true);
  } catch (e) {
    console.warn('Erro ao denunciar:', e);
    window.showToast?.('Não consegui enviar a denúncia.', 'error');
  }
}

// ── Excluir o próprio comentário ───────────────────────────────────
async function deleteComment(placeId, commentId) {
  if (!confirm('Excluir seu comentário?')) return;
  try {
    await deleteDoc(doc(db, 'comments', placeId, 'items', commentId));
    window.showToast?.('Comentário excluído.', true);
  } catch (e) {
    console.warn('Erro ao excluir:', e);
    window.showToast?.('Não consegui excluir agora.', 'error');
  }
}

export function unsubscribeComments() {
  if (activeUnsubscribe) { activeUnsubscribe(); activeUnsubscribe = null; }
  closeCommentMenu();
}

// ── Helpers ────────────────────────────────────────────────────────
function formatDate(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)    return 'agora';
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  if (days < 7)     return `${days}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Redimensiona a imagem mantendo proporção (lado maior = maxDim) e reduz a
// qualidade até caber em maxBytes (tamanho aproximado do data URL).
function resizeImageMax(file, maxDim = 900, maxBytes = 380000) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height > maxDim)             { width  = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        let q = 0.72, url = canvas.toDataURL('image/jpeg', q);
        while (url.length > maxBytes && q > 0.4) { q -= 0.1; url = canvas.toDataURL('image/jpeg', q); }
        resolve(url);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Atualiza input quando auth muda (login/logout)
window.addEventListener('authChanged', () => {
  const placeId = window._currentProfilePlaceId;
  if (placeId) renderCommentInput(placeId);
});

window.renderCommentsSection = renderCommentsSection;
window.unsubscribeComments   = unsubscribeComments;
