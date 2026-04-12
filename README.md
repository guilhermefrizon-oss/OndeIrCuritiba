# OndeIrCuritiba 🟣

App mobile estilo Tinder para descobrir os melhores rolês de Curitiba.

## Stack
- **React Native** + Expo (SDK 51)
- **Expo Router** para navegação
- **Firebase** — Auth + Firestore + Storage
- **React Native Reanimated** para animações de swipe
- **TypeScript**

---

## 1. Pré-requisitos

Instale Node.js (v18+): https://nodejs.org

Instale o Expo CLI:
```bash
npm install -g expo-cli eas-cli
```

Instale o app **Expo Go** no seu celular (iOS ou Android).

> ⚠️ **Importante:** @react-native-firebase requer um build nativo.
> Para testar, use o Expo Dev Client (não o Expo Go padrão).
> Veja o passo 4 abaixo.

---

## 2. Criar projeto no Firebase

1. Acesse https://console.firebase.google.com
2. Clique em "Adicionar projeto" → dê o nome OndeIrCuritiba
3. Desative o Google Analytics (opcional) → Criar projeto

### Ativar Authentication
- Menu lateral: Authentication → Primeiros passos
- Em "Método de login", ative E-mail/senha

### Ativar Firestore
- Menu lateral: Firestore Database → Criar banco de dados
- Escolha "Modo de teste" (permite leitura/escrita por 30 dias)
- Região: southamerica-east1 (São Paulo)

### Ativar Storage
- Menu lateral: Storage → Primeiros passos
- Modo de teste → mesma região

---

## 3. Baixar arquivos de configuração

### Android
1. Firebase Console → Configurações do projeto → aba Geral
2. "Adicionar app" → Android
3. Nome do pacote: com.ondeircuritiba.app
4. Baixe o google-services.json
5. Substitua o arquivo google-services.json na raiz do projeto

### iOS
1. Mesmo lugar → "Adicionar app" → iOS
2. Bundle ID: com.ondeircuritiba.app
3. Baixe o GoogleService-Info.plist
4. Substitua o arquivo GoogleService-Info.plist na raiz do projeto

---

## 4. Instalar dependências e rodar

```bash
npm install
npx expo install expo-dev-client

# Build para Android (primeira vez ~10 min):
eas build --profile development --platform android

# Depois do build, rode o servidor:
npx expo start --dev-client
```

---

## 5. Regras do Firestore

No Firebase Console → Firestore → Regras, cole:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /saved_places/{doc} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    match /ratings/{doc} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

---

## 6. Subir no GitHub

```bash
git init
git add .
git commit -m "feat: OndeIrCuritiba com Firebase"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/ondeircuritiba.git
git push -u origin main
```

---

## Estrutura do projeto

```
ondeircuritiba/
├── app/
│   ├── _layout.tsx              # Root layout + AuthProvider
│   └── (tabs)/
│       ├── _layout.tsx          # Tab bar
│       ├── index.tsx            # Aba Descobrir
│       ├── saved.tsx            # Aba Salvos
│       └── profile.tsx          # Aba Perfil
├── src/
│   ├── components/
│   │   └── PlaceCard.tsx        # Card com swipe gesture
│   ├── screens/
│   │   ├── AuthScreen.tsx       # Login / Cadastro
│   │   ├── DiscoverScreen.tsx
│   │   ├── SavedScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── hooks/
│   │   ├── useAuth.tsx          # Firebase Auth
│   │   ├── useSaved.ts          # Firestore - lugares salvos
│   │   └── useRatings.ts        # Firestore - avaliações
│   ├── data/
│   │   └── places.ts            # 30 lugares de Curitiba
│   └── lib/
│       ├── firebase.ts          # Inicialização Firebase
│       └── theme.ts             # Cores, tipografia, espaçamentos
├── google-services.json         # <- substitua pelo seu (Android)
├── GoogleService-Info.plist     # <- substitua pelo seu (iOS)
└── app.json
```

---

## Próximos passos

- [ ] Fotos reais dos lugares (Firebase Storage)
- [ ] Mapa com pins dos lugares salvos
- [ ] Reviews com comentários no Firestore
- [ ] Push notifications (Firebase Cloud Messaging)
- [ ] Publicar na App Store / Google Play com EAS Build
