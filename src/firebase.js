// Firebase Authentication (Google + email sign-in). Loaded only on the login pages.
// The values come from .env (VITE_FIREBASE_*). They are public identifiers, not secrets.
import { api } from './api.js';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // On our own domain the sign-in window shows anwarjewellers.com (requests are proxied by functions/__/).
  authDomain: /(^|\.)anwarjewellers\.com$/.test(window.location.hostname) ? window.location.host : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const firebaseEnabled = Boolean(config.apiKey && config.projectId);

let cached;
async function sdk() {
  if (!cached) {
    cached = (async () => {
      const [{ initializeApp }, a] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
      const app = initializeApp(config);
      const auth = a.getAuth(app);
      auth.useDeviceLanguage();
      return { auth, a };
    })();
  }
  return cached;
}

/** Turns Firebase error codes into friendly messages. */
export function friendlyError(e) {
  const map = {
    'auth/invalid-credential': 'Email or password is not correct.',
    'auth/wrong-password': 'Email or password is not correct.',
    'auth/user-not-found': 'No account found with this email. Please create an account.',
    'auth/email-already-in-use': 'An account with this email already exists. Please log in.',
    'auth/weak-password': 'Password must be at least 8 characters.',
    'auth/password-does-not-meet-requirements': 'Password must be at least 8 characters, with letters and numbers.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before finishing.',
    'auth/cancelled-popup-request': 'Google sign-in was closed before finishing.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Please allow pop-ups and try again.',
    'auth/network-request-failed': 'No internet connection. Please try again.',
    'auth/unauthorized-domain': 'This website address is not yet allowed in Firebase (Authorized domains).',
  };
  return map[e?.code] || e?.message || 'Sign-in failed. Please try again.';
}

/** Exchanges the Firebase sign-in for our own shop session. */
async function toShopSession(fbUser, extra = {}) {
  const idToken = await fbUser.getIdToken(true);
  return api('/auth/firebase', { method: 'POST', body: { idToken, ...extra } });
}

export async function signInWithGoogle() {
  const { auth, a } = await sdk();
  const provider = new a.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const { user } = await a.signInWithPopup(auth, provider);
  return toShopSession(user);
}

/** Returns { user } or { needsVerification: true } when the email is not verified yet. */
export async function signInWithEmail(email, password, extra = {}) {
  const { auth, a } = await sdk();
  const { user } = await a.signInWithEmailAndPassword(auth, email, password);
  if (!user.emailVerified) {
    await a.sendEmailVerification(user).catch(() => {});
    await a.signOut(auth);
    return { needsVerification: true };
  }
  return toShopSession(user, extra);
}

/** Creates the Firebase account and sends the verification email. */
export async function registerWithEmail({ name, email, password }) {
  const { auth, a } = await sdk();
  const { user } = await a.createUserWithEmailAndPassword(auth, email, password);
  await a.updateProfile(user, { displayName: name }).catch(() => {});
  await a.sendEmailVerification(user);
  await a.signOut(auth);
}

export async function sendReset(email) {
  const { auth, a } = await sdk();
  await a.sendPasswordResetEmail(auth, email);
}

export async function firebaseSignOut() {
  if (!firebaseEnabled || !cached) return;
  const { auth, a } = await sdk();
  await a.signOut(auth).catch(() => {});
}
