// ── quiz.js ───────────────────────────────────────────────────────
// "Me ajude a escolher" — quiz de 5 perguntas que resolve a indecisão
// de "onde vou comer/sair hoje". No fim entrega UMA sugestão feita sob
// medida (com o porquê), com opção de re-rolar e ver mais opções.
//
// Requer login: a ferramenta só abre pra quem está autenticado.
// Reaproveita o modelo de dados dos lugares (cats, preço p, horário h)
// e as funções globais expostas pelo app (openProfile, dmSavePlace…).

import { fetchPlacePhoto } from './photos.js';
import { catIcon, ic } from './icons.js';
import { db, doc, getDoc } from './firebase.js';
import { isOpenNow } from './hours.js';

let allPlaces = [];
let onOpenProfileCb = null;

// Estado da sessão atual do quiz
let step      = 0;          // índice da pergunta atual
let answers   = [];         // opção escolhida por pergunta
let ranked    = [];         // lugares ordenados por match (após responder)
let resultIdx = 0;          // qual do ranking está sendo mostrado
let lastCtx   = null;       // contexto do ranking (pref de cats/preço/aberto)

// Perguntas em uso: começam com o padrão (QUIZ, definido abaixo) e são
// substituídas pela config do admin (Firestore) quando houver.
let QUESTIONS = null;

export function initQuiz(placesRef) {
  allPlaces = placesRef;
  loadQuizConfig(); // busca config do admin em background; fallback = QUIZ
}

// Carrega as perguntas do Firestore (app_config/quiz). Se não houver nada
// salvo ou der erro, mantém o padrão embutido — o quiz nunca fica vazio.
async function loadQuizConfig() {
  try {
    const snap = await getDoc(doc(db, 'app_config', 'quiz'));
    if (snap.exists()) {
      const qs = snap.data().questions;
      if (Array.isArray(qs) && qs.length) QUESTIONS = qs;
    }
  } catch (e) {
    console.warn('loadQuizConfig:', e);
  }
}

function questions() { return (Array.isArray(QUESTIONS) && QUESTIONS.length) ? QUESTIONS : QUIZ; }

// ── Definição das perguntas ────────────────────────────────────────
// Cada opção carrega o "boost" que ela aplica no ranking:
//   cats     → categorias preferidas (peso alto)
//   price    → preço alvo ('$' | '$$$')
//   openNow  → filtra só quem está aberto agora
const QUIZ = [
  {
    key: 'role',
    title: 'Qual é o rolê hoje?',
    sub: 'O que você tá a fim de fazer',
    options: [
      { emoji: '🍽️', label: 'Comer bem',    cats: ['Alta gastronomia', 'Vegano', 'Baratinho'] },
      { emoji: '☕', label: 'Café da tarde', cats: ['Café da tarde'] },
      { emoji: '🍺', label: 'Beber algo',    cats: ['Barzinho'] },
      { emoji: '🕺', label: 'Balada',        cats: ['Balada'] },
    ],
  },
  {
    key: 'quem',
    title: 'Com quem você vai?',
    sub: 'Pra gente acertar o clima',
    options: [
      { emoji: '🧍', label: 'Sozinho', cats: ['Instagramável', 'Café da tarde'] },
      { emoji: '❤️', label: 'Date',    cats: ['Romântico'] },
      { emoji: '🎉', label: 'Amigos',  cats: ['Barzinho', 'Balada', 'Céu aberto'] },
      { emoji: '🐾', label: 'Família', cats: ['Pet friendly', 'Céu aberto'] },
    ],
  },
  {
    key: 'grana',
    title: 'Quanto quer gastar?',
    sub: 'Sem julgamento 😌',
    options: [
      { emoji: '🪙', label: 'Baratinho', price: '$',   cats: ['Baratinho'] },
      { emoji: '💳', label: 'Tanto faz', price: null },
      { emoji: '💎', label: 'Caprichar', price: '$$$', cats: ['Alta gastronomia'] },
    ],
  },
  {
    key: 'vibe',
    title: 'Que vibe você quer?',
    sub: 'O cenário do rolê',
    options: [
      { emoji: '🕯️', label: 'Aconchegante',  cats: ['Romântico', 'Café da tarde'] },
      { emoji: '📸', label: 'Instagramável', cats: ['Instagramável'] },
      { emoji: '🌳', label: 'Ao ar livre',   cats: ['Céu aberto'] },
      { emoji: '🤷', label: 'Tanto faz',     cats: [] },
    ],
  },
  {
    key: 'quando',
    title: 'É pra agora?',
    sub: 'Pra mostrar só o que faz sentido',
    options: [
      { emoji: '⚡', label: 'Bora agora',    openNow: true },
      { emoji: '🗓️', label: 'Tô planejando', openNow: false },
    ],
  },
];

function placeCats(p) {
  return Array.isArray(p.cats) && p.cats.length ? p.cats : (p.c ? [p.c] : []);
}

// ── Ranking dos lugares a partir das respostas ─────────────────────
function rankPlaces() {
  const wantOpen  = answers.some(a => a?.openNow === true);
  const pricePref = answers.map(a => a?.price).find(Boolean) || null;
  const wantCats  = {};
  answers.forEach(a => (a?.cats || []).forEach(c => { wantCats[c] = (wantCats[c] || 0) + 1; }));

  let pool = allPlaces.slice();
  let relaxedOpen = false;
  if (wantOpen) {
    const open = pool.filter(p => isOpenNow(p) === true);
    if (open.length) pool = open; else relaxedOpen = true; // nada aberto → não deixa a tela vazia
  }

  const scored = pool.map(p => {
    const cats = placeCats(p);
    let score = 0;
    cats.forEach(c => { if (wantCats[c]) score += 3 * wantCats[c]; });
    if (pricePref) {
      if (p.p === pricePref) score += 2;
      else if (Math.abs((p.p || '').length - pricePref.length) === 1) score += 0.5;
    }
    score += Math.random() * 0.9; // desempate com variedade
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);

  lastCtx = { wantOpen, pricePref, wantCats, relaxedOpen };
  return scored.map(s => s.p);
}

// "Por que combina" — chips honestos, refletindo as escolhas do usuário
function reasonsFor(p) {
  const chips = [];
  const cats  = placeCats(p);
  const seen  = new Set();
  answers.forEach(a => {
    if (!a) return;
    const hit = (a.cats || []).some(c => cats.includes(c));
    if (hit && !seen.has(a.label)) { seen.add(a.label); chips.push(a.label); }
  });
  if (lastCtx?.pricePref && p.p === lastCtx.pricePref) chips.push(p.p);
  if (lastCtx?.wantOpen && isOpenNow(p) === true) chips.push('Aberto agora');
  if (!chips.length) chips.push('Escolha da casa');
  return chips.slice(0, 4);
}

// ── Overlay ─────────────────────────────────────────────────────────
export function openQuiz(onOpenProfile) {
  onOpenProfileCb = onOpenProfile;
  let overlay = document.getElementById('quizOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'quizOverlay';
    overlay.className = 'quiz-overlay';
    overlay.innerHTML = `
      <div class="quiz-head">
        <button class="quiz-back" id="quizBack" title="Voltar">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div class="quiz-progress-track"><div class="quiz-progress-fill" id="quizProgress"></div></div>
        <button class="quiz-close" id="quizClose" title="Fechar">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="quiz-inner" id="quizInner"></div>`;
    document.querySelector('.phone').appendChild(overlay);
    document.getElementById('quizClose').onclick = closeQuizNow;
    document.getElementById('quizBack').onclick  = goBack;
  }

  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('open'));
  window.registerOverlay('quiz', doCloseQuiz);

  // Login obrigatório
  if (!window.currentUser) { renderGate(); return; }
  startQuiz();
}

function doCloseQuiz() {
  const overlay = document.getElementById('quizOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 280);
}

// Fecha o quiz de forma garantida (síncrona) e reconcilia o histórico.
// Não depende do popstate pra esconder — em PWA/navegador embutido o
// history.back() nem sempre dispara o popstate, e a tela ficava presa.
function closeQuizNow() {
  doCloseQuiz();
  if (window.dismissOverlay) window.dismissOverlay('quiz');
}

function startQuiz() {
  step = 0;
  answers = [];
  ranked = [];
  resultIdx = 0;
  renderStep();
}

// ── Tela de login (gate) ───────────────────────────────────────────
function renderGate() {
  setProgress(0);
  toggleHeadNav(false);
  const inner = document.getElementById('quizInner');
  inner.innerHTML = `
    <div class="quiz-gate">
      <div class="quiz-gate-ico">✨</div>
      <div class="quiz-gate-title">Me ajude a escolher</div>
      <div class="quiz-gate-sub">Responda 5 perguntas rápidas e a gente<br>escolhe o rolê perfeito pra você hoje.</div>
      <div class="quiz-gate-note">Entre pra usar essa ferramenta — leva 2 segundos.</div>
      <button class="quiz-gate-btn" id="quizGateBtn">Entrar pra começar</button>
    </div>`;
  document.getElementById('quizGateBtn').onclick = () => window.showAuthModal && window.showAuthModal('default');
}

// Destrava o quiz assim que o login acontece com a tela aberta
window.addEventListener('authChanged', (e) => {
  const overlay = document.getElementById('quizOverlay');
  if (!overlay || overlay.style.display === 'none') return;
  if (e.detail && document.querySelector('.quiz-gate')) startQuiz();
});

// ── Perguntas ───────────────────────────────────────────────────────
function renderStep() {
  const QS = questions();
  if (step >= QS.length) { renderResult(); return; }
  const q = QS[step];
  setProgress(step / QS.length);
  toggleHeadNav(true);

  const inner = document.getElementById('quizInner');
  inner.innerHTML = `
    <div class="quiz-q" id="quizQ">
      <div class="quiz-q-step">Pergunta ${step + 1} de ${QS.length}</div>
      <div class="quiz-q-title">${q.title}</div>
      <div class="quiz-q-sub">${q.sub}</div>
      <div class="quiz-opts ${q.options.length <= 2 ? 'two' : ''}">
        ${q.options.map((o, i) => `
          <button class="quiz-opt" data-i="${i}">
            <span class="quiz-opt-emoji">${o.emoji}</span>
            <span class="quiz-opt-label">${o.label}</span>
          </button>`).join('')}
      </div>
    </div>`;

  inner.querySelectorAll('.quiz-opt').forEach(btn => {
    btn.onclick = () => {
      const i = +btn.dataset.i;
      btn.classList.add('picked');
      answers[step] = q.options[i];
      setTimeout(() => { step++; renderStep(); }, 200);
    };
  });
}

function goBack() {
  if (step <= 0) { closeQuizNow(); return; }
  step--;
  renderStep();
}

// ── Resultado ───────────────────────────────────────────────────────
function renderResult() {
  ranked = rankPlaces();
  resultIdx = 0;
  toggleHeadNav(false);
  setProgress(1);
  if (!ranked.length) { renderNoMatch(); return; }
  paintResult();
}

function renderNoMatch() {
  const inner = document.getElementById('quizInner');
  inner.innerHTML = `
    <div class="quiz-gate">
      <div class="quiz-gate-ico">🙈</div>
      <div class="quiz-gate-title">Não achei nada agora</div>
      <div class="quiz-gate-sub">Nenhum lugar bateu com esses filtros.<br>Tenta de novo com outras respostas.</div>
      <button class="quiz-gate-btn" id="quizRetryBtn">Refazer o quiz</button>
    </div>`;
  document.getElementById('quizRetryBtn').onclick = startQuiz;
}

function paintResult() {
  const p = ranked[resultIdx % ranked.length];
  const inner = document.getElementById('quizInner');
  const reasons = reasonsFor(p);
  const relaxNote = lastCtx?.relaxedOpen
    ? '<div class="quiz-relax">Nada aberto agora bateu 100% — essa é a melhor pedida mesmo assim.</div>' : '';

  inner.innerHTML = `
    <div class="quiz-result" id="quizResult">
      <div class="quiz-result-kicker">Seu rolê de hoje é</div>
      <div class="quiz-hero bg-${p.bg || ''}" id="quizHero">
        <div class="quiz-hero-fallback">${catIcon(p.c, 46, 1.4)}</div>
        <div class="quiz-hero-grad"></div>
        <div class="quiz-hero-info">
          <div class="quiz-hero-name">${p.n}</div>
          <div class="quiz-hero-meta">${p.c || ''}${p.b ? ' · ' + p.b : ''}${p.p ? ' · ' + p.p : ''}</div>
        </div>
      </div>
      ${relaxNote}
      <div class="quiz-reasons-lbl">Por que combina</div>
      <div class="quiz-reasons">${reasons.map(r => `<span class="quiz-reason">${r}</span>`).join('')}</div>

      <div class="quiz-actions">
        <button class="quiz-act primary" id="quizSave">${ic('bookmark', 17)} Salvar</button>
        <button class="quiz-act" id="quizMap">${ic('map-pin', 17)} Ver no mapa</button>
      </div>
      <button class="quiz-act ghost" id="quizReroll">${ic('undo', 16)} Não curti, sugere outro</button>

      <div class="quiz-more">
        <button class="quiz-more-toggle" id="quizMoreToggle">Ver mais opções pra você</button>
        <div class="quiz-more-list" id="quizMoreList" style="display:none"></div>
      </div>
    </div>`;

  loadHero(p);

  // Salvar → favoritos
  const saveBtn = document.getElementById('quizSave');
  const alreadySaved = window.dmIsSaved && window.dmIsSaved(p.id);
  if (alreadySaved) markSaved(saveBtn);
  saveBtn.onclick = () => {
    window.dmSavePlace && window.dmSavePlace(p);
    markSaved(saveBtn);
    window.dmToast && window.dmToast('Salvo nos seus lugares!');
  };

  document.getElementById('quizMap').onclick = () => {
    const q = encodeURIComponent(`${p.n}, ${p.a || ''}, Curitiba, PR`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
  };

  document.getElementById('quizReroll').onclick = () => {
    resultIdx++;
    const el = document.getElementById('quizResult');
    if (el) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }
    paintResult();
  };

  // Abrir o perfil completo ao tocar no card
  document.getElementById('quizHero').onclick = () => {
    closeQuizNow();
    onOpenProfileCb && onOpenProfileCb(p);
  };

  // Mais opções
  const toggle = document.getElementById('quizMoreToggle');
  toggle.onclick = () => {
    const list = document.getElementById('quizMoreList');
    const open = list.style.display !== 'none';
    if (open) { list.style.display = 'none'; toggle.textContent = 'Ver mais opções pra você'; return; }
    renderMoreList(list, p.id);
    list.style.display = 'flex';
    toggle.textContent = 'Ocultar opções';
  };
}

function markSaved(btn) {
  if (!btn) return;
  btn.classList.add('done');
  btn.innerHTML = `${ic('check', 17)} Salvo`;
}

function loadHero(p) {
  const hero = document.getElementById('quizHero');
  if (!hero) return;
  const apply = (url) => {
    if (!url) return;
    hero.style.backgroundImage = `url("${url}")`;
    const fb = hero.querySelector('.quiz-hero-fallback');
    if (fb) fb.style.display = 'none';
  };
  if (Array.isArray(p.photos) && p.photos.length) apply(p.photos[0]);
  else if (p.pid) fetchPlacePhoto(p.pid).then(apply);
}

function renderMoreList(container, excludeId) {
  const list = ranked.filter(p => p.id !== excludeId).slice(0, 8);
  container.innerHTML = '';
  list.forEach(p => {
    const row = document.createElement('button');
    row.className = 'quiz-more-row';
    row.innerHTML = `
      <span class="quiz-more-thumb bg-${p.bg || ''}" id="qmore-${p.id}">${catIcon(p.c, 18, 1.7)}</span>
      <span class="quiz-more-txt">
        <span class="quiz-more-name">${p.n}</span>
        <span class="quiz-more-meta">${p.c || ''}${p.b ? ' · ' + p.b : ''}</span>
      </span>
      <span class="quiz-more-price">${p.p || ''}</span>`;
    row.onclick = () => { closeQuizNow(); onOpenProfileCb && onOpenProfileCb(p); };
    container.appendChild(row);
    const url0 = Array.isArray(p.photos) && p.photos.length ? p.photos[0] : null;
    if (url0) { const t = row.querySelector('.quiz-more-thumb'); t.style.backgroundImage = `url("${url0}")`; t.innerHTML = ''; }
    else if (p.pid) fetchPlacePhoto(p.pid).then(u => {
      if (!u) return; const t = document.getElementById(`qmore-${p.id}`);
      if (t) { t.style.backgroundImage = `url("${u}")`; t.innerHTML = ''; }
    });
  });
}

// ── Helpers de UI ───────────────────────────────────────────────────
function setProgress(frac) {
  const el = document.getElementById('quizProgress');
  if (el) el.style.width = `${Math.max(6, Math.round(frac * 100))}%`;
}

// Mostra/esconde o "voltar" (some na tela de login e no resultado)
function toggleHeadNav(showBack) {
  const back = document.getElementById('quizBack');
  if (back) back.style.visibility = showBack ? 'visible' : 'hidden';
}

window.openQuiz = () => openQuiz(window.openProfile);
