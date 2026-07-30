/* workbook-sync.js — cross-device sync for the Practice Workbooks tool
 * ============================================================
 * Always saves locally first; this module only provides an optional
 * cloud backup. It uses the same Firebase project and "users"
 * collection for PIN authentication.
 *
 * If the cloud is unavailable, the app still works perfectly offline.
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

// Reuse any existing Firebase app to avoid "duplicate app" errors.
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
 * Verify name+PIN, then pull the saved workbook tree (if any).
 * Returns { ok, data?, reason? } — data is the parsed subjects array, or null.
 */
export async function verifyAndPullWorkbooks(name, pin) {
  const lname = name.trim().toLowerCase();
  if (!/^\d{4}$/.test(pin)) return { ok: false, reason: "PIN must be exactly 4 digits." };

  try {
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
  } catch (e) {
    console.warn("workbook-sync: pull failed", e);
    return { ok: false, reason: "Network error – please try again later." };
  }
}

let pushTimer = null;

/** Debounced push of the full subjects tree to Firestore. */
export function pushWorkbooksToCloud(name, subjectsArray) {
  const lname = (name || '').trim().toLowerCase();
  if (verifiedName !== lname || !verifiedPinHash) {
    // Not verified – silently ignore (the UI shows a warning if the user tries manually)
    return;
  }
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
      // Optionally retry later – we could implement exponential backoff, but for now
      // we just log the error. The user can manually retry with the "Sync Now" button.
    }
  }, 600);
}

export function isVerified(name) {
  return verifiedName === (name || '').trim().toLowerCase() && !!verifiedPinHash;
}
