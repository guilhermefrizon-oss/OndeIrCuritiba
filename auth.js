// ── auth.js ───────────────────────────────────────────────────────
// Gerencia autenticação Google via Firebase Auth

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCz1Ti_twBmtDxGOc9cGiXHBNbFTOdvYAg",
  authDomain: "ondeircuritiba-91390.firebaseapp.com",
  projectId: "ondeircuritiba-91390",
  storageBucket: "ondeircuritiba-91390.firebasestorage.app",
  messagingSenderId: "208330257440",
  appId: "1:208330257440:web:6df311fc5c60c389117845"
};

// Reutiliza app já inicializado se existir
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Estado global do usuário
window.currentUser = null;

// Observa mudanças de autenticação
onAuthStateChanged(auth, (user) => {
  window.currentUser = user;
  updateAvatarUI(user);
  // Notifica outros módulos
  window.dispatchEvent(new CustomEvent('authChanged', { detail: user }));
});

function updateAvatarUI(user) {
  const avatar = document.getElementById('topAvatar');
  if (!avatar) return;
  if (user) {
    if (user.photoURL) {
      avatar.innerHTML = `<img src="${user.photoURL}" alt="${user.displayName}">`;
    } else {
      const initials = (user.displayName || 'U').split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
      avatar.textContent = initials;
    }
    avatar.title = user.displayName || user.email;
  } else {
    avatar.innerHTML = '';
    avatar.textContent = '👤';
    avatar.title = 'Entrar';
  }
}

// Login com Google
async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
    closeAuthModal();
  } catch (e) {
    console.warn('Login falhou:', e.message);
  }
}

// Logout
async function signOutUser() {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Logout falhou:', e);
  }
}

// Modal de autenticação
function showAuthModal() {
  let backdrop = document.getElementById('authModalBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'auth-modal-backdrop';
    backdrop.id = 'authModalBackdrop';
    backdrop.innerHTML = `
      <div class="auth-modal">
        <div class="auth-modal-handle"></div>
        <div class="auth-modal-icon">💬</div>
        <div class="auth-modal-title">Entre para comentar</div>
        <div class="auth-modal-sub">
          Compartilhe sua experiência com outros usuários.<br>
          Faça login com sua conta Google para continuar.
        </div>
        <button class="auth-google-btn" id="authGoogleBtn">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuar com Google
        </button>
        <button class="auth-cancel-btn" id="authCancelBtn">Agora não</button>
      </div>`;
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeAuthModal();
    });
  }

  backdrop.style.display = 'flex';
  document.getElementById('authGoogleBtn').onclick = signInWithGoogle;
  document.getElementById('authCancelBtn').onclick = closeAuthModal;
}

function closeAuthModal() {
  const backdrop = document.getElementById('authModalBackdrop');
  if (backdrop) backdrop.style.display = 'none';
}

// Avatar clicável: se logado mostra opção de sair, se não mostra login
function handleAvatarClick() {
  if (window.currentUser) {
    if (confirm(`Sair da conta ${window.currentUser.displayName || window.currentUser.email}?`)) {
      signOutUser();
    }
  } else {
    showAuthModal();
  }
}

window.signInWithGoogle  = signInWithGoogle;
window.signOutUser       = signOutUser;
window.showAuthModal     = showAuthModal;
window.closeAuthModal    = closeAuthModal;
window.handleAvatarClick = handleAvatarClick;
