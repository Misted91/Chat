/*
 * Initialisation de Firebase (app, authentification Google, Firestore).
 * -------------------------------------------------------------
 * La configuration ci-dessous est publique par nature (côté client) :
 * la sécurité réelle se règle dans les « Règles » Firestore, pas ici.
 *
 * À activer dans la console Firebase (https://console.firebase.google.com) :
 *   - Authentication → Sign-in method → Google
 *   - Firestore Database → Créer une base
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCaPgv9jXJuywTv80sMn8zmkTJNbkiohlk',
  authDomain: 'chat-fd96b.firebaseapp.com',
  projectId: 'chat-fd96b',
  storageBucket: 'chat-fd96b.firebasestorage.app',
  messagingSenderId: '546656920243',
  appId: '1:546656920243:web:7a63781a0aa3e49ff946c6',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

const provider = new GoogleAuthProvider();

export function loginWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function logout() {
  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
