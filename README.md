# OndeIr Curitiba 🌆

App estilo Tinder para descobrir os melhores lugares em Curitiba, com fotos reais via Google Places API e favoritos salvos no Firebase Firestore.

## ✨ Funcionalidades

- 90 lugares organizados em 10 categorias
- Swipe para curtir ou passar
- Fotos reais carregadas via **Google Places API (New)**
- Favoritos salvos no **Firebase Firestore** (persistem entre sessões)
- ID de usuário anônimo gerado automaticamente
- Filtro por categoria

## 🚀 Deploy (GitHub Pages)

```bash
git add .
git commit -m "feat: app completo com firebase e google photos"
git push origin main
```

Depois: **Settings → Pages → Branch: main → / (root) → Save**

URL: `https://SEU_USUARIO.github.io/SEU_REPO`

## 🔥 Firestore — Regras

No Firebase Console → Firestore → **Regras**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /favorites/{userId}/places/{placeId} {
      allow read, write: if true;
    }
  }
}
```

## 📁 Estrutura

```
/
├── index.html   # App completo (HTML + CSS + JS)
└── README.md
```

## 🔑 APIs utilizadas

| API | Uso |
|-----|-----|
| Google Places API (New) | Fotos dos lugares |
| Firebase Firestore | Salvar favoritos do usuário |

## ⚠️ Observação sobre as chaves

As API Keys ficam visíveis no HTML público — isso é esperado para apps web client-side.
A proteção dos dados do Firestore é feita pelas **Regras de Segurança**, não pela chave.
Para a Google Places API, configure restrições de domínio no [Google Cloud Console](https://console.cloud.google.com) → Credenciais → sua chave → Restrições de aplicativo.
