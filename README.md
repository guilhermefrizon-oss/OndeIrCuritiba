# OndeIr Curitiba 🌆

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

## Deploy (GitHub Pages)

```bash
git add .
git commit -m "feat: v2 modular + busca + favoritos + mapa"
git push origin main
```

Settings → Pages → Branch: main → / (root) → Save
