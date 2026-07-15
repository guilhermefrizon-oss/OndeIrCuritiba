# Day Match — Próximos passos pra publicar na Google Play

O lado de **código** está pronto. Os passos abaixo são o que só você pode fazer
(console, Mac, contas). Ordem sugerida: **02 → 03 → 04**, tocando a **01** em
paralelo (ela não depende do resto).

**Já pronto no código:**
- Fundação Capacitor + projeto Android (app id `com.daymatch.curitiba`)
- Login Google/Apple nativo (falta só o setup de console — frente 3)
- Ícone e splash da marca em todas as densidades
- Deep links `daymatch://lugar/ID`
- Conteúdo e métricas atualizam ao vivo pelo Firestore (sem reenviar o app)

---

## 01 · Segurança & custo — OBRIGATÓRIO antes de convidar gente
Tudo no console, vale também pro PWA.

- [ ] **Publicar as Firestore Rules**
  1. Firebase Console → projeto `ondeircuritiba-91390` → **Firestore Database** → aba **Regras**.
  2. Cole o conteúdo do arquivo `firestore.rules` do repo.
  3. Teste no **Playground** e clique em **Publicar**.
  - *Por quê:* sem isso, qualquer um consegue escrever no seu banco.

- [ ] **Restringir a chave do Google Maps/Places** (Google Cloud)
  1. Google Cloud Console → **APIs e serviços → Credenciais** → abra sua chave.
  2. *Restrições de aplicativo:* pro site, **Referenciadores HTTP** com `guilhermefrizon-oss.github.io/*`; pro app, **Apps Android** com `com.daymatch.curitiba` + SHA-1 (o mesmo da frente 03).
  3. *Restrições de API:* marque só Places/Maps. Salve.
  - *Por quê:* evita roubo de cota → custo na sua conta.

- [ ] **Criar alerta de faturamento** (Google Cloud)
  1. **Faturamento → Orçamentos e alertas → Criar orçamento**.
  2. Teto mensal (ex.: R$ 50) + alertas em 50% / 90% / 100%.
  - *Por quê:* a Places API é paga depois da cota grátis.

- [ ] **2 etapas nas contas admin + revisar `/admins`**
  1. Conta Google admin → myaccount.google.com/security → **Verificação em duas etapas** → ativar.
  2. Firestore → coleção `admins` → só os e-mails certos.

---

## 02 · Testar o app no seu Mac — COMECE POR AQUI
Sem aparelho Android — use o emulador.

- [ ] **Instalar o Android Studio** — developer.android.com/studio (traz SDK + JDK).
- [ ] **Sincronizar e abrir** (terminal, na pasta do repo):
  ```bash
  npm install
  npm run sync:android
  npm run open:android
  ```
- [ ] **Rodar num emulador com Google Play**
  1. **Device Manager → Create Device** → escolha um modelo com o **ícone da Play Store** (imagem com Google Play).
  2. **▶ Run**. Abre com o ícone e o splash da marca.
  3. Teste: navegar, swipar, abrir um lugar. (Login vem na frente 03.)
  - *Obs.:* a imagem *com Google Play* é o que faz o login Google funcionar. E-mail/senha funciona em qualquer emulador.

---

## 03 · Ligar o login nativo (Firebase)
Código já pronto; falta o setup. Detalhes em `AUTH-NATIVE.md`.

- [ ] **Registrar o app Android no Firebase**
  1. Firebase Console → ⚙️ → **Seus apps → Adicionar app → Android**.
  2. Pacote: `com.daymatch.curitiba`.
  3. Baixe o `google-services.json` → coloque em `android/app/`.
- [ ] **Adicionar as impressões SHA** (obrigatório pro Google)
  ```bash
  cd android && ./gradlew signingReport
  ```
  1. Copie o **SHA-1** e o **SHA-256** da variante `debug`.
  2. Firebase → app Android → **Adicionar impressão digital** → cole os dois.
  3. **Baixe o `google-services.json` de novo** (ele muda) e substitua.
  - *Na hora do release:* repita com o SHA da keystore de publicação.
- [ ] **Rebuild e testar o login**
  ```bash
  npm run sync:android
  ```
  1. Rode e toque em **Continuar com o Google** → deve abrir o seletor nativo e voltar logado.
  2. Salve um lugar pra confirmar a sessão no Firestore.

---

## 04 · Publicar na Google Play

- [ ] **Criar conta no Google Play Console** (US$ 25, uma vez) — play.google.com/console
- [ ] **Gerar o AAB assinado** (Android Studio)
  1. **Build → Generate Signed Bundle / APK → Android App Bundle**.
  2. Crie uma **keystore** e **guarde o arquivo + a senha** — é ela que assina todas as versões futuras (perdê-la = não conseguir atualizar o app).
  3. Build **release** → gera o `.aab`.
- [ ] **Criar o app e subir numa trilha de teste**
  1. Enviar o `.aab` em **Teste interno** primeiro.
  2. Adicione seu e-mail como testador e instale pelo link gerado.
- [ ] **Preencher a ficha da loja**
  1. Nome, descrição curta/longa, categoria, classificação etária (questionário).
  2. Ícone 512×512 (use `resources/icon-only.png`) + **mínimo 2 screenshots** de celular.
- [ ] **Data Safety + política de privacidade**
  1. **Data Safety:** declara conta Google (e-mail, nome) e localização aproximada; finalidade: funcionalidade; não vende dados.
  2. Cole a URL da política (`privacidade.html` já existe — publique e linke).
  3. Confirme que **excluir conta** está acessível no perfil (já existe).
- [ ] **Enviar para revisão** (leva de horas a alguns dias na primeira vez).

---

## 05 · Conteúdo & teste final (antes de divulgar)

- [ ] **Cadastrar bons lugares** no admin (foto hospedada + horário) e rodar "Converter horários".
- [ ] **Testar do zero numa conta nova** (Google e e-mail), salvar um lugar, marcar "quero ir", conferir o mapa.
