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

const SSO_CLIENT_ID = 'kPKnDXMtb2iX2WUvqYGVocGA9W4eUCHNgnVKJNC6';
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

const SSO_END_SESSION_URL = 'https://sso.vps.totolol24.ovh/application/o/chat/end-session/';

export async function logout() {
  await signOut(auth);
  const params = new URLSearchParams({
    client_id: SSO_CLIENT_ID,
    post_logout_redirect_uri: window.location.origin + window.location.pathname,
  });
  const idToken = localStorage.getItem(SSO_ID_TOKEN_KEY);
  if (idToken) params.set('id_token_hint', idToken);
  localStorage.removeItem(SSO_ID_TOKEN_KEY);
  window.location.assign(`${SSO_END_SESSION_URL}?${params}`);
}

export function updateUserProfile(profile) {
  if (!auth.currentUser) throw new Error('Utilisateur non connecté.');
  return updateProfile(auth.currentUser, profile);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
