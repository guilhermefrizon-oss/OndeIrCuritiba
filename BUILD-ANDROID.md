# Build Android (Capacitor) — Day Match

O app web é empacotado num app nativo Android com **Capacitor**. O site na raiz
continua igual (GitHub Pages serve da raiz); o app nativo usa uma cópia enxuta
em `www/` (gerada — sem `admin.html`).

- **App ID:** `com.daymatch.curitiba`
- **Nome:** Day Match

## Pré-requisitos (na sua máquina)
- **Node 18+** e npm.
- **Android Studio** (inclui o Android SDK) — https://developer.android.com/studio
- **JDK 17** (o Android Studio já traz um embutido).
- Um celular Android com **depuração USB** ligada, ou um emulador.

> Android **não precisa de Mac**. iOS será uma fase separada e aí sim precisa de Mac + Xcode.

## Passo a passo

```bash
# 1. Instala as dependências (uma vez)
npm install

# 2. Monta o www/ e sincroniza com o projeto Android
npm run sync:android

# 3. Abre o projeto no Android Studio
npm run open:android
```

No Android Studio:
- **Rodar no aparelho/emulador:** botão ▶ (Run 'app').
- **Gerar APK de teste:** Build → Build Bundle(s)/APK(s) → Build APK(s).
- **Gerar AAB p/ Play Store:** Build → Generate Signed Bundle/APK → **Android App Bundle**
  (crie/《use uma keystore e **guarde-a**; é ela que assina todas as versões futuras).

Sempre que mudar o app web, rode `npm run sync:android` de novo antes de buildar.

## O que já está configurado
- Projeto Android nativo em `android/` (versionado no git; saídas de build são ignoradas).
- Plugins nativos: App, Splash Screen, Status Bar, Share, Geolocation.
- Permissões: `INTERNET`, `ACCESS_COARSE_LOCATION` (distância dos lugares).
- Splash nativo com a cor de fundo do app.

## ⚠️ Pendências conhecidas (próximas fases)
- **Login Google/Apple ainda não funciona dentro do app nativo.** O `signInWithPopup`
  da web não roda em WebView — precisa migrar para o plugin nativo do Firebase
  (`@capacitor-firebase/authentication`). Até lá, dá pra navegar/swipar, mas não logar.
- **Ícone/splash em todas as resoluções:** gerar com `@capacitor/assets` a partir de
  um PNG fonte (roda na sua máquina; aqui o proxy bloqueia o download do `sharp`).
- **Deep links** (`?lugar=ID` abrir no app): precisam de domínio próprio.
- **Ficha da Play:** screenshots, descrição, classificação, formulário de Data Safety.
