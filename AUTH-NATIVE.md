# Login nativo (Android) — Day Match

No app nativo, o `signInWithPopup` da web **não funciona** (WebView). O código já
usa o plugin `@capacitor-firebase/authentication` para o login nativo do Google
e completa a sessão no SDK JS do Firebase (que o Firestore usa). Isso é
automático: na PWA nada muda; dentro do app nativo, o botão "Continuar com o
Google" chama o seletor de conta nativo.

**Mas** o login nativo só passa a funcionar depois de configurar o Firebase para
Android. Sem isso, o build até compila, mas o login falha em runtime.

Projeto Firebase: **`ondeircuritiba-91390`** · Package: **`com.daymatch.curitiba`**

## Passos no console (você) — uma vez

1. **Registrar o app Android no Firebase**
   - Firebase Console → projeto `ondeircuritiba-91390` → ⚙️ → *Seus apps* → **Adicionar app → Android**.
   - *Nome do pacote:* `com.daymatch.curitiba`.
   - Baixar o **`google-services.json`** e colocar em **`android/app/google-services.json`**.
     (Está no `.gitignore` de propósito — é por projeto/máquina.)

2. **Adicionar as impressões digitais SHA (obrigatório pro Google Sign-In)**
   - Pegar o SHA-1/SHA-256 da chave de **debug** (pra testar no emulador):
     ```bash
     cd android && ./gradlew signingReport
     ```
     Copie o SHA-1 e o SHA-256 da variante `debug`.
   - Firebase Console → app Android → **Adicionar impressão digital** → cole SHA-1 (e SHA-256).
   - Quando gerar a versão de **release** (keystore de publicação), repita com o SHA
     dessa keystore. Como a Play usa *App Signing*, adicione também o SHA da chave
     de assinatura que a Play mostra em *Release → Setup → App signing*.
   - Depois de adicionar SHAs, **baixe o `google-services.json` de novo** (ele muda).

3. **Provedor Google habilitado** — Firebase → Authentication → *Sign-in method* →
   **Google** ativo. (Já deve estar, pois a web usa.)

4. **Rebuild**
   ```bash
   npm run sync:android
   npm run open:android   # Android Studio → ▶
   ```

## Como testar
- Rode no emulador (com Google Play/Services) ou num Android real.
- Toque em **Continuar com o Google** → deve abrir o seletor de conta **nativo**
  (não um popup de navegador) e voltar logado.
- Salve um lugar / marque "quero ir" → confirma que a sessão vale no Firestore.

## Observações
- **E-mail/senha** já funciona no nativo sem nenhum setup extra.
- **Sign in with Apple** só importa no iOS (fase futura): exige conta Apple
  Developer, Services ID + chave, provedor Apple no Firebase e capability no Xcode.
  No Android não é necessário.
- **Excluir conta com reautenticação social** (`reauthenticateWithPopup`) ainda
  usa o caminho web; no nativo isso é um ajuste posterior (o e-mail/senha
  reautentica normal). Sinalizado como follow-up.
