/* workbook-sync.js — cross-device sync for the Practice Workbooks tool
 * ============================================================
 * Deliberately mirrors cloud-sync.js's shape (same Firebase project,
 * same "users" collection for PIN login) so a person's platform-wide
 * login works here too, with no separate signup. Workbook DATA lives
 * in its own Firestore collection ("workbooks") because it's a
 * different shape (a whole subjects->workbooks->sheets tree per user,
 * not per-course progress).
 * ============================================================ */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_JY5U0fzc92X_sPZJHmqkQGaib0EALtI",
  authDomain: "accesswarrior-f8f34.firebaseapp.com",
  projectId: "accesswarrior-f8f34",
  storageBucket: "accesswarrior-f8f34.firebasestorage.app",
  messagingSenderId: "592765280433",
  appId: "1:592765280433:web:08799c90034244660d0290",
  measurementId: "G-JE664K1H0C"
};

// Reuse the existing Firebase app instance if cloud-sync.js (or anything
// else) already initialized one on this page, instead of throwing a
// "duplicate app" error.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

async function hashPin(pin) {
  const enc = new TextEncoder().encode("qbsalt_" + pin);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let verifiedName = null;
let verifiedPinHash = null;

/**
 * Verify a name+PIN against the SAME "users" collection the rest of the
 * platform uses, then pull this user's saved workbook tree (if any).
 * Returns { ok, data?, reason? } — data is the parsed subjects array, or
 * null if this user has never saved anything yet.
 */
export async function verifyAndPullWorkbooks(name, pin) {
  const lname = name.trim().toLowerCase();
  if (!/^\d{4}$/.test(pin)) return { ok: false, reason: "PIN must be exactly 4 digits." };

  const userRef = doc(db, "users", lname);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return { ok: false, reason: "Username not found." };

  const enteredHash = await hashPin(pin);
  if (userSnap.data().pinHash !== enteredHash) {
    verifiedName = null;
    verifiedPinHash = null;
    return { ok: false, reason: "Wrong PIN." };
  }

  verifiedName = lname;
  verifiedPinHash = enteredHash;

  const wbRef = doc(db, "workbooks", lname);
  const wbSnap = await getDoc(wbRef);
  if (wbSnap.exists() && wbSnap.data().subjects) {
    try {
      return { ok: true, data: JSON.parse(wbSnap.data().subjects) };
    } catch {
      return { ok: true, data: null };
    }
  }
  return { ok: true, data: null };
}

let pushTimer = null;

/** Debounced push of the full subjects tree to Firestore. Silently no-ops until verifyAndPullWorkbooks has succeeded. */
export function pushWorkbooksToCloud(name, subjectsArray) {
  const lname = (name || '').trim().toLowerCase();
  if (verifiedName !== lname || !verifiedPinHash) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      await setDoc(
        doc(db, "workbooks", lname),
        { subjects: JSON.stringify(subjectsArray), updatedAt: Date.now() },
        { merge: true }
      );
    } catch (e) {
      console.warn("workbook-sync: push failed", e);
    }
  }, 800);
}

export function isVerified(name) {
  return verifiedName === (name || '').trim().toLowerCase() && !!verifiedPinHash;
}
