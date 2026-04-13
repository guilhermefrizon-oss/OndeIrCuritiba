// ── theme.js ──────────────────────────────────────────────────────
const K = 'cwb_theme';
const get = () => localStorage.getItem(K) || 'light';

function apply(t) {
  document.documentElement.setAttribute('data-theme', t);
  const b = document.getElementById('themeBtn');
  if (b) b.textContent = t === 'dark' ? '☀️' : '🌙';
}

export function toggleTheme() {
  const n = get() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(K, n);
  apply(n);
}

// Aplica imediatamente (antes do DOMContentLoaded)
apply(get());
window.toggleTheme = toggleTheme;
