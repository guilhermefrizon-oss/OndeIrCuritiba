# Checklist de lançamento — daymatch (OndeIr Curitiba)

O app já está no ar e instalável. Antes de convidar gente de verdade, faltam
alguns passos — principalmente de **segurança** e **custo** (os obrigatórios).

**Legenda de quem faz:**
- 🔴 **Você (console)** — precisa ser feito por você fora do código (Firebase / Google Cloud).
- 🔵 **Posso fazer** — é só me pedir no chat.

A ordem que importa: **publicar as regras → 2 etapas → travar a chave → cadastrar conteúdo → convidar.**

---

## ✅ Já está pronto
- [x] **App no ar como PWA** — GitHub Pages, instalável na tela inicial (iPhone e Android), sem loja e sem custo.
- [x] **Funcionalidades principais** — baralho de swipe, quiz “Me ajude a escolher”, horário por dia + filtro “Aberto em…”, ações no perfil, favoritos / quero-ir / mapa / busca.
- [x] **Painel admin** — lugares, categorias, métricas, editor do quiz, conversor de horários.
- [x] **Correções recentes** — fuso (“zera à meia-noite”), miniaturas que faltavam, piscar de tela no Android.
- [x] **Identidade visual** — Cobalto Vibrante `#2F55F0` nos detalhes; preto & branco como principal.

## 🔴 Obrigatório antes de abrir pra geral (segurança + custo)
- [ ] **Publicar as Firestore Rules** — 🔴 Você (console). A barreira de segurança **real**. O arquivo [`firestore.rules`](./firestore.rules) já está pronto: cole no console (Firestore → Regras → testar no Playground → Publicar). Sem isso, qualquer um pode escrever no banco.
- [ ] **Ativar Verificação em 2 Etapas nas contas admin** — 🔴 Você (console). O login admin é via Google; ative 2 etapas em cada conta e confira que a coleção `/admins` só tem os e-mails certos. É o “2FA do admin” de verdade.
- [ ] **Restringir a chave do Google Maps/Places** — 🔴 Você (console). No Google Cloud, trave a chave por domínio (referrer) e só nas APIs usadas. Evita roubo de cota.
- [ ] **Criar alerta de faturamento** — 🔴 Você (console). A Places API é paga após a cota grátis e o app busca foto por card. Ponha orçamento + alerta no Google Cloud. (Ver “fotos hospedadas” abaixo.)

## 🟡 Recomendado antes de divulgar
- [ ] **Definir o nome final do app** — 🔵 Posso fazer. O manifesto ainda diz “Day Match Curitiba” (é o nome que sai no ícone instalado). Me diz o nome definitivo que eu acerto manifesto, título e wordmark.
- [ ] **Cadastrar bons lugares (foto + horário)** — 🔴 Você (admin). Cadastre lugares com fotos **hospedadas** (o admin faz isso) e rode “Converter horários”. Fotos hospedadas também reduzem as chamadas pagas à API.
- [ ] **Testar cadastro/login numa conta nova** — 🔴 Você (celular). Entrar do zero (Google e e-mail), salvar um lugar, marcar “quero ir”.
- [ ] **Revisar a política de privacidade** — 🔵 Posso ajudar. Já existe `privacidade.html`; como o app coleta conta Google e localização, vale conferir se está atual e linkada.

## 🔵 Como as pessoas começam a usar (distribuição, zero custo)
- **Link:** mande a URL do GitHub Pages por WhatsApp (confirme a exata em Settings → Pages).
- **iPhone:** abrir no **Safari** → Compartilhar → **Adicionar à Tela de Início**.
- **Android:** abrir no **Chrome** → menu ⋮ → **Instalar app**.
- ⚠️ **Não** peça pra abrir “dentro do Instagram/Facebook” — o navegador embutido trava o login. Peça pra abrir no Safari/Chrome. Por WhatsApp o link abre certo.

## ⚪ Opcional / depois (não bloqueia o lançamento)
- [ ] **Domínio próprio** — 🔵 Posso configurar. Mais bonito que `…github.io`. Domínio ~US$10/ano; hosting continua grátis.
- [ ] **Verificação de e-mail no cadastro** — 🔵 Posso fazer.
- [ ] **Modo offline (service worker)** — 🔵 Posso fazer. Abre mais rápido e aguenta sinal ruim.
- [ ] **Notificações push** — 🔵 Posso fazer. Android e iPhone (iOS 16.4+ com o app na tela). Bom gancho de retorno.
- [ ] **Lojas (Play / App Store)** — só se quiser. Play US$25 (uma vez), Apple US$99/ano. **Não é necessário** — o PWA cobre iPhone e Android sem pagar.
