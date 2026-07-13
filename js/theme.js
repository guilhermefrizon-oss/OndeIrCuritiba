// ── theme.js ──────────────────────────────────────────────────────
import { ic } from './icons.js';

const K = 'cwb_theme';
const get = () => localStorage.getItem(K) || 'light';

function apply(t) {
  document.documentElement.setAttribute('data-theme', t);
  const b = document.getElementById('themeBtn');
  if (b) b.innerHTML = t === 'dark' ? ic('sun', 17) : ic('moon', 17);
}

export function toggleTheme() {
  const n = get() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(K, n);
  apply(n);
}

// ── Altura do viewport (só fallback p/ browsers sem dvh) ───────────
// O CSS já usa 100dvh, que os browsers modernos ajustam suavemente quando
// a barra de endereço do mobile some/aparece.
//
// A versão antiga recalculava a altura via JS ouvindo o `visualViewport`,
// que no Android muda de pixel em pixel durante o rolar da barra de
// endereço. Isso criava um loop resize→altura→resize e a tela PISCAVA.
// Agora o JS só entra quando o browser NÃO suporta dvh, e sem ouvir o
// visualViewport (a fonte do tremor).
function setAppHeight() {
  document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
}
const supportsDvh = !!(window.CSS && CSS.supports && CSS.supports('height', '100dvh'));
if (!supportsDvh) {
  setAppHeight();
  let _t;
  const onResize = () => { clearTimeout(_t); _t = setTimeout(setAppHeight, 150); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
}

// Aplica imediatamente (antes do DOMContentLoaded)
apply(get());
window.toggleTheme = toggleTheme;
