/* engine/pin-auth.js — optional no-email account path (username + 4-digit PIN).
 * ============================================================
 * Sits alongside engine/firebase-auth.js as a SECOND, parallel identity
 * scheme for trainees who'd rather not hand over an email address. It
 * reuses the same Firebase project (via `db` from firebase-auth.js) but
 * never touches Firebase Auth itself — a PIN account is just a document
 * in Firestore, verified client-side.
 *
 * WHY A SEPARATE COLLECTION: Firebase Auth users live in `users/{uid}`,
 * keyed by a uid Firebase controls. PIN accounts have no uid, so they
 * get their own collection, `pinUsers/{lowercasedUsername}`, keyed by
 * username instead.
 *
 * WHY IT SLOTS INTO THE REST OF THE ENGINE FOR FREE: cloud-sync.js and
 * everything downstream of it (storage.js, ui-renderer.js) only ever
 * work with a plain identity *string* — they don't care whether it came
 * from Firebase Auth or not. So a PIN user's identity is just the string
 * "pin_<lowercasedUsername>", handed to the exact same
 * window.setSignedInUser() bridge a Firebase Auth user would use. See
 * cloud-sync.js for where the two paths merge.
 *
 * SESSION PERSISTENCE: Firebase Auth persists its own session; PIN
 * accounts have no such thing, so — same as the pre-Firebase-Auth build
 * of this app — the username + PIN are kept in localStorage and
 * re-verified against Firestore on every page load (resolvePinSession).
 *
 * SECURITY NOTE (please read before shipping): a 4-digit PIN is much
 * weaker than a real password, and because there's no Firebase Auth
 * session backing it, protection depends entirely on your Firestore
 * Security Rules restricting what an unauthenticated client can read/
 * write under `pinUsers/` and `progress/` docs whose id starts with
 * "pin_". This is a deliberate, lower-friction trade-off for trainees
 * who are wary of email — make sure that's communicated in the UI (see
 * the copy in index.html) and that upgradePinToEmail() is offered
 * prominently so people can move to a stronger account when ready.
 * ============================================================ */

import { db, auth } from "./firebase-auth.js?v=20260822b";
import {
  doc, getDoc, setDoc,
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

export const PIN_PREFIX = "pin_";
const LS_USER = "qb_pin_user";
const LS_PIN = "qb_pin_pin";

function lname(username) {
  return username.trim().toLowerCase();
}

function identityFor(username) {
  return PIN_PREFIX + lname(username);
}

async function hashPin(pin) {
  const enc = new TextEncoder().encode("qbsalt_pin_v1_" + pin);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Register a brand-new username + PIN account. */
export async function registerWithPin(username, pin, track) {
  const ln = lname(username || "");
  if (!ln) return { ok: false, reason: "Please choose a username." };
  if (!/^\d{4}$/.test(pin || "")) return { ok: false, reason: "PIN must be exactly 4 digits." };

  const userRef = doc(db, "pinUsers", ln);
  const existing = await getDoc(userRef);
  if (existing.exists()) {
    return { ok: false, reason: "That username is already taken — try another, or log in instead." };
  }

  const pinHash = await hashPin(pin);
  await setDoc(userRef, {
    username: username.trim(),
    pinHash,
    track: track || "",
    createdAt: Date.now(),
    upgradedToUid: null
  });

  storeSession(username, pin);
  return { ok: true, identity: identityFor(username), profile: { username: username.trim(), track: track || "" } };
}

/** Log in to an existing username + PIN account. */
export async function loginWithPin(username, pin) {
  const ln = lname(username || "");
  if (!ln) return { ok: false, reason: "Please enter your username." };
  if (!/^\d{4}$/.test(pin || "")) return { ok: false, reason: "PIN must be exactly 4 digits." };

  const userRef = doc(db, "pinUsers", ln);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    return { ok: false, reason: "No account found with that username. Did you register yet?" };
  }
  const data = snap.data();
  if (data.upgradedToUid) {
    return { ok: false, reason: "This account was upgraded to email login — use the Login tab with your email and password instead." };
  }
  const enteredHash = await hashPin(pin);
  if (data.pinHash !== enteredHash) {
    return { ok: false, reason: "Wrong PIN." };
  }

  storeSession(username, pin);
  return { ok: true, identity: identityFor(username), profile: { username: data.username, track: data.track || "" } };
}

function storeSession(username, pin) {
  try {
    localStorage.setItem(LS_USER, username.trim());
    localStorage.setItem(LS_PIN, pin);
  } catch (e) { /* ignore */ }
}

/** Clear the locally-remembered PIN session (does not touch the Firestore account). */
export function logoutPin() {
  try {
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_PIN);
  } catch (e) { /* ignore */ }
}

/**
 * Called once per page load (see cloud-sync.js). If a PIN session was
 * remembered in localStorage, re-verify it against Firestore — same
 * shape of result as loginWithPin — or null if nothing is remembered /
 * the PIN no longer checks out (in which case the stale localStorage
 * entry is cleared).
 */
export async function resolvePinSession() {
  let username, pin;
  try {
    username = localStorage.getItem(LS_USER);
    pin = localStorage.getItem(LS_PIN);
  } catch (e) { return null; }
  if (!username || !pin) return null;

  const result = await loginWithPin(username, pin);
  if (!result.ok) {
    logoutPin();
    return null;
  }
  return result;
}

/**
 * Upgrade a PIN account to a full email + password (Firebase Auth)
 * account, carrying the username/track over and migrating any synced
 * progress docs. After this succeeds, the trainee is signed in via
 * Firebase Auth (createUserWithEmailAndPassword signs them in
 * automatically) and the PIN account is marked upgraded so it can't be
 * logged into separately going forward.
 */
export async function upgradePinToEmail(username, pin, email, password) {
  const verify = await loginWithPin(username, pin);
  if (!verify.ok) return verify;

  const ln = lname(username);
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  } catch (e) {
    const code = e && e.code;
    if (code === "auth/email-already-in-use") return { ok: false, reason: "That email is already registered — try logging in with it instead." };
    if (code === "auth/invalid-email") return { ok: false, reason: "That doesn't look like a valid email address." };
    if (code === "auth/weak-password") return { ok: false, reason: "Password must be at least 6 characters." };
    return { ok: false, reason: "Something went wrong creating your account. Please try again." };
  }

  const uid = cred.user.uid;
  await updateProfile(cred.user, { displayName: username.trim() });

  const pinSnap = await getDoc(doc(db, "pinUsers", ln));
  const pinData = pinSnap.exists() ? pinSnap.data() : {};

  await setDoc(doc(db, "users", uid), {
    email: email.trim(),
    username: username.trim(),
    track: pinData.track || "",
    createdAt: pinData.createdAt || Date.now(),
    upgradedFrom: ln
  });

  // Migrate any progress docs saved under the PIN identity to the new uid.
  try {
    const oldIdentity = identityFor(username);
    const progressCol = collection(db, "progress");
    const q = query(progressCol, where("identity", "==", oldIdentity));
    const matches = await getDocs(q);
    for (const docSnap of matches.docs) {
      const data = docSnap.data();
      const courseId = data.courseId;
      if (!courseId) continue;
      await setDoc(doc(db, "progress", uid + "_" + courseId), {
        ...data,
        identity: uid
      }, { merge: true });
    }
  } catch (e) {
    console.warn("pin-auth: progress migration incomplete", e);
    // Non-fatal — the account upgrade itself already succeeded.
  }

  // Mark the PIN account as retired so it can't be used to sign in again.
  try {
    await setDoc(doc(db, "pinUsers", ln), { upgradedToUid: uid }, { merge: true });
  } catch (e) { /* non-fatal */ }

  logoutPin();
  return { ok: true, uid };
}
