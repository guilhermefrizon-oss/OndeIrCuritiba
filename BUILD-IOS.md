# Build iOS (Capacitor) — Day Match

O mesmo app web empacotado para iPhone. Projeto nativo em `ios/` (versionado;
saídas de build são ignoradas).

- **App ID:** `com.daymatch.curitiba`
- **Nome:** Day Match

## Testar no SEU iPhone de graça (sem conta paga)

Com um Apple ID gratuito dá pra instalar direto no seu aparelho pelo Xcode.
Limitações do modo gratuito: o app **expira em 7 dias** (reinstala pelo Xcode
e volta), máx. 3 apps por aparelho e sem push notifications. Pra publicar na
App Store ou distribuir via TestFlight, aí sim precisa do Apple Developer
Program (US$ 99/ano).

## Pré-requisitos (uma vez)

1. **Xcode** — App Store do Mac (grátis, download grande ~15 GB).
   Abra uma vez e aceite a licença.
2. **CocoaPods** — no Terminal:
   ```bash
   brew install cocoapods
   # (sem Homebrew: sudo gem install cocoapods)
   ```
3. **Seu Apple ID no Xcode** — Xcode → Settings → Accounts → `+` → entre com
   seu Apple ID (o mesmo do iPhone).

## Passo a passo

```bash
# na pasta do repo
npm install          # se ainda não rodou nesta máquina
npm run sync:ios     # monta o www/ e sincroniza com o projeto iOS (roda o pod install)
npm run open:ios     # abre o Xcode no projeto certo (App.xcworkspace)
```

No Xcode:

1. Clique no projeto **App** (barra lateral) → aba **Signing & Capabilities**.
2. Em **Team**, escolha o seu Apple ID ("Personal Team").
3. Se reclamar do Bundle ID, troque para algo único, ex.:
   `com.daymatch.curitiba.dev` (só para testes; o oficial fica para a loja).
4. Conecte o iPhone por cabo → selecione-o na barra de dispositivos (topo).
5. Aperte **▶ (Run)**.

No iPhone (primeira vez):

- **Confiar no desenvolvedor:** Ajustes → Geral → VPN e Gerenciamento de
  Dispositivo → seu Apple ID → Confiar.
- **Modo Desenvolvedor** (iOS 16+): Ajustes → Privacidade e Segurança →
  Modo do Desenvolvedor → ativar (reinicia o aparelho).

Rode o ▶ de novo depois disso e o app abre no aparelho.

## O que funciona no teste

- Navegar, swipar, e-mail/senha, comentários — tudo, **sem setup extra**.
- **Login Google/Apple** no iOS precisa do setup no Firebase (fase à parte,
  ver `AUTH-NATIVE.md`) — o botão pode falhar até lá.

## Sempre que mudar o app web

```bash
npm run sync:ios
```
e rode o ▶ no Xcode de novo.

## Problemas comuns

- **"Unable to install" / app não abre após 7 dias** → normal no modo
  gratuito; rode o ▶ pelo Xcode de novo.
- **pod install falha** → `cd ios/App && pod repo update && pod install`.
- **Ícone/splash antigos** → Xcode: Product → Clean Build Folder e rode de novo.
