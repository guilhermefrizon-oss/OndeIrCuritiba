import app from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

// O @react-native-firebase lê automaticamente os arquivos
// google-services.json (Android) e GoogleService-Info.plist (iOS)
// que você baixa do Firebase Console — sem precisar de .env!

export { app, auth, firestore, storage };

// Coleções do Firestore
export const Collections = {
  SAVED:   'saved_places',   // { userId, placeId, createdAt }
  RATINGS: 'ratings',        // { userId, placeId, stars, createdAt }
} as const;
