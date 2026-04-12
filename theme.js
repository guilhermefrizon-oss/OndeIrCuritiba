// ── theme.js ──────────────────────────────────────────────────────
// Gerencia light/dark mode com persistência em localStorage

const THEME_KEY = 'cwb_theme';

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// Aplica tema salvo ao carregar
applyTheme(getTheme());

window.toggleTheme = toggleTheme;
