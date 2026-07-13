# Segurança — OndeIr Curitiba

Guia rápido e honesto. Este app é **client-side** (roda no navegador), então
a segurança **não** vem de "esconder" código: qualquer JS é visível. A
proteção real está nas **regras do Firestore** e nas **contas dos admins**.

Faça os 4 passos abaixo — os dois primeiros são os que realmente importam.

---

## 1. Publicar as Firestore Security Rules (o mais importante)

O arquivo [`firestore.rules`](./firestore.rules) contém as regras recomendadas.
Sem elas bem configuradas, **qualquer pessoa** pode escrever no banco direto
pela API, ignorando o painel admin inteiro.

**Como publicar (pelo console):**
1. Console do Firebase → **Firestore Database** → aba **Regras**.
2. Cole o conteúdo de `firestore.rules`.
3. Clique em **Rules Playground** e teste alguns casos (ver abaixo) antes.
4. **Publicar**.

**Ou pela CLI:** `firebase deploy --only firestore:rules`

**Testes que precisam passar (Playground):**
- Usuário **não-admin** tentando escrever em `places/{id}` (fora de `_likes`) → **negado**.
- Usuário **logado** dando like (só campo `_likes` em `places/{id}`) → **permitido**.
- Usuário lendo os favoritos de **outro** uid → **negado**.
- Admin (e-mail em `/admins`) escrevendo em `app_config/quiz` → **permitido**.

> ⚠️ Revise as regras antes de publicar. Se você usar coleções que não estão
> listadas, elas serão **negadas por padrão** (adicione o `match` correspondente).

---

## 2. 2FA do admin = Verificação em 2 Etapas na conta Google

O login do admin é via **Google**. Então o "2 fatores pra entrar no admin" é,
na prática, ativar a **Verificação em 2 Etapas (2SV)** na conta Google de
**cada** admin. Isso é 2FA de verdade, forçado pelo Google, sem código.

1. Cada admin: [myaccount.google.com/security](https://myaccount.google.com/security)
   → **Verificação em duas etapas** → ativar (app autenticador ou chave de segurança).
2. Confirme que a coleção `/admins` no Firestore tem **só** os e-mails que
   devem ter acesso (um doc por e-mail; o id do doc **é** o e-mail).
3. Com as regras do passo 1, só esses e-mails escrevem no banco — e agora
   cada um exige 2 etapas pra logar.

> Um "PIN/código" escrito em JavaScript no `admin.html` **não** seria 2FA real:
> roda no navegador e é contornável. A rota acima é a correta e gratuita. Se um
> dia quiser MFA forçado pelo servidor (SMS/app), aí é o Firebase Identity
> Platform (upgrade no Google Cloud) — projeto à parte.

---

## 3. Restringir a chave do Google Maps/Places

A chave `AIza...` aparece no código do cliente (inevitável para Maps/Places).
Sem restrição, dá pra **roubar sua cota**. Trave assim:

1. Google Cloud Console → **APIs e serviços** → **Credenciais** → a chave.
2. **Restrições de aplicativo** → **Referenciadores HTTP** → adicione seus
   domínios (ex.: `https://SEU-DOMINIO/*` e o de GitHub Pages).
3. **Restrições de API** → deixe só as APIs usadas (Places API, Maps).
4. Salve. (A chave do **Firebase** em `firebase.js` é pública por design —
   não precisa esconder; quem protege é a regra do Firestore.)

---

## 4. (Opcional) Verificação de e-mail no cadastro

Hoje o cadastro por e-mail/senha entra sem confirmar o e-mail. Se quiser exigir
confirmação, dá pra enviar `sendEmailVerification` no cadastro e checar
`user.emailVerified`. Peça que a gente ligue isso quando quiser.
