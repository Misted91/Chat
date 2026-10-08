import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  OAuthProvider,
  signInWithPopup,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

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

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

const SSO_PROVIDER_ID = 'oidc.authentik';
const ssoProvider = new OAuthProvider(SSO_PROVIDER_ID);
ssoProvider.addScope('openid');
ssoProvider.addScope('profile');
ssoProvider.addScope('email');

const SSO_ID_TOKEN_KEY = 'sso-id-token';

export async function loginWithSso() {
  await setPersistence(auth, browserLocalPersistence);
  const result = await signInWithPopup(auth, ssoProvider);
  const credential = OAuthProvider.credentialFromResult(result);
  if (credential && credential.idToken) localStorage.setItem(SSO_ID_TOKEN_KEY, credential.idToken);
  return result;
}

export function handleRedirectResult() {
  return getRedirectResult(auth);
}

const SSO_LOGOUT_FLOW_URL = 'https://sso.vps.totolol24.ovh/api/v3/flows/executor/default-invalidation-flow/';

export async function logout() {
  localStorage.removeItem(SSO_ID_TOKEN_KEY);
  try {
    await fetch(SSO_LOGOUT_FLOW_URL, { mode: 'no-cors', credentials: 'include', cache: 'no-store' });
  } catch (err) {
    console.warn('Déconnexion SSO impossible', err);
  }
  await signOut(auth);
}

export function updateUserProfile(profile) {
  if (!auth.currentUser) throw new Error('Utilisateur non connecté.');
  return updateProfile(auth.currentUser, profile);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
