export const colors = {
  bg: '#0A0810',
  bg2: '#100D1A',
  bg3: '#181324',
  bg4: '#221B33',
  bg5: '#2E2445',

  p100: '#DDD5FF',
  p200: '#C4B5FD',
  p300: '#A78BFA',
  p400: '#8B5CF6',
  p500: '#7C3AED',
  p600: '#6D28D9',

  text: '#F2EEFF',
  text2: '#9C8FC0',
  text3: '#564E70',

  green: '#34D399',
  red: '#F87171',
  gold: '#FFD166',

  white: '#FFFFFF',
  black: '#000000',
};

export const gradients: Record<string, [string, string, string]> = {
  rooftop:  ['#1a0f35', '#2d1a5c', '#7c3aed'],
  cafe:     ['#180e30', '#2a1850', '#7c3aed'],
  bar:      ['#0f0d25', '#1e1845', '#6d5af0'],
  balada:   ['#1a0830', '#340e5e', '#a855f7'],
  romantico:['#1a0d2e', '#2f1555', '#9333ea'],
  barato:   ['#0d1030', '#181d52', '#6366f1'],
  alta:     ['#150e28', '#261848', '#7c3aed'],
  vegano:   ['#0e1820', '#162d3c', '#2dd4bf'],
  pet:      ['#180f2e', '#2e1852', '#a78bfa'],
  insta:    ['#1a0a28', '#380f52', '#c026d3'],
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 26,
  full: 999,
};

export const typography = {
  h1: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -1 },
  h2: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5 },
  h3: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  label: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1.5 },
};
