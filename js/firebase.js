// ── firebase.js ───────────────────────────────────────────────────
// Inicializa Firebase uma única vez e exporta db, auth e helpers

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, initializeFirestore,
  doc, getDoc, setDoc, deleteDoc, getDocs,
  collection, increment, addDoc, query, orderBy, onSnapshot, serverTimestamp,
  runTransaction, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCz1Ti_twBmtDxGOc9cGiXHBNbFTOdvYAg",
  authDomain: "ondeircuritiba-91390.firebaseapp.com",
  projectId: "ondeircuritiba-91390",
  storageBucket: "ondeircuritiba-91390.firebasestorage.app",
  messagingSenderId: "208330257440",
  appId: "1:208330257440:web:6df311fc5c60c389117845"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// O transporte padrão do Firestore (WebChannel/streaming) fica bloqueado
// em várias redes reais — VPN, iCloud Private Relay, proxies corporativos,
// algumas operadoras móveis — e aí getDocs() nunca resolve (spinner infinito,
// "Carregando lugares…" que não sai). Forçar long-polling usa HTTP comum,
// que funciona em qualquer lugar. Perde um pouco de eficiência, mas garante
// que o app sempre carregue.
let db;
try {
  db = initializeFirestore(app, { experimentalForceLongPolling: true });
} catch (e) {
  // Já inicializado (ex.: hot reload) → reaproveita a instância existente.
  db = getFirestore(app);
}

const auth = getAuth(app);

export { db, auth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged };
export { doc, getDoc, setDoc, deleteDoc, getDocs, collection, increment };
export { addDoc, query, orderBy, onSnapshot, serverTimestamp };
export { runTransaction, writeBatch };
