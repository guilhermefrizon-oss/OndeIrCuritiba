# Conformidade com as lojas — Day Match

Este app **vai virar app nativo** na App Store e no Google Play. Este é o
checklist vivo do que as lojas exigem — mantido atualizado conforme a gente
avança. Toda mudança nova deve ser pensada pra passar nas duas lojas.

**Abordagem técnica:** embrulhar o app web com **Capacitor** (mesmo código
dentro de uma casca nativa iOS/Android). Precisa se comportar como app de
verdade — não pode parecer "só um site" (Apple 4.2).

**Contas necessárias:** Apple Developer (US$99/ano) · Google Play (US$25, uma vez).

---

## App Store (Apple) — as regras que mais pegam

- [x] **Navegar sem login** (5.1.1) — descobrir/swipar “Não hoje” é livre; só **Salvar** e **Quero ir** pedem conta. ✅ feito
- [~] **Sign in with Apple** (4.8) — como oferecemos login Google, a Apple **exige** login Apple equivalente. Código pronto e o botão aparece **só em dispositivos Apple** (iOS/iPadOS/macOS); no Android/Windows fica oculto (Google já cobre). **Pendente:** configurar o provedor Apple no Firebase (Services ID + chave + verificação de domínio) — precisa da conta Apple Developer.
- [x] **Excluir conta dentro do app** (5.1.1(v)) — função `deleteAccount` existe. Garantir que fique fácil de achar no perfil. ✅ existe
- [ ] **Moderação de conteúdo do usuário** (1.2) — comentários/avaliações estão **desligados**. Se ligar, exige **denunciar**, **bloquear usuário** e **filtro** de conteúdo.
- [ ] **Privacy “nutrition labels”** — declarar coleta (conta Google, localização) no App Store Connect + política de privacidade linkada (`privacidade.html`).
- [x] **Textos de permissão** — localização já tem texto pronto (ver README). Qualquer permissão nova precisa de justificativa.
- [ ] **Não parecer webview** (4.2) — usar recursos nativos (push, localização), sem cara de navegador, tratar offline.

## Google Play — pendências equivalentes

- [ ] **Data safety form** — declarar dados coletados/compartilhados.
- [ ] **Exclusão de conta** — link in-app **e** por web (Google exige os dois).
- [ ] **Política de privacidade** linkada na ficha.
- [ ] **Target API level** atual + permissões declaradas no manifesto.

## Assets e ficha (as duas lojas)

- [ ] Ícones em todas as resoluções + splash screen.
- [ ] Screenshots por tamanho de tela, descrição, categoria, classificação etária.

---

### Princípios que sigo em toda mudança
1. Não forçar login onde a loja não permite (navegação livre; conta só pro que é de perfil).
2. Manter Sign in with Apple sempre que houver login social.
3. Exclusão de conta sempre acessível.
4. Conteúdo de usuário só entra com moderação.
5. Toda permissão com justificativa clara.
6. Nada de “só um webview”.
