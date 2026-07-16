// ── corrections.js ─────────────────────────────────────────────────
// "Sugerir correção" no perfil do estabelecimento.
// Usuário logado aponta um campo errado e envia o valor correto; a
// sugestão vai para a coleção `corrections` (status 'pending') e é
// revisada/aprovada por um admin no painel.

import { db, addDoc, collection, serverTimestamp } from './firebase.js';
import { ic } from './icons.js';

// Campos que o usuário pode sugerir corrigir. A chave casa com o campo do
// lugar (p.n, p.a, …) para o admin conseguir aplicar com um clique.
const FIELDS = [
  { key: 'n',    label: 'Nome do lugar' },
  { key: 'a',    label: 'Endereço' },
  { key: 'b',    label: 'Bairro' },
  { key: 'h',    label: 'Horário de funcionamento' },
  { key: 'ig',   label: 'Instagram' },
  { key: 'p',    label: 'Faixa de preço' },
  { key: 'cats', label: 'Categoria' },
  { key: 'other',label: 'Outra informação' },
];

// Valor atual do lugar para o campo escolhido (mostrado como referência).
function currentValue(place, key) {
  switch (key) {
    case 'n':  return place.n  || '';
    case 'a':  return place.a  || '';
    case 'b':  return place.b  || '';
    case 'h':  return place.h  || '';
    case 'ig': return place.ig || '';
    case 'p':  return place.p  || '';
    case 'cats': return (Array.isArray(place.cats) ? place.cats.join(', ') : (place.c || ''));
    default:   return '';
  }
}

let _place = null;

// ── Botão no perfil ────────────────────────────────────────────────
// Chamado pelo openProfile a cada abertura. Botão discreto, mas logo abaixo
// das ações (Já fui/Quero ir) — visível sem precisar rolar até o fim dos
// comentários.
export function renderCorrectionButton(place) {
  _place = place;
  const old = document.getElementById('correctBtnWrap');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = 'correctBtnWrap';
  wrap.className = 'correct-btn-wrap';
  wrap.innerHTML =
    `<button class="correct-btn" onclick="window.openCorrectSheet()">
       ${ic('edit', 13)} Sugerir correção nas informações
     </button>`;

  // Ancora logo depois das ações do perfil (ou da grade de infos, ou, por
  // último, no fim do corpo). Assim não fica enterrado após os comentários.
  const anchor = document.getElementById('profileActions')
              || document.getElementById('profileInfoGrid');
  if (anchor) anchor.insertAdjacentElement('afterend', wrap);
  else {
    const body = document.getElementById('profileBody');
    if (body) body.appendChild(wrap);
  }
}

// ── Abrir a sheet ──────────────────────────────────────────────────
window.openCorrectSheet = () => {
  const bd = document.getElementById('correctSheetBackdrop');
  if (!bd || !_place) return;

  document.getElementById('correctSheetPlace').textContent = _place.n || '';
  buildSheetBody();

  bd.style.display = 'flex';
  window.registerOverlay('correctSheet', doCloseCorrectSheet);
};

function buildSheetBody() {
  const area = document.getElementById('correctSheetBody');
  if (!area) return;

  // Sem login: pede pra entrar (correções ficam ligadas à conta).
  if (!window.currentUser) {
    area.innerHTML =
      `<p class="correct-login-msg">Entre na sua conta para sugerir uma correção. Assim conseguimos revisar e te agradecer. 🙌</p>
       <button class="correct-submit" onclick="window.dismissOverlay('correctSheet');showAuthModal&&showAuthModal()">Entrar</button>`;
    return;
  }

  area.innerHTML = `
    <label class="correct-field-label">O que está errado?</label>
    <select class="correct-select" id="correctField" onchange="window._onCorrectFieldChange()">
      ${FIELDS.map(f => `<option value="${f.key}">${f.label}</option>`).join('')}
    </select>

    <div class="correct-current" id="correctCurrent"></div>

    <label class="correct-field-label" id="correctSuggestLabel">Informação correta</label>
    <textarea class="correct-input" id="correctSuggest" rows="2" maxlength="400"
      placeholder="Escreva a informação certa..."></textarea>

    <label class="correct-field-label">Detalhes (opcional)</label>
    <textarea class="correct-input" id="correctNote" rows="2" maxlength="400"
      placeholder="Algo que ajude a gente a conferir (ex: link, de onde veio a info)..."></textarea>

    <button class="correct-submit" id="correctSubmitBtn" onclick="window.submitCorrection()">
      Enviar sugestão
    </button>`;

  window._onCorrectFieldChange();
}

// Atualiza o "valor atual" e o rótulo conforme o campo escolhido.
window._onCorrectFieldChange = () => {
  const sel = document.getElementById('correctField');
  const cur = document.getElementById('correctCurrent');
  const lbl = document.getElementById('correctSuggestLabel');
  if (!sel || !_place) return;
  const key = sel.value;
  const val = currentValue(_place, key);
  if (cur) {
    cur.innerHTML = (key !== 'other' && val)
      ? `<span class="correct-current-tag">Hoje:</span> ${esc(val)}`
      : '';
  }
  if (lbl) lbl.textContent = key === 'other' ? 'Qual a informação correta?' : 'Informação correta';
};

// ── Enviar ─────────────────────────────────────────────────────────
window.submitCorrection = async () => {
  const user = window.currentUser;
  if (!user || !_place) return;

  const key   = document.getElementById('correctField').value;
  const field = FIELDS.find(f => f.key === key) || FIELDS[FIELDS.length - 1];
  const suggested = document.getElementById('correctSuggest').value.trim();
  const note      = document.getElementById('correctNote').value.trim();

  if (!suggested) {
    window.showToast?.('Escreva a informação correta antes de enviar.');
    return;
  }

  const btn = document.getElementById('correctSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  try {
    await addDoc(collection(db, 'corrections'), {
      placeId:      _place.id,
      placeName:    _place.n || '',
      field:        key,
      fieldLabel:   field.label,
      currentValue: currentValue(_place, key),
      suggested,
      note:         note || null,
      status:       'pending',
      userId:       user.uid,
      userName:     user.displayName || 'Usuário',
      userEmail:    user.email || null,
      createdAt:    serverTimestamp(),
    });
    window.dismissOverlay('correctSheet');
    window.showToast?.('Valeu! Sua sugestão foi enviada pra revisão. 🙌', true);
  } catch (e) {
    console.warn('Erro ao enviar correção:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar sugestão'; }
    window.showToast?.('Não consegui enviar agora. Tente de novo.');
  }
};

// ── Fechar ─────────────────────────────────────────────────────────
function doCloseCorrectSheet() {
  const bd = document.getElementById('correctSheetBackdrop');
  if (bd) bd.style.display = 'none';
}
window.closeCorrectSheet = (e) => {
  if (e && e.target !== document.getElementById('correctSheetBackdrop')) return;
  window.dismissOverlay('correctSheet');
};

// Reconstrói o corpo da sheet quando o login muda (se estiver aberta).
window.addEventListener('authChanged', () => {
  const bd = document.getElementById('correctSheetBackdrop');
  if (bd && bd.style.display === 'flex') buildSheetBody();
});

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.renderCorrectionButton = renderCorrectionButton;
