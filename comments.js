// ── comments.js ───────────────────────────────────────────────────
// Lógica de comentários por estabelecimento, salvos no Firestore

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCz1Ti_twBmtDxGOc9cGiXHBNbFTOdvYAg",
  authDomain: "ondeircuritiba-91390.firebaseapp.com",
  projectId: "ondeircuritiba-91390",
  storageBucket: "ondeircuritiba-91390.firebasestorage.app",
  messagingSenderId: "208330257440",
  appId: "1:208330257440:web:6df311fc5c60c389117845"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Unsubscribe do listener ativo (evita memory leaks ao trocar de lugar)
let activeUnsubscribe = null;

// Renderiza a seção de comentários dentro do profile-body
function renderCommentsSection(placeId) {
  // Remove seção anterior se existir
  const old = document.getElementById('commentsSection');
  if (old) old.remove();

  const section = document.createElement('div');
  section.className = 'comments-section';
  section.id = 'commentsSection';
  section.innerHTML = `
    <div class="comments-title">💬 Comentários</div>
    <div id="commentInputArea"></div>
    <div class="comment-list" id="commentList">
      <div class="comment-loading"><div class="spinner"></div></div>
    </div>`;

  const profileBody = document.getElementById('profileBody');
  if (profileBody) profileBody.appendChild(section);

  renderCommentInput(placeId);
  subscribeToComments(placeId);
}

// Renderiza o campo de input ou o prompt de login
function renderCommentInput(placeId) {
  const area = document.getElementById('commentInputArea');
  if (!area) return;

  const user = window.currentUser;

  if (user) {
    const photoHTML = user.photoURL
      ? `<img src="${user.photoURL}" alt="">`
      : (user.displayName || 'U').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

    area.innerHTML = `
      <div class="comment-input-wrap">
        <div class="comment-avatar-mini">${user.photoURL ? `<img src="${user.photoURL}" alt="">` : photoHTML}</div>
        <textarea
          class="comment-textarea"
          id="commentTextarea"
          placeholder="Compartilhe sua experiência..."
          rows="1"
          maxlength="500"
        ></textarea>
        <button class="comment-send-btn" id="commentSendBtn" disabled>Enviar</button>
      </div>`;

    const textarea = document.getElementById('commentTextarea');
    const sendBtn  = document.getElementById('commentSendBtn');

    // Auto-resize
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      sendBtn.disabled = textarea.value.trim().length === 0;
    });

    sendBtn.addEventListener('click', () => submitComment(placeId, textarea, sendBtn));
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && textarea.value.trim()) {
        e.preventDefault();
        submitComment(placeId, textarea, sendBtn);
      }
    });
  } else {
    area.innerHTML = `
      <div class="comment-login-prompt">
        <p>Faça login para compartilhar sua experiência com este lugar.</p>
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
  }
}

// Envia comentário ao Firestore
async function submitComment(placeId, textarea, sendBtn) {
  const text = textarea.value.trim();
  if (!text || !window.currentUser) return;

  sendBtn.disabled  = true;
  sendBtn.textContent = '...';

  try {
    await addDoc(collection(db, 'comments', placeId, 'items'), {
      text,
      userId:      window.currentUser.uid,
      userName:    window.currentUser.displayName || 'Usuário',
      userPhoto:   window.currentUser.photoURL || null,
      createdAt:   serverTimestamp()
    });
    textarea.value = '';
    textarea.style.height = 'auto';
    sendBtn.textContent = 'Enviar';
  } catch (e) {
    console.warn('Erro ao enviar comentário:', e);
    sendBtn.textContent = 'Erro';
    setTimeout(() => { sendBtn.textContent = 'Enviar'; sendBtn.disabled = false; }, 2000);
  }
}

// Escuta comentários em tempo real
function subscribeToComments(placeId) {
  if (activeUnsubscribe) activeUnsubscribe();

  const q = query(
    collection(db, 'comments', placeId, 'items'),
    orderBy('createdAt', 'desc')
  );

  activeUnsubscribe = onSnapshot(q, (snap) => {
    const list = document.getElementById('commentList');
    if (!list) return;

    if (snap.empty) {
      list.innerHTML = '<div class="comment-empty">Nenhum comentário ainda. Seja o primeiro! 🙌</div>';
      return;
    }

    list.innerHTML = '';
    snap.forEach(docSnap => {
      const c = docSnap.data();
      const dateStr = c.createdAt?.toDate
        ? formatDate(c.createdAt.toDate())
        : 'agora';

      const initials = (c.userName || 'U').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
      const avatarHTML = c.userPhoto
        ? `<img src="${c.userPhoto}" alt="${c.userName}">`
        : initials;

      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML = `
        <div class="comment-user-avatar">${avatarHTML}</div>
        <div class="comment-bubble">
          <div class="comment-bubble-header">
            <span class="comment-user-name">${escapeHTML(c.userName)}</span>
            <span class="comment-date">${dateStr}</span>
          </div>
          <div class="comment-text">${escapeHTML(c.text)}</div>
        </div>`;
      list.appendChild(item);
    });
  }, (err) => {
    console.warn('Erro ao carregar comentários:', err);
    const list = document.getElementById('commentList');
    if (list) list.innerHTML = '<div class="comment-empty">Não foi possível carregar comentários.</div>';
  });
}

// Limpa listener ao fechar perfil
function unsubscribeComments() {
  if (activeUnsubscribe) {
    activeUnsubscribe();
    activeUnsubscribe = null;
  }
}

// Helpers
function formatDate(date) {
  const now  = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60)   return 'agora';
  if (diff < 3600) return `${Math.floor(diff/60)}min`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h`;
  return date.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
}

function escapeHTML(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Atualiza input quando autenticação muda
window.addEventListener('authChanged', (e) => {
  const placeId = window._currentProfilePlaceId;
  if (placeId) renderCommentInput(placeId);
});

window.renderCommentsSection  = renderCommentsSection;
window.unsubscribeComments    = unsubscribeComments;
