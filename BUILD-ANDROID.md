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

## Ícone e splash
Já vêm com a marca do app (pin + coração) em todas as densidades — gerados a
partir do `favicon.svg`. Os **fontes** ficam em `resources/` (`icon-only.png`,
`icon-foreground.png`, `icon-background.png`, `splash.png`, `splash-dark.png`).

Pra **regenerar** tudo (ex.: mudou a marca), rode na sua máquina:
```bash
npx @capacitor/assets generate --android
```
(Usa o `sharp`; instala liso no Mac. Aqui no ambiente remoto o proxy bloqueia o
binário, por isso os PNGs foram gerados na mão desta vez.)

## Deep links
- **Já funciona sem domínio:** `daymatch://lugar/ID` (ou `daymatch://?lugar=ID`)
  abre o app direto no lugar. Testar: `adb shell am start -a android.intent.action.VIEW -d "daymatch://lugar/ALGUM_ID"`.
- **App Link https** (`https://SEU-DOMINIO/?lugar=ID` abrir no app) exige **domínio
  próprio** + `assetlinks.json` no site. Há um `intent-filter` comentado no
  `AndroidManifest.xml` pronto pra ativar quando tiver domínio.

## ⚠️ Pendências conhecidas (próximas fases)
- **Login nativo:** o código já está pronto (Fase 2), mas precisa do setup de
  console — ver [`AUTH-NATIVE.md`](./AUTH-NATIVE.md).
- **Ficha da Play:** screenshots, descrição, classificação, formulário de Data Safety.
