// Monta a pasta www/ com APENAS os arquivos do app do usuário, que o
// Capacitor empacota dentro do app nativo. Mantém o site na raiz intacto
// (o GitHub Pages continua servindo da raiz).
//
// De propósito NÃO inclui: admin.html (ferramenta interna), node_modules,
// android/, docs (*.md), configs de build.
import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www  = join(root, 'www');

// Whitelist do que vai pro app nativo.
const INCLUDE = [
  'index.html',
  'privacidade.html',
  'css',
  'js',
  'data',
  'sw.js',
  'site.webmanifest',
  'favicon.svg',
  'favicon-16.png',
  'favicon-32.png',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

let copied = 0;
for (const entry of INCLUDE) {
  const src = join(root, entry);
  if (!existsSync(src)) { console.warn(`· pulou (não existe): ${entry}`); continue; }
  cpSync(src, join(www, entry), { recursive: true });
  copied++;
}

console.log(`www/ montado com ${copied} itens.`);
