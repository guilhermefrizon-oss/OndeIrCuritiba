// ── auth.js ───────────────────────────────────────────────────────
import {
  auth, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged
} from './firebase.js';
import { getAdditionalUserInfo } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { ic } from './icons.js';

import {
  db, doc, getDoc, setDoc, collection, getDocs, query
} from './firebase.js';
import { loadUserXp, getLevelInfo } from './xp.js';
import { loadUserBadges, renderBadges } from './badges.js';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  deleteUser,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider,
  OAuthProvider,
  signInWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const provider = new GoogleAuthProvider();

// ── Login nativo (Capacitor) ───────────────────────────────────────
// Dentro do app nativo (Android/iOS), o signInWithPopup da web não roda em
// WebView. Usamos o plugin @capacitor-firebase/authentication (acessado pelo
// runtime global do Capacitor — não há bundler aqui) para o login nativo do
// Google/Apple e completamos no SDK JS via signInWithCredential, que é o que
// o resto do app (Firestore) usa. Na PWA, isNative() é false e nada muda.
function isNative() {
  const C = window.Capacitor;
  return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
}

async function nativeSocialSignIn(kind) {
  const FA = window.Capacitor?.Plugins?.FirebaseAuthentication;
  if (!FA) throw new Error('Plugin FirebaseAuthentication indisponível no app nativo.');
  if (kind === 'apple') {
    const res = await FA.signInWithApple();
    const idToken  = res?.credential?.idToken;
    const rawNonce = res?.credential?.nonce;
    if (!idToken) throw new Error('Sem idToken da Apple.');
    const cred = new OAuthProvider('apple.com').credential({ idToken, rawNonce });
    return signInWithCredential(auth, cred);
  }
  const res = await FA.signInWithGoogle();
  const idToken = res?.credential?.idToken;
  if (!idToken) throw new Error('Sem idToken do Google.');
  return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

// Cancelamento do usuário no seletor nativo: não é erro pra mostrar.
function isNativeCancel(e) {
  const m = String(e?.message || e?.code || '').toLowerCase();
  return m.includes('cancel') || m.includes('canceled') || m.includes('cancelled');
}

// Sign in with Apple. Exigido pela Apple (diretriz 4.8) quando há login
// social. Para funcionar, é preciso: (1) ter conta no Apple Developer
// Program e criar um Services ID + chave; (2) habilitar o provedor "Apple"
// no Firebase (Authentication → Sign-in method). Até lá, o botão fica atrás
// da flag FEATURES.appleSignIn (desligada), então não aparece quebrado.
const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');
window.currentUser = null;

// Foto de perfil enviada pela pessoa (guardada no Firestore como data URL).
// Tem prioridade sobre a foto do Google.
window._customPhoto = null;

onAuthStateChanged(auth, async (user) => {
  window.currentUser = user;
  window._customPhoto = null;
  updateAvatarUI(user);
  if (user) {
    await _migrateFavoritesIfNeeded(user);
    _loadCustomPhoto(user); // assíncrono, atualiza o avatar quando chega
    _recordUserMeta(user);  // registra o acesso p/ as métricas do admin
  }
  window.dispatchEvent(new CustomEvent('authChanged', { detail: user }));
});

// Registra um docinho por usuário em users_meta/{uid} só para as métricas
// do admin: quando a conta foi criada (createdAt, vindo do próprio Firebase
// Auth — backfill correto de quem já existia) e a última vez que abriu o app
// (lastSeen). Não guarda nada sensível além de nome/e-mail que o app já usa.
async function _recordUserMeta(user) {
  try {
    await setDoc(doc(db, 'users_meta', user.uid), {
      email:     user.email || '',
      name:      user.displayName || '',
      provider:  user.providerData?.[0]?.providerId || 'password',
      createdAt: user.metadata?.creationTime
                   ? new Date(user.metadata.creationTime).toISOString()
                   : new Date().toISOString(),
      lastSeen:  new Date().toISOString(),
    }, { merge: true });
  } catch (e) { console.warn('_recordUserMeta:', e); }
}

// Foto efetiva do usuário: a que ela enviou > a do Google.
function effectivePhoto(user) {
  return window._customPhoto || (user && user.photoURL) || '';
}

async function _loadCustomPhoto(user) {
  try {
    const snap = await getDoc(doc(db, 'user_profiles', user.uid));
    const data = snap.exists() ? snap.data() : null;
    if (data?.photoDataUrl) { window._customPhoto = data.photoDataUrl; updateAvatarUI(user); }
    // Sincroniza os interesses (o baralho lê do localStorage) e, se a pessoa
    // ainda não começou a navegar, re-personaliza o feed na hora.
    const interests = Array.isArray(data?.interests) ? data.interests : [];
    try {
      const prev = localStorage.getItem('cwb_interests');
      const next = JSON.stringify(interests);
      if (prev !== next) { localStorage.setItem('cwb_interests', next); window._reshuffleDeck?.(); }
    } catch {}
  } catch (e) { console.warn('_loadCustomPhoto:', e); }
}

// Conclui o login quando voltamos de um signInWithRedirect (celular/webview).
// onAuthStateChanged já cuida do estado; aqui só fechamos o modal e logamos erros.
getRedirectResult(auth)
  .then(res => { if (res && res.user) closeAuthModal(); })
  .catch(e => console.warn('getRedirectResult:', e.code, e.message));

async function _migrateFavoritesIfNeeded(user) {
  const anonUid = localStorage.getItem('cwb_uid');
  if (!anonUid || anonUid === user.uid) return;
  try {
    const snap = await getDocs(collection(db, 'favorites', anonUid, 'places'));
    if (snap.empty) { localStorage.setItem('cwb_uid', user.uid); return; }
    const writes = snap.docs.map(d =>
      setDoc(doc(db, 'favorites', user.uid, 'places', d.id), d.data())
    );
    await Promise.all(writes);
    localStorage.setItem('cwb_uid', user.uid);
  } catch (e) {
    console.warn('_migrateFavoritesIfNeeded:', e);
  }
}

function updateAvatarUI(user) {
  const avatar = document.getElementById('topAvatar');
  if (!avatar) return;
  if (user) {
    const photo = effectivePhoto(user);
    avatar.innerHTML = photo
      ? `<img src="${photo}" alt="${user.displayName}">`
      : getInitials(user);
    avatar.title = user.displayName || user.email;
  } else {
    avatar.innerHTML = '';
    avatar.innerHTML = ic('user', 18);
    avatar.title = 'Entrar';
  }
}

function getInitials(user) {
  const name = user.displayName || user.email || 'U';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

// Alguns ambientes não suportam popup (webview do Instagram/Facebook,
// alguns navegadores mobile, bloqueadores). Nesses casos caímos para o
// fluxo de redirect, que funciona em qualquer lugar.
const POPUP_UNSUPPORTED = [
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
  'auth/internal-error',
];

export async function signInWithGoogle() {
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.style.display = 'none';
  if (isNative()) {
    try {
      const result = await nativeSocialSignIn('google');
      closeAuthModal();
      if (getAdditionalUserInfo(result)?.isNewUser) showProfileEditor(result.user, { onboarding: true });
    } catch (e) {
      if (isNativeCancel(e)) return;
      console.warn('Login Google nativo falhou:', e?.code, e?.message);
      if (errEl) showErr(errEl, _friendlyError(e?.code));
    }
    return;
  }
  try {
    const result = await signInWithPopup(auth, provider);
    closeAuthModal();
    if (getAdditionalUserInfo(result)?.isNewUser) showProfileEditor(result.user, { onboarding: true });
  } catch (e) {
    console.warn('Login popup falhou:', e.code, e.message);
    // Usuário fechou/cancelou o popup: não faz nada (não força redirect).
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    // Popup indisponível no ambiente → tenta redirect (sai da página e volta logado).
    if (POPUP_UNSUPPORTED.includes(e.code)) {
      try { await signInWithRedirect(auth, provider); return; }
      catch (e2) {
        console.warn('Login redirect falhou:', e2.code, e2.message);
        if (errEl) showErr(errEl, 'Não foi possível entrar com o Google aqui. Use o e-mail e senha abaixo.');
        return;
      }
    }
    if (errEl) showErr(errEl, _friendlyError(e.code));
  }
}

export async function signInWithApple() {
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.style.display = 'none';
  if (isNative()) {
    try {
      const result = await nativeSocialSignIn('apple');
      closeAuthModal();
      if (getAdditionalUserInfo(result)?.isNewUser) showProfileEditor(result.user, { onboarding: true });
    } catch (e) {
      if (isNativeCancel(e)) return;
      console.warn('Login Apple nativo falhou:', e?.code, e?.message);
      if (e?.code === 'auth/account-exists-with-different-credential') {
        if (errEl) showErr(errEl, 'Este e-mail já tem conta por outro método. Entre com Google ou e-mail/senha.');
        return;
      }
      if (errEl) showErr(errEl, _friendlyError(e?.code));
    }
    return;
  }
  try {
    const result = await signInWithPopup(auth, appleProvider);
    closeAuthModal();
    if (getAdditionalUserInfo(result)?.isNewUser) showProfileEditor(result.user, { onboarding: true });
  } catch (e) {
    console.warn('Login Apple falhou:', e.code, e.message);
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    // Mesmo e-mail já cadastrado por outro método (Google/senha).
    if (e.code === 'auth/account-exists-with-different-credential') {
      if (errEl) showErr(errEl, 'Este e-mail já tem conta por outro método. Entre com Google ou e-mail/senha.');
      return;
    }
    // Popup indisponível → tenta redirect.
    if (POPUP_UNSUPPORTED.includes(e.code)) {
      try { await signInWithRedirect(auth, appleProvider); return; }
      catch (e2) {
        console.warn('Redirect Apple falhou:', e2.code, e2.message);
        if (errEl) showErr(errEl, 'Não foi possível entrar com a Apple aqui. Use o e-mail e senha abaixo.');
        return;
      }
    }
    if (errEl) showErr(errEl, _friendlyError(e.code));
  }
}

export async function signUpWithEmail(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
  // Envia o e-mail de confirmação (não bloqueia o uso; é um lembrete).
  try { await sendEmailVerification(cred.user); } catch (e) { console.warn('sendEmailVerification:', e); }
  closeAuthModal();
  showProfileEditor(cred.user, { onboarding: true });
  window.dmToast && window.dmToast(`Enviamos um link de confirmação para ${email}. Confira sua caixa de entrada.`, true);
  return cred.user;
}

// Reenvia o e-mail de verificação (usado no perfil quando não confirmado).
export async function resendVerification(user) {
  user = user || auth.currentUser;
  if (!user) return;
  try {
    await sendEmailVerification(user);
    window.dmToast && window.dmToast('Link reenviado! Confira sua caixa de entrada (e o spam).', true);
  } catch (e) {
    window.dmToast && window.dmToast('Não consegui reenviar agora. Tente em instantes.');
  }
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  closeAuthModal();
  return cred.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  try { localStorage.removeItem('cwb_interests'); } catch {}
  window._reshuffleDeck?.(true);
  try { await signOut(auth); }
  catch (e) { console.warn('Logout falhou:', e); }
}

// ── Exclusão de conta (exigência de Apple/Google e da LGPD) ─────────
// Apaga todos os dados do usuário no Firestore e remove a conta de
// autenticação. Como é destrutivo e irreversível, pede confirmação
// explícita. Trata "requires-recent-login" reautenticando conforme o
// tipo de conta (Google via popup, e-mail/senha via credencial).
async function _reauth(user) {
  const providers = user.providerData.map(p => p.providerId);
  if (providers.includes('google.com')) {
    await reauthenticateWithPopup(user, provider);
    return;
  }
  if (providers.includes('apple.com')) {
    await reauthenticateWithPopup(user, appleProvider);
    return;
  }
  const pwd = prompt('Para confirmar a exclusão, digite sua senha:');
  if (!pwd) throw new Error('cancelado');
  const cred = EmailAuthProvider.credential(user.email, pwd);
  await reauthenticateWithCredential(user, cred);
}

export async function deleteAccount(user) {
  user = user || auth.currentUser;
  if (!user) return;

  const ok = confirm(
    'Excluir sua conta?\n\n' +
    'Isso apaga PERMANENTEMENTE seu perfil, favoritos, lugares salvos, ' +
    '"quero ir", visitados, avaliações e todo o seu histórico. ' +
    'Esta ação não pode ser desfeita.'
  );
  if (!ok) return;

  const doDelete = async () => {
    // 1) Apaga os dados no Firestore (exposto por store.js).
    if (window.fsDeleteAllUserData) await window.fsDeleteAllUserData(user.uid);
    // 2) Remove a conta de autenticação.
    await deleteUser(user);
    // 3) Limpa o ID anônimo e os interesses locais, e recarrega.
    try { localStorage.removeItem('cwb_uid'); localStorage.removeItem('cwb_interests'); } catch {}
  };

  try {
    await doDelete();
  } catch (e) {
    if (e && e.code === 'auth/requires-recent-login') {
      // Sessão antiga → reautentica e tenta de novo.
      try {
        await _reauth(user);
        await doDelete();
      } catch (e2) {
        if (e2 && e2.message === 'cancelado') return;
        alert('Não foi possível excluir a conta: ' + (e2?.message || e2));
        return;
      }
    } else {
      alert('Não foi possível excluir a conta: ' + (e?.message || e));
      return;
    }
  }

  alert('Sua conta e todos os seus dados foram excluídos.');
  location.reload();
}

// ── Auth Modal ─────────────────────────────────────────────────────
export function showAuthModal(reason = 'default') {
  let bd = document.getElementById('authModalBackdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.className = 'auth-modal-backdrop';
    bd.id = 'authModalBackdrop';
    document.body.appendChild(bd);
    bd.addEventListener('click', e => { if (e.target === bd) closeAuthModal(); });
  }

  const reasons = {
    like:    { icon: ic('heart', 30, 1.7),          title: 'Guarde seus lugares',    sub: 'Crie sua conta pra salvar onde você quer ir e não perder nenhum rolê. É grátis e rápido.' },
    save:    { icon: ic('bookmark', 30, 1.7),       title: 'Salve pra depois',       sub: 'Sua lista de lugares fica no seu perfil, disponível em qualquer aparelho. É grátis.' },
    comment: { icon: ic('message-circle', 30, 1.7), title: 'Deixe um comentário',    sub: 'Compartilhe sua experiência com quem também tá decidindo onde ir.' },
    default: { icon: ic('sparkles', 30, 1.7),       title: 'Entre na sua conta',     sub: 'Salve lugares, monte seu rolê de hoje e continue de onde parou.' },
  };
  const r = reasons[reason] || reasons.default;

  bd.innerHTML = `
    <div class="auth-modal" id="authModal">
      <div class="auth-modal-handle"></div>

      <div id="authViewLogin" class="auth-view">
        <div class="auth-modal-icon">${r.icon}</div>
        <div class="auth-modal-title">${r.title}</div>
        <div class="auth-modal-sub">${r.sub}</div>

        <button class="auth-google-btn" id="authGoogleBtn">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuar com Google
        </button>

        ${window.FEATURES?.appleSignIn ? `
        <button class="auth-apple-btn" id="authAppleBtn">
          <svg width="18" height="18" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
          </svg>
          Continuar com a Apple
        </button>` : ''}

        <div class="auth-divider"><span>ou</span></div>

        <div class="auth-field-wrap">
          <input class="auth-field" id="loginEmail" type="email" placeholder="E-mail" autocomplete="email">
        </div>
        <div class="auth-field-wrap">
          <input class="auth-field" id="loginPassword" type="password" placeholder="Senha" autocomplete="current-password">
          <button class="auth-field-eye" id="loginEyeBtn" type="button">${ic('eye', 16)}</button>
        </div>
        <div id="loginError" class="auth-error" style="display:none"></div>

        <button class="auth-submit-btn" id="loginSubmitBtn">Entrar</button>

        <div class="auth-footer-row">
          <button class="auth-link-btn" id="goForgotBtn">Esqueci a senha</button>
          <span class="auth-sep">·</span>
          <button class="auth-link-btn" id="goRegisterBtn">Criar conta</button>
        </div>
        <button class="auth-cancel-btn" id="authCancelBtn">Agora não</button>
      </div>

      <div id="authViewRegister" class="auth-view" style="display:none">
        <div class="auth-modal-icon">${ic('check-circle', 30, 1.7)}</div>
        <div class="auth-modal-title">Criar conta</div>
        <div class="auth-modal-sub">Junte-se e descubra os melhores lugares de Curitiba.</div>

        <button class="auth-google-btn" id="authGoogleBtn2">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Registrar com Google
        </button>

        ${window.FEATURES?.appleSignIn ? `
        <button class="auth-apple-btn" id="authAppleBtn2">
          <svg width="18" height="18" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
          </svg>
          Registrar com a Apple
        </button>` : ''}

        <div class="auth-divider"><span>ou</span></div>

        <div class="auth-field-wrap">
          <input class="auth-field" id="regName" type="text" placeholder="Seu nome" autocomplete="name">
        </div>
        <div class="auth-field-wrap">
          <input class="auth-field" id="regEmail" type="email" placeholder="E-mail" autocomplete="email">
        </div>
        <div class="auth-field-wrap">
          <input class="auth-field" id="regPassword" type="password" placeholder="Senha (mín. 6 caracteres)" autocomplete="new-password">
          <button class="auth-field-eye" id="regEyeBtn" type="button">${ic('eye', 16)}</button>
        </div>
        <div id="regError" class="auth-error" style="display:none"></div>

        <button class="auth-submit-btn" id="regSubmitBtn">Criar conta</button>

        <div class="auth-footer-row">
          <button class="auth-link-btn" id="goLoginBtn">Já tenho conta</button>
        </div>
        <button class="auth-cancel-btn" id="regCancelBtn">Agora não</button>
      </div>

      <div id="authViewForgot" class="auth-view" style="display:none">
        <div class="auth-modal-icon">${ic('key', 30, 1.7)}</div>
        <div class="auth-modal-title">Recuperar senha</div>
        <div class="auth-modal-sub">Enviaremos um link para redefinir sua senha.</div>

        <div class="auth-field-wrap">
          <input class="auth-field" id="forgotEmail" type="email" placeholder="Seu e-mail">
        </div>
        <div id="forgotError" class="auth-error" style="display:none"></div>
        <div id="forgotSuccess" class="auth-success" style="display:none">E-mail enviado! Verifique sua caixa de entrada.</div>

        <button class="auth-submit-btn" id="forgotSubmitBtn">Enviar link</button>

        <div class="auth-footer-row">
          <button class="auth-link-btn" id="forgotBackBtn">Voltar ao login</button>
        </div>
        <button class="auth-cancel-btn" id="forgotCancelBtn">Cancelar</button>
      </div>
    </div>`;

  bd.style.display = 'flex';
  _bindAuthModal();
  // Registra no histórico → botão "voltar" do celular fecha o modal
  if (window.registerOverlay) window.registerOverlay('authModal', doCloseAuthModal);
}

function _bindAuthModal() {
  document.getElementById('authGoogleBtn').onclick  = signInWithGoogle;
  document.getElementById('authGoogleBtn2')?.addEventListener('click', signInWithGoogle);
  document.getElementById('authAppleBtn')?.addEventListener('click', signInWithApple);
  document.getElementById('authAppleBtn2')?.addEventListener('click', signInWithApple);
  document.getElementById('goRegisterBtn').onclick  = () => switchAuthView('Register');
  document.getElementById('goLoginBtn').onclick     = () => switchAuthView('Login');
  document.getElementById('goForgotBtn').onclick    = () => switchAuthView('Forgot');
  document.getElementById('forgotBackBtn').onclick  = () => switchAuthView('Login');
  document.getElementById('authCancelBtn').onclick  = closeAuthModal;
  document.getElementById('regCancelBtn').onclick   = closeAuthModal;
  document.getElementById('forgotCancelBtn').onclick= closeAuthModal;

  _bindEye('loginEyeBtn', 'loginPassword');
  _bindEye('regEyeBtn', 'regPassword');

  document.getElementById('loginSubmitBtn').onclick = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pwd   = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';
    if (!email || !pwd) { showErr(errEl, 'Preencha e-mail e senha.'); return; }
    setLoading('loginSubmitBtn', true);
    try { await signInWithEmail(email, pwd); }
    catch (e) { showErr(errEl, _friendlyError(e.code)); }
    finally { setLoading('loginSubmitBtn', false); }
  };

  document.getElementById('regSubmitBtn').onclick = async () => {
    const name  = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pwd   = document.getElementById('regPassword').value;
    const errEl = document.getElementById('regError');
    errEl.style.display = 'none';
    if (!email || !pwd) { showErr(errEl, 'Preencha e-mail e senha.'); return; }
    if (pwd.length < 6)  { showErr(errEl, 'Senha deve ter pelo menos 6 caracteres.'); return; }
    setLoading('regSubmitBtn', true);
    try { await signUpWithEmail(name, email, pwd); }
    catch (e) { showErr(errEl, _friendlyError(e.code)); }
    finally { setLoading('regSubmitBtn', false); }
  };

  document.getElementById('forgotSubmitBtn').onclick = async () => {
    const email  = document.getElementById('forgotEmail').value.trim();
    const errEl  = document.getElementById('forgotError');
    const succEl = document.getElementById('forgotSuccess');
    errEl.style.display = 'none'; succEl.style.display = 'none';
    if (!email) { showErr(errEl, 'Digite seu e-mail.'); return; }
    setLoading('forgotSubmitBtn', true);
    try { await resetPassword(email); succEl.style.display = 'block'; }
    catch (e) { showErr(errEl, _friendlyError(e.code)); }
    finally { setLoading('forgotSubmitBtn', false); }
  };

  ['loginEmail','loginPassword'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('loginSubmitBtn').click();
    });
  });
}

function _bindEye(btnId, fieldId) {
  const btn = document.getElementById(btnId);
  const field = document.getElementById(fieldId);
  if (!btn || !field) return;
  btn.onclick = () => {
    const vis = field.type === 'text';
    field.type = vis ? 'password' : 'text';
    btn.innerHTML = vis ? ic('eye', 16) : ic('eye-off', 16);
  };
}

function switchAuthView(view) {
  ['Login','Register','Forgot'].forEach(v => {
    const el = document.getElementById('authView' + v);
    if (el) el.style.display = v === view ? 'block' : 'none';
  });
}

function showErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.style.opacity = loading ? '.6' : '1';
}

function _friendlyError(code) {
  const map = {
    'auth/user-not-found':        'Nenhuma conta encontrada com este e-mail.',
    'auth/wrong-password':        'Senha incorreta.',
    'auth/invalid-credential':    'E-mail ou senha incorretos.',
    'auth/email-already-in-use':  'Este e-mail já está em uso.',
    'auth/weak-password':         'Senha muito fraca.',
    'auth/invalid-email':         'E-mail inválido.',
    'auth/too-many-requests':     'Muitas tentativas. Tente de novo em alguns minutos.',
    'auth/network-request-failed':'Erro de conexão.',
  };
  return map[code] || 'Ocorreu um erro. Tente novamente.';
}

// Fecha o DOM do modal (idempotente). Chamado só pelo popstate/dismiss.
function doCloseAuthModal() {
  const bd = document.getElementById('authModalBackdrop');
  if (bd) bd.style.display = 'none';
}
export function closeAuthModal() {
  if (window._overlayHas && window._overlayHas('authModal')) window.dismissOverlay('authModal');
  else doCloseAuthModal();
}

// ── Editor de perfil (nascimento, bairro, interesses) ──────────────
// Usado no passo pós-cadastro (onboarding) e no botão "Editar perfil".
// Os dados vão para user_profiles/{uid}, que as regras já deixam o dono
// ler e escrever.
export function calcAge(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (isNaN(b)) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return (age >= 0 && age < 130) ? age : null;
}

export async function showProfileEditor(user, opts = {}) {
  user = user || window.currentUser;
  if (!user) return;
  const onboarding = !!opts.onboarding;

  // Dados existentes
  let cur = {};
  try {
    const snap = await getDoc(doc(db, 'user_profiles', user.uid));
    if (snap.exists()) cur = snap.data();
  } catch {}

  const cats    = (window._getCategories?.() || []);
  const bairros = (window._getBairros?.() || []);
  const selected = new Set(Array.isArray(cur.interests) ? cur.interests : []);

  let bd = document.getElementById('profEditBackdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.className = 'auth-modal-backdrop';
    bd.id = 'profEditBackdrop';
    (document.querySelector('.phone') || document.body).appendChild(bd);
  }

  bd.innerHTML = `
    <div class="auth-modal" style="max-height:90vh;overflow-y:auto">
      <div class="auth-view">
        <div class="auth-modal-icon">${ic('user', 30, 1.7)}</div>
        <div class="auth-modal-title">${onboarding ? 'Complete seu perfil' : 'Editar perfil'}</div>
        <div class="auth-modal-sub">${onboarding
          ? 'Conta um pouco sobre você (pode pular e preencher depois).'
          : 'Atualize suas informações.'}</div>

        <label class="prof-field-label" for="profBirth">Data de nascimento</label>
        <div class="auth-field-wrap">
          <input class="auth-field" id="profBirth" type="date" max="${new Date().toISOString().slice(0,10)}"
            value="${cur.birthday || ''}">
        </div>

        <label class="prof-field-label" for="profBairro">Bairro</label>
        <div class="auth-field-wrap">
          <input class="auth-field" id="profBairro" type="text" list="profBairrosList"
            placeholder="Ex: Batel" value="${(cur.bairro || '').replace(/"/g, '&quot;')}">
          <datalist id="profBairrosList">
            ${bairros.map(b => `<option value="${b.replace(/"/g, '&quot;')}"></option>`).join('')}
          </datalist>
        </div>

        <label class="prof-field-label">Interesses</label>
        <div class="prof-chips" id="profChips">
          ${cats.map(c => `<button type="button" class="prof-chip${selected.has(c) ? ' on' : ''}" data-cat="${c.replace(/"/g, '&quot;')}">${c}</button>`).join('')
            || '<span class="auth-modal-sub" style="margin:0">Nenhuma categoria disponível.</span>'}
        </div>

        <div id="profEditError" class="auth-error" style="display:none"></div>
        <button class="auth-submit-btn" id="profSaveBtn">Salvar</button>
        <button class="auth-cancel-btn" id="profSkipBtn">${onboarding ? 'Pular por agora' : 'Cancelar'}</button>
      </div>
    </div>`;

  bd.style.display = 'flex';
  if (window.registerOverlay) window.registerOverlay('profEdit', () => { bd.style.display = 'none'; });

  const close = () => {
    if (window._overlayHas && window._overlayHas('profEdit')) window.dismissOverlay('profEdit');
    else bd.style.display = 'none';
  };

  // Toggle dos chips de interesse
  bd.querySelectorAll('.prof-chip').forEach(chip => {
    chip.onclick = () => {
      const c = chip.dataset.cat;
      if (selected.has(c)) { selected.delete(c); chip.classList.remove('on'); }
      else { selected.add(c); chip.classList.add('on'); }
    };
  });

  document.getElementById('profSkipBtn').onclick = close;

  document.getElementById('profSaveBtn').onclick = async () => {
    const errEl   = document.getElementById('profEditError');
    const birthday = document.getElementById('profBirth').value || '';
    const bairro   = document.getElementById('profBairro').value.trim();
    // Valida idade mínima (13+), exigência das lojas — só se preencheu a data.
    if (birthday) {
      const age = calcAge(birthday);
      if (age !== null && age < 13) {
        showErr(errEl, 'É preciso ter pelo menos 13 anos para usar o app.');
        return;
      }
    }
    setLoading('profSaveBtn', true);
    try {
      await setDoc(doc(db, 'user_profiles', user.uid),
        { birthday, bairro, interests: [...selected] }, { merge: true });
      // Guarda os interesses localmente e re-personaliza o baralho na hora.
      try { localStorage.setItem('cwb_interests', JSON.stringify([...selected])); } catch {}
      window._reshuffleDeck?.(true);
      close();
      // Se a tela de perfil estiver aberta, atualiza os dados exibidos.
      if (document.getElementById('userProfileScreen')?.querySelector('.ups-fullscreen')) {
        _loadProfileExtras(user);
      }
    } catch (e) {
      showErr(errEl, 'Não foi possível salvar. Tente de novo.');
    } finally {
      setLoading('profSaveBtn', false);
    }
  };
}

// Preenche a seção de dados do perfil (idade, bairro, interesses) na tela.
async function _loadProfileExtras(user) {
  const box = document.getElementById('upsExtras');
  if (!box) return;
  let d = {};
  try {
    const snap = await getDoc(doc(db, 'user_profiles', user.uid));
    if (snap.exists()) d = snap.data();
  } catch {}
  const age = calcAge(d.birthday);
  const bits = [];
  if (age !== null) bits.push(`${age} anos`);
  if (d.bairro) bits.push(d.bairro);
  const interests = Array.isArray(d.interests) ? d.interests : [];
  // Mantém os interesses no localStorage sincronizados (o baralho lê daí).
  try { localStorage.setItem('cwb_interests', JSON.stringify(interests)); } catch {}

  if (!bits.length && !interests.length) {
    box.innerHTML = `<button class="ups-complete-btn" id="upsCompleteBtn">${ic('user', 15)} Complete seu perfil</button>`;
  } else {
    box.innerHTML = `
      ${bits.length ? `<div class="ups-extra-line">${bits.join(' · ')}</div>` : ''}
      ${interests.length ? `<div class="ups-extra-chips">${interests.map(i => `<span class="ups-extra-chip">${i}</span>`).join('')}</div>` : ''}`;
  }
  const cb = document.getElementById('upsCompleteBtn');
  if (cb) cb.onclick = () => showProfileEditor(user, { onboarding: true });
}

// ── User Profile Screen ────────────────────────────────────────────
export function showUserProfile() {
  const user = window.currentUser;
  if (!user) { showAuthModal('default'); return; }

  let screen = document.getElementById('userProfileScreen');
  if (!screen) {
    screen = document.createElement('div');
    screen.id = 'userProfileScreen';
    screen.className = 'user-profile-screen';
    // Append inside .phone so position:absolute works correctly
    (document.querySelector('.phone') || document.body).appendChild(screen);
  }

  const F           = window.FEATURES || {};
  const initials    = getInitials(user);
  const displayName = user.displayName || 'Usuário';
  const email       = user.email || '';
  const photoURL    = effectivePhoto(user);
  const isGoogle    = user.providerData?.[0]?.providerId === 'google.com';
  const memberSince = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : '';

  screen.innerHTML = `
    <div class="ups-fullscreen" id="upsSheet">

      <!-- Topbar -->
      <div class="ups-topbar">
        <button class="ups-back-btn" id="upsCloseBtn">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <span class="ups-topbar-title">Meu Perfil</span>
        <div class="ups-privacy-toggle" id="upsPrivacyToggle" title="Visibilidade do perfil">
          <span id="upsPrivacyIcon">${ic('lock', 13)}</span>
          <span id="upsPrivacyLbl">Privado</span>
        </div>
      </div>

      <div class="ups-scroll">

        <!-- Header -->
        <div class="ups-header">
          <button class="ups-avatar-wrap" id="upsAvatarBtn" title="Trocar foto">
            <div class="ups-avatar-media" id="upsAvatarMedia">
              ${photoURL
                ? `<img class="ups-avatar-img" src="${photoURL}" alt="${displayName}">`
                : `<div class="ups-avatar-initials">${initials}</div>`}
            </div>
            <div class="ups-avatar-cam">${ic('camera', 13)}</div>
          </button>
          <input type="file" id="upsPhotoInput" accept="image/*" style="display:none">
          <div class="ups-user-info">
            <div class="ups-name">${displayName}</div>
            <div class="ups-email">${email}</div>
            ${!user.emailVerified ? `<button class="ups-verify" id="upsVerifyBtn">${ic('mail', 12)} E-mail não confirmado — reenviar</button>` : ''}
            ${memberSince ? `<div class="ups-since">Membro desde ${memberSince}</div>` : ''}
          </div>
        </div>

        <!-- Dados do perfil (idade, bairro, interesses) -->
        <div class="ups-extras" id="upsExtras"></div>

        <!-- Nível (oculto por enquanto — FEATURES.levelXp) -->
        ${F.levelXp ? `
        <div class="ups-level-bar" id="upsLevelBar">
          <div class="ups-level-top">
            <span class="ups-level-icon" id="upsLevelIcon">${ic('leaf', 18)}</span>
            <span class="ups-level-name" id="upsLevelName">Novato</span>
            <span class="ups-level-xp"  id="upsLevelXp">0 XP</span>
          </div>
          <div class="ups-level-track">
            <div class="ups-level-fill" id="upsLevelFill" style="width:0%"></div>
          </div>
          <div class="ups-level-next" id="upsLevelNext"></div>
        </div>` : ''}

        <!-- Stats -->
        <div class="ups-stats">
          <div class="ups-stat">
            <div class="ups-stat-num" id="upsStatVisited">—</div>
            <div class="ups-stat-lbl">Visitados</div>
          </div>
          <div class="ups-stat-divider"></div>
          <div class="ups-stat">
            <div class="ups-stat-num" id="upsStatSaved">—</div>
            <div class="ups-stat-lbl">Salvos</div>
          </div>
          ${F.ratings ? `
          <div class="ups-stat-divider"></div>
          <div class="ups-stat">
            <div class="ups-stat-num" id="upsStatRatings">—</div>
            <div class="ups-stat-lbl">Avaliações</div>
          </div>` : ''}
        </div>

        <!-- Abas -->
        <div class="ups-tabs">
          ${F.badges ? `<button class="ups-tab" data-tab="badges" onclick="upsSetTab('badges')">Badges</button>` : ''}
          <button class="ups-tab" data-tab="stats"    onclick="upsSetTab('stats')">Estatísticas</button>
          <button class="ups-tab" data-tab="settings" onclick="upsSetTab('settings')">Conta</button>
        </div>

        <!-- Aba: Badges (oculta por enquanto — FEATURES.badges) -->
        ${F.badges ? `
        <div class="ups-tab-panel" id="upsTabBadges">
          <div class="ups-badges-grid" id="upsBadgesGrid">
            <div class="badges-empty">Carregando…</div>
          </div>
        </div>` : ''}

        <!-- Aba: Estatísticas -->
        <div class="ups-tab-panel" id="upsTabStats" style="display:none">
          <div class="ups-stats-detail" id="upsStatsDetail">
            <div class="ups-loading">Carregando…</div>
          </div>
        </div>

        <!-- Aba: Conta -->
        <div class="ups-tab-panel" id="upsTabSettings" style="display:none">
          <div class="ups-actions">
            <button class="ups-action-row" id="upsEditProfileBtn">
              <span class="ups-action-icon">${ic('user', 16)}</span>
              <span class="ups-action-label">Editar perfil</span>
              <span class="ups-action-chevron">›</span>
            </button>
            ${!isGoogle ? `
            <button class="ups-action-row" id="upsChangeNameBtn">
              <span class="ups-action-icon">${ic('edit', 16)}</span>
              <span class="ups-action-label">Alterar nome</span>
              <span class="ups-action-chevron">›</span>
            </button>
            <button class="ups-action-row" id="upsChangePwdBtn">
              <span class="ups-action-icon">${ic('key', 16)}</span>
              <span class="ups-action-label">Alterar senha</span>
              <span class="ups-action-chevron">›</span>
            </button>` : ''}
            <a class="ups-action-row" href="privacidade.html" target="_blank" rel="noopener">
              <span class="ups-action-icon">${ic('lock', 16)}</span>
              <span class="ups-action-label">Política de privacidade</span>
              <span class="ups-action-chevron">›</span>
            </a>
            <button class="ups-action-row" id="upsSignOutBtn">
              <span class="ups-action-icon">${ic('log-out', 16)}</span>
              <span class="ups-action-label">Sair da conta</span>
              <span class="ups-action-chevron">›</span>
            </button>
          </div>

          <button class="ups-delete-mini" id="upsDeleteAccountBtn">Excluir conta</button>

          <div id="upsEditName" class="ups-edit-panel" style="display:none">
            <div class="ups-section-title" style="margin-top:12px">Alterar nome</div>
            <div class="auth-field-wrap"><input class="auth-field" id="upsNewName" type="text" placeholder="Seu nome" value="${displayName}"></div>
            <div id="upsNameError" class="auth-error" style="display:none"></div>
            <button class="auth-submit-btn" id="upsSaveNameBtn">Salvar</button>
            <button class="ups-link-btn" id="upsCancelNameBtn">Cancelar</button>
          </div>

          <div id="upsEditPwd" class="ups-edit-panel" style="display:none">
            <div class="ups-section-title" style="margin-top:12px">Alterar senha</div>
            <div class="auth-field-wrap">
              <input class="auth-field" id="upsNewPwd" type="password" placeholder="Nova senha (mín. 6 caracteres)">
              <button class="auth-field-eye" id="upsPwdEyeBtn" type="button">${ic('eye', 16)}</button>
            </div>
            <div id="upsPwdError" class="auth-error" style="display:none"></div>
            <div id="upsPwdSuccess" class="auth-success" style="display:none">Senha alterada!</div>
            <button class="auth-submit-btn" id="upsSavePwdBtn">Alterar senha</button>
            <button class="ups-link-btn" id="upsCancelPwdBtn">Cancelar</button>
          </div>
        </div>

      </div><!-- .ups-scroll -->
    </div>`;

  screen.style.display = 'flex';
  requestAnimationFrame(() => screen.classList.add('ups-visible'));
  // Registra no histórico → botão "voltar" do celular fecha o perfil
  if (window.registerOverlay) window.registerOverlay('userProfile', doCloseUserProfile);

  _loadUserStats(user);
  _loadPrivacyToggle(user);
  _bindPhotoUpload(user);
  _loadProfileExtras(user);

  document.getElementById('upsCloseBtn').onclick   = closeUserProfile;
  document.getElementById('upsEditProfileBtn').onclick = () => showProfileEditor(user, { onboarding: false });
  document.getElementById('upsSignOutBtn').onclick = async () => { closeUserProfile(); await signOutUser(); };
  document.getElementById('upsDeleteAccountBtn').onclick = () => deleteAccount(user);
  document.getElementById('upsVerifyBtn')?.addEventListener('click', () => resendVerification(user));

  // Tab switcher
  window.upsSetTab = (tab) => {
    document.querySelectorAll('.ups-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.ups-tab-panel').forEach(p => p.style.display = 'none');
    const panels = { badges:'upsTabBadges', stats:'upsTabStats', settings:'upsTabSettings' };
    const panel  = document.getElementById(panels[tab]);
    if (panel) panel.style.display = 'block';
    if (tab === 'stats')   _loadStats(user);
  };
  // Ativa a primeira aba disponível (Badges pode estar oculta)
  window.upsSetTab(F.badges ? 'badges' : 'stats');

  const changeNameBtn = document.getElementById('upsChangeNameBtn');
  const changePwdBtn  = document.getElementById('upsChangePwdBtn');

  if (changeNameBtn) {
    changeNameBtn.onclick = () => { document.getElementById('upsEditName').style.display='block'; changeNameBtn.style.display='none'; };
  }
  if (changePwdBtn) {
    changePwdBtn.onclick = () => { document.getElementById('upsEditPwd').style.display='block'; changePwdBtn.style.display='none'; };
  }

  const saveNameBtn = document.getElementById('upsSaveNameBtn');
  if (saveNameBtn) {
    saveNameBtn.onclick = async () => {
      const newName = document.getElementById('upsNewName').value.trim();
      const errEl   = document.getElementById('upsNameError');
      errEl.style.display = 'none';
      if (!newName) { showErr(errEl,'Digite um nome.'); return; }
      setLoading('upsSaveNameBtn',true);
      try {
        await updateProfile(auth.currentUser, { displayName: newName });
        window.currentUser = auth.currentUser;
        updateAvatarUI(auth.currentUser);
        screen.querySelector('.ups-name').textContent = newName;
        document.getElementById('upsEditName').style.display='none';
        if (changeNameBtn) changeNameBtn.style.display='flex';
      } catch(e) { showErr(errEl,'Erro ao salvar.'); }
      finally { setLoading('upsSaveNameBtn',false); }
    };
    document.getElementById('upsCancelNameBtn').onclick = () => {
      document.getElementById('upsEditName').style.display='none';
      if (changeNameBtn) changeNameBtn.style.display='flex';
    };
  }

  const savePwdBtn = document.getElementById('upsSavePwdBtn');
  if (savePwdBtn) {
    _bindEye('upsPwdEyeBtn','upsNewPwd');
    savePwdBtn.onclick = async () => {
      const { updatePassword } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
      const newPwd = document.getElementById('upsNewPwd').value;
      const errEl  = document.getElementById('upsPwdError');
      const succEl = document.getElementById('upsPwdSuccess');
      errEl.style.display='none'; succEl.style.display='none';
      if (newPwd.length < 6) { showErr(errEl,'Mínimo 6 caracteres.'); return; }
      setLoading('upsSavePwdBtn',true);
      try { await updatePassword(auth.currentUser,newPwd); succEl.style.display='block'; document.getElementById('upsNewPwd').value=''; }
      catch(e) { showErr(errEl,_friendlyError(e.code)); }
      finally { setLoading('upsSavePwdBtn',false); }
    };
    document.getElementById('upsCancelPwdBtn').onclick = () => {
      document.getElementById('upsEditPwd').style.display='none';
      if (changePwdBtn) changePwdBtn.style.display='flex';
    };
  }
}

// Cada peça carrega de forma independente: se uma falhar (regra/rede),
// as outras — e as badges — continuam aparecendo. Antes, um único erro
// derrubava tudo e a aba Badges ficava presa em "Carregando…".
async function _loadUserStats(user) {
  const F   = window.FEATURES || {};
  const el  = id => document.getElementById(id);
  const set = (id, v) => { if (el(id)) el(id).textContent = v; };
  set('upsStatVisited', '…'); set('upsStatSaved', '…'); set('upsStatRatings', '…');

  const countCol = async (path) => {
    try { return (await getDocs(collection(db, ...path))).size; }
    catch (e) { console.warn('countCol', path, e); return null; }
  };
  const fmt = n => (n == null ? '—' : n);

  // Visitados / Salvos — sempre; um não derruba o outro
  countCol(['been_there', user.uid, 'places']).then(n => set('upsStatVisited', fmt(n)));
  countCol(['favorites',  user.uid, 'places']).then(n => set('upsStatSaved',   fmt(n)));

  // Avaliações — só se a feature estiver ligada
  if (F.ratings && window.countUserRatings) {
    window.countUserRatings(user.uid).then(n => set('upsStatRatings', fmt(n)));
  }

  // Nível (XP) — só se a feature estiver ligada
  if (F.levelXp) {
    loadUserXp(user.uid).then(_renderLevel).catch(e => console.warn('xp:', e));
    window.addEventListener('xpAwarded', async () => {
      _renderLevel(await loadUserXp(user.uid));
    });
  }

  // Badges — só se a feature estiver ligada
  if (F.badges) {
    loadUserBadges(user.uid)
      .then(earned => renderBadges(earned, el('upsBadgesGrid')))
      .catch(e => { console.warn('badges:', e); renderBadges([], el('upsBadgesGrid')); });
    window.addEventListener('badgeUnlocked', async () => {
      renderBadges(await loadUserBadges(user.uid), el('upsBadgesGrid'));
    });
  }
}

// ── Upload de foto de perfil ───────────────────────────────────────
// Redimensiona pra 256px e guarda como data URL no Firestore
// (user_profiles/{uid}.photoDataUrl). Sem Firebase Storage.
function _bindPhotoUpload(user) {
  const btn   = document.getElementById('upsAvatarBtn');
  const input = document.getElementById('upsPhotoInput');
  if (!btn || !input) return;

  btn.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { window.showToast?.('Selecione uma imagem.', 'error'); return; }

    try {
      const dataUrl = await _resizeImage(file, 256);
      // Atualiza a UI na hora
      const media = document.getElementById('upsAvatarMedia');
      if (media) media.innerHTML = `<img class="ups-avatar-img" src="${dataUrl}" alt="">`;
      window._customPhoto = dataUrl;
      updateAvatarUI(user);
      // Persiste
      await setDoc(doc(db, 'user_profiles', user.uid), { photoDataUrl: dataUrl }, { merge: true });
      window.showToast?.('Foto atualizada!', 'success');
    } catch (e) {
      console.warn('_bindPhotoUpload:', e);
      window.showToast?.('Não consegui salvar a foto.', 'error');
    }
  };
}

// Lê a imagem, corta no centro (quadrado) e reduz pra `size`px → JPEG data URL.
function _resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        // corte quadrado central (cover)
        const s = Math.min(img.width, img.height);
        const sx = (img.width  - s) / 2;
        const sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Privacy toggle ─────────────────────────────────────────────────
async function _loadPrivacyToggle(user) {
  const profileRef = doc(db, 'user_profiles', user.uid);
  try {
    const snap    = await getDoc(profileRef);
    const isPublic = snap.exists() ? (snap.data().isPublic || false) : false;
    _setPrivacyUI(isPublic);
  } catch (e) { console.warn('_loadPrivacyToggle:', e); }

  const toggle = document.getElementById('upsPrivacyToggle');
  if (!toggle) return;
  toggle.onclick = async () => {
    const snap     = await getDoc(doc(db, 'user_profiles', user.uid));
    const current  = snap.exists() ? (snap.data().isPublic || false) : false;
    const next     = !current;
    await setDoc(doc(db, 'user_profiles', user.uid), { isPublic: next }, { merge: true });
    _setPrivacyUI(next);
  };
}

function _setPrivacyUI(isPublic) {
  const icon = document.getElementById('upsPrivacyIcon');
  const lbl  = document.getElementById('upsPrivacyLbl');
  const wrap = document.getElementById('upsPrivacyToggle');
  if (icon) icon.innerHTML = isPublic ? ic('globe', 13) : ic('lock', 13);
  if (lbl)  lbl.textContent  = isPublic ? 'Público' : 'Privado';
  if (wrap) wrap.classList.toggle('privacy-public', isPublic);
}

// ── Stats tab ──────────────────────────────────────────────────────
async function _loadStats(user) {
  const container = document.getElementById('upsStatsDetail');
  if (!container || container.dataset.loaded) return;
  container.dataset.loaded = '1';
  container.innerHTML = '<div class="ups-loading">Calculando…</div>';

  try {
    const snap   = await getDocs(collection(db, 'been_there', user.uid, 'places'));
    const places = snap.docs.map(d => d.data());

    if (!places.length) {
      container.innerHTML = '<div class="ups-empty-tab">Visite lugares para ver suas estatísticas!</div>';
      return;
    }

    // Categoria favorita
    const catCount = {};
    places.forEach(p => { const c = p.c||'Outros'; catCount[c] = (catCount[c]||0)+1; });
    const topCat = Object.entries(catCount).sort((a,b)=>b[1]-a[1]);

    // Bairro favorito
    const bairroCount = {};
    places.forEach(p => { const b = p.b||'Desconhecido'; bairroCount[b] = (bairroCount[b]||0)+1; });
    const topBairro = Object.entries(bairroCount).sort((a,b)=>b[1]-a[1]);

    container.innerHTML = `
      <div class="ups-stat-block">
        <div class="ups-stat-block-title">${ic('trophy', 13)} Total de lugares visitados</div>
        <div class="ups-stat-block-val">${places.length}</div>
      </div>

      <div class="ups-stat-block">
        <div class="ups-stat-block-title">${ic('heart', 13)} Categoria favorita</div>
        ${topCat.slice(0,3).map(([cat,n]) => `
          <div class="ups-stat-bar-row">
            <span class="ups-stat-bar-lbl">${cat}</span>
            <div class="ups-stat-bar-track">
              <div class="ups-stat-bar-fill" style="width:${Math.round(n/places.length*100)}%"></div>
            </div>
            <span class="ups-stat-bar-num">${n}</span>
          </div>`).join('')}
      </div>

      <div class="ups-stat-block">
        <div class="ups-stat-block-title">${ic('map-pin', 13)} Bairro favorito</div>
        ${topBairro.slice(0,3).map(([b,n]) => `
          <div class="ups-stat-bar-row">
            <span class="ups-stat-bar-lbl">${b}</span>
            <div class="ups-stat-bar-track">
              <div class="ups-stat-bar-fill" style="width:${Math.round(n/places.length*100)}%"></div>
            </div>
            <span class="ups-stat-bar-num">${n}</span>
          </div>`).join('')}
      </div>`;
  } catch(e) {
    container.innerHTML = '<div class="ups-empty-tab">Erro ao carregar estatísticas.</div>';
    console.warn('_loadStats:', e);
  }
}

function _renderLevel(totalXp) {
  const el   = id => document.getElementById(id);
  const info = getLevelInfo(totalXp);
  // .icon é uma STRING de SVG → precisa de innerHTML (textContent mostraria o código cru)
  if (el('upsLevelIcon')) el('upsLevelIcon').innerHTML = info.current.icon;
  if (el('upsLevelName')) el('upsLevelName').textContent = info.current.name;
  if (el('upsLevelXp'))   el('upsLevelXp').textContent  = `${totalXp} XP`;
  if (el('upsLevelFill')) {
    el('upsLevelFill').style.width = `${Math.round(info.progress * 100)}%`;
  }
  if (el('upsLevelNext')) {
    // sem o ícone SVG no meio do texto (não renderiza como texto e polui)
    el('upsLevelNext').textContent = info.next
      ? `${info.xpIntoLevel} / ${info.xpNeeded} XP para ${info.next.name}`
      : `Nível máximo atingido!`;
  }
}

// Fecha o DOM do perfil (idempotente). Chamado só pelo popstate/dismiss.
// A visibilidade é controlada pela classe .ups-visible (display:flex
// !important). É PRECISO removê-la — mexer só no style.display inline
// não esconde (o !important ganha) e a tela reaparece deslizando.
function doCloseUserProfile() {
  const screen = document.getElementById('userProfileScreen');
  if (!screen || !screen.classList.contains('ups-visible')) return;
  screen.classList.add('ups-closing');
  setTimeout(() => {
    screen.classList.remove('ups-visible');
    screen.classList.remove('ups-closing');
    screen.style.display = 'none';
  }, 260);
}
export function closeUserProfile() {
  if (window._overlayHas && window._overlayHas('userProfile')) window.dismissOverlay('userProfile');
  else doCloseUserProfile();
}

export function handleAvatarClick() {
  if (window.currentUser) showUserProfile();
  else showAuthModal('default');
}

window.signInWithGoogle  = signInWithGoogle;
window.signInWithApple   = signInWithApple;
window.showProfileEditor = showProfileEditor;
window.signOutUser       = signOutUser;
window.showAuthModal     = showAuthModal;
window.closeAuthModal    = closeAuthModal;
window.handleAvatarClick = handleAvatarClick;
window.showUserProfile   = showUserProfile;
window.closeUserProfile  = closeUserProfile;
