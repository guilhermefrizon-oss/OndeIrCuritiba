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

// ── Altura real do viewport (corrige barra de endereço mobile) ─────
// dvh funciona em browsers modernos, mas em Android Chrome e iOS Safari
// antigos a barra de navegação/gestos não é descontada corretamente.
// Calculamos a altura real via JS e expômos como --app-height.
function setAppHeight() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', h + 'px');
}
setAppHeight();
window.addEventListener('resize', setAppHeight);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', setAppHeight);
}

// Aplica imediatamente (antes do DOMContentLoaded)
apply(get());
window.toggleTheme = toggleTheme;
