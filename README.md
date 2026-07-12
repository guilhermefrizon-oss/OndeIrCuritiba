# Day Match Curitiba 🌆

App estilo Tinder para descobrir os melhores lugares em Curitiba.

## Estrutura modular

```
/
├── index.html          # HTML puro (sem CSS/JS inline)
├── admin.html          # Painel admin
├── css/
│   └── styles.css      # Todo o CSS (light/dark mode)
└── js/
    ├── firebase.js     # Init Firebase (único — sem duplicação)
    ├── theme.js        # Light/dark mode
    ├── auth.js         # Google Auth
    ├── store.js        # Firestore (lugares, favoritos)
    ├── photos.js       # Google Places API (fotos, coordenadas)
    ├── comments.js     # Comentários em tempo real
    ├── favorites.js    # Tela de favoritos (lista + mapa)
    ├── search.js       # Busca overlay + filtro por bairro
    └── app.js          # Lógica principal (cards, swipe, perfil)
```

## Novas funcionalidades (v2)

- **Busca** — overlay com busca por nome + filtro por bairro
- **Favoritos dedicados** — tela com agrupamento por categoria
- **Mapa no favoritos** — Google Maps com pins dos lugares salvos
- **Remover favorito** — botão X em cada item da lista
- **Bottom nav** com 3 abas: Descobrir / Salvos / Buscar

## Clareza & funcionalidade (v3)

- **Onboarding explicativo** — tela de boas-vindas mostra a mecânica de swipe (→ quero ir, ← não hoje, 🔖 salvar)
- **Dica animada de swipe** — mãozinha animada no primeiro card (só na primeira visita)
- **Toasts explicativos** — cada ação explica onde o lugar foi parar ("rolê de hoje", "salvos")
- **Desfazer** — todo swipe mostra um toast com botão Desfazer (pulou/curtiu/visitou sem querer)
- **Fim do baralho** — tela "Você viu tudo por hoje!" com botão para rever os pulados
- **Mapa completo** — aba Mapa mostra TODOS os lugares (antes ficava em branco), com pins coloridos por estado (quero ir / salvos / demais) e filtrado pela categoria selecionada
- **Aberto agora** — badge no card calculado a partir do horário de funcionamento
- **Distância** — mostra a distância até o lugar se o usuário permitir geolocalização (requer lat/lng no cadastro do lugar)
- Cards já curtidos/pulados saem do baralho de verdade (antes ficavam em loop)

## UI de ícones + filtro (v4)

- **Ícones de traço** (`js/icons.js`) substituem todos os emojis da UI — mesmo estilo da bottom nav; categorias mapeadas por nome em `catIconName()`
- **Filtro "Abertos agora"** — pill ao lado da cidade; filtra baralho e mapa
- **Drag consertado de vez**: a classe `.su` (animation com fill-mode `both`) sobrescrevia o `style.transform` do drag — cards não usam mais animação de entrada
- Toasts sem emoji; card com fundo opaco; efeito de pilha visível

## Deploy (GitHub Pages)

```bash
git add .
git commit -m "feat: v2 modular + busca + favoritos + mapa"
git push origin main
```

Settings → Pages → Branch: main → / (root) → Save

## Permissões nativas (App Store / Google Play)

O app usa a **localização** para mostrar os lugares próximos no mapa. Na web,
o navegador cuida do prompt de permissão automaticamente. No app nativo
(Capacitor), é obrigatório declarar o motivo do uso, senão as lojas reprovam.
Textos prontos para quando montarmos o Capacitor:

**iOS — `ios/App/App/Info.plist`:**

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>O Day Match Curitiba usa sua localização para mostrar no mapa os lugares mais próximos de você.</string>
```

**Android — `android/app/src/main/AndroidManifest.xml`:**

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

A localização é usada **apenas em primeiro plano** (quando o mapa está aberto);
não há rastreamento em segundo plano.
