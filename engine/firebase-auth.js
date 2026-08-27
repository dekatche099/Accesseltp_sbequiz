/* engine/firebase-auth.js — single shared Firebase Auth + Firestore setup.
 * ============================================================
 * Every page (index.html, grad-track.html, retail-track.html, course.html,
 * workbooks.html) imports THIS ONE FILE for anything auth-related. That's
 * deliberate: the old project had each course page inventing its own PIN
 * logic and its own localStorage key scheme, and that inconsistency is
 * exactly what caused the cross-device sync bugs found earlier. One shared
 * module, one Firebase config, one source of truth for "who is signed in."
 *
 * Firebase Auth persists the session itself (IndexedDB-backed), so unlike
 * the old qb_global_user / qb_global_pin scheme, there is nothing for us
 * to manually read, write, or pass between pages. onAuthChange() below
 * fires with the correct user on every single page load automatically.
 * ============================================================ */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---- Your web app's Firebase configuration (accesseltp-sbe project) ----
// This is safe to be public — see the note in the handover plan on why
// the Firebase config is not a secret. Real protection lives in the
// Firestore Security Rules (firestore.rules), not in hiding this object.
const firebaseConfig = {
  apiKey: "AIzaSyAVedxhvhXuqMWBZDyP--P4Vl3uP0rxtMo",
  authDomain: "accesseltp-sbe.firebaseapp.com",
  projectId: "accesseltp-sbe",
  storageBucket: "accesseltp-sbe.firebasestorage.app",
  messagingSenderId: "354368774959",
  appId: "1:354368774959:web:1be5dc6cdbbb4c6ce777da",
  measurementId: "G-ZSY293K0NL"
};

// getApps()/getApp() guard: several pages may import this module in the
// same page load (e.g. workbooks.html pulls in cloud-sync AND
// workbook-sync), so avoid calling initializeApp() twice.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

// ---- Friendly error messages ----
// Firebase returns codes like "auth/wrong-password" — translate the ones
// trainees will actually hit into plain language.
const FRIENDLY_ERRORS = {
  "auth/email-already-in-use": "That email is already registered — try logging in instead.",
  "auth/invalid-email": "That doesn't look like a valid email address.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/wrong-password": "Wrong password. Try again, or use \"Forgot password?\" below.",
  "auth/invalid-credential": "Wrong email or password. Try again, or use \"Forgot password?\" below.",
  "auth/user-not-found": "No account found with that email. Did you register yet?",
  "auth/too-many-requests": "Too many attempts — please wait a few minutes and try again.",
  "auth/popup-closed-by-user": "Google sign-in was closed before finishing. Try again.",
  "auth/network-request-failed": "Connection error. Check your internet and try again.",
  "auth/unauthorized-domain": "This website isn't yet approved for Google sign-in — this needs to be fixed in the Firebase Console (Authentication → Settings → Authorized domains).",
  "auth/popup-blocked": "Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.",
  "auth/operation-not-allowed": "Google sign-in isn't turned on for this project yet — check Firebase Console → Authentication → Sign-in method."
};
function friendlyError(err) {
  return FRIENDLY_ERRORS[err && err.code] || "Something went wrong. Please try again.";
}

/**
 * Register a new trainee with email + password.
 * Also creates their users/{uid} profile doc (username, track, email).
 */
export async function registerWithEmail(email, password, username, track) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: username.trim() });
    await setDoc(doc(db, "users", cred.user.uid), {
      email: email.trim(),
      username: username.trim(),
      track: track || "",
      createdAt: Date.now()
    });
    return { ok: true, uid: cred.user.uid };
  } catch (e) {
    return { ok: false, reason: friendlyError(e) };
  }
}

/** Log in an existing trainee with email + password. */
export async function loginWithEmail(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return { ok: true, uid: cred.user.uid };
  } catch (e) {
    return { ok: false, reason: friendlyError(e) };
  }
}

/**
 * Sign in with Google. On first-ever Google sign-in for this account,
 * creates a users/{uid} profile doc using their Google display name as
 * the starting username (they can change it later — see updateUsername).
 */
export async function loginWithGoogle(track) {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const userRef = doc(db, "users", cred.user.uid);
    const existing = await getDoc(userRef);
    if (!existing.exists()) {
      await setDoc(userRef, {
        email: cred.user.email || "",
        username: cred.user.displayName || (cred.user.email || "").split("@")[0],
        track: track || "",
        createdAt: Date.now()
      });
    }
    return { ok: true, uid: cred.user.uid, isNewUser: !existing.exists() };
  } catch (e) {
    return { ok: false, reason: friendlyError(e) };
  }
}

/** Send a password-reset email. */
export async function sendReset(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: friendlyError(e) };
  }
}

/** Update a trainee's display username after the fact. */
export async function updateUsername(uid, newUsername) {
  try {
    await setDoc(doc(db, "users", uid), { username: newUsername.trim() }, { merge: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: friendlyError(e) };
  }
}

export function logout() {
  return signOut(auth);
}

/**
 * Fires `callback(user, profile)` every time auth state resolves — on
 * every page load, after login, after logout. `user` is Firebase's own
 * User object (or null if signed out). `profile` is the users/{uid}
 * Firestore doc (or null). This one function replaces the old
 * qb_global_user / qb_global_pin localStorage dance entirely.
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null, null);
      return;
    }
    let profile = null;
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) profile = snap.data();
    } catch (e) {
      console.warn("firebase-auth: could not load profile", e);
    }
    callback(user, profile);
  });
}

/** Convenience: current signed-in user's uid, or null. Only reliable AFTER onAuthChange has fired once. */
export function currentUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}
