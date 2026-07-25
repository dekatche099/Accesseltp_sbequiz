/* cloud-sync.js — cross‑device sync, 4‑digit PIN, no forced login */

// ---- Firebase modular imports (Firestore only, no analytics) ----
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---- Your web app's Firebase configuration ----
const firebaseConfig = {
  apiKey: "AIzaSyA_JY5U0fzc92X_sPZJHmqkQGaib0EALtI",
  authDomain: "accesswarrior-f8f34.firebaseapp.com",
  projectId: "accesswarrior-f8f34",
  storageBucket: "accesswarrior-f8f34.firebasestorage.app",
  messagingSenderId: "592765280433",
  appId: "1:592765280433:web:08799c90034244660d0290",
  measurementId: "G-JE664K1H0C"
};

// ---- Initialize Firebase & Firestore ----
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---- Helpers ----
function docIdFor(courseId, name) {
  return courseId + "__" + name.trim().toLowerCase();
}

async function hashPin(pin) {
  const enc = new TextEncoder().encode("qbsalt_" + pin);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

let verifiedName = null;
let verifiedPinHash = null;

/**
 * Verify PIN against global users doc, then pull progress for this course.
 * Returns { ok: true/false, reason?: string }
 */
async function verifyAndPull(courseId, name, pin) {
  const lname = name.trim().toLowerCase();
  if (!/^\d{4}$/.test(pin)) return { ok: false, reason: "PIN must be exactly 4 digits." };

  const userRef = doc(db, "users", lname);
  const userSnap = await getDoc(userRef);
  const enteredHash = await hashPin(pin);

  if (!userSnap.exists()) {
    return { ok: false, reason: "Username not found." };
  }

  const userData = userSnap.data();
  if (userData.pinHash !== enteredHash) {
    verifiedName = null;
    verifiedPinHash = null;
    return { ok: false, reason: "Wrong PIN." };
  }

  verifiedName = lname;
  verifiedPinHash = enteredHash;

  // Download progress for this course
  const progRef = doc(db, "progress", docIdFor(courseId, name));
  const progSnap = await getDoc(progRef);
  if (progSnap.exists()) {
    const data = progSnap.data();
    if (data.missed != null) localStorage.setItem("qb_missed_" + courseId, data.missed);
    if (data.session != null) localStorage.setItem("qb_session_" + courseId + "_" + lname, data.session);
    if (data.answered != null) localStorage.setItem("qb_answered_" + courseId + "_" + lname, data.answered);
  }
  return { ok: true };
}

/**
 * Register a new user (only called from the hub).
 */
async function registerUser(name, pin, track = "") {
  const lname = name.trim().toLowerCase();
  if (!/^\d{4}$/.test(pin)) return { ok: false, reason: "PIN must be exactly 4 digits." };
  const userRef = doc(db, "users", lname);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    return { ok: false, reason: "Username already taken." };
  }
  const pinHash = await hashPin(pin);
  await setDoc(userRef, {
    pinHash,
    track: track,
    createdAt: Date.now()
  });
  return { ok: true };
}

// ---- Push local progress to Firestore (debounced) ----
let pushTimer = null;
function pushToCloud(courseId, name) {
  const lname = name.trim().toLowerCase();
  if (verifiedName !== lname || !verifiedPinHash) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const payload = {
      missed: localStorage.getItem("qb_missed_" + courseId) || null,
      session: localStorage.getItem("qb_session_" + courseId + "_" + lname) || null,
      answered: localStorage.getItem("qb_answered_" + courseId + "_" + lname) || null,
      updatedAt: Date.now()
    };
    try {
      await setDoc(doc(db, "progress", docIdFor(courseId, name)), payload, { merge: true });
    } catch (e) { console.warn("cloud-sync: push failed", e); }
  }, 800);
}

// ---- Inject PIN field & sync status on quiz pages ----
function injectPinField(nameInput) {
  const pin = document.createElement("input");
  pin.type = "password";
  pin.id = "userPin-input";
  pin.placeholder = "4-digit PIN";
  pin.maxLength = 4;
  pin.inputMode = "numeric";
  pin.pattern = "[0-9]*";
  pin.style.cssText = nameInput.style.cssText || "";
  pin.style.marginTop = "8px";
  pin.style.width = "110px";

  const status = document.createElement("div");
  status.id = "syncStatus";
  status.style.cssText = "font-size:13px;margin-top:6px;min-height:1.2em;";

  nameInput.insertAdjacentElement("afterend", status);
  nameInput.insertAdjacentElement("afterend", pin);

  document.dispatchEvent(new CustomEvent("pinFieldReady", { detail: { pinField: pin } }));
  return { pin, status };
}

function initCloudSync(courseId) {
  const nameInput = document.getElementById("userId-input");
  if (!nameInput) return;

  const { pin, status } = injectPinField(nameInput);

  function setStatus(msg, isError) {
    status.textContent = msg;
    status.style.color = isError ? "#ef4444" : "#22c55e";
  }

  const origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, value) {
    origSetItem(key, value);
    if (nameInput.value.trim() &&
       (key.startsWith("qb_missed_" + courseId) ||
        key.startsWith("qb_session_" + courseId + "_") ||
        key.startsWith("qb_answered_" + courseId + "_"))) {
      pushToCloud(courseId, nameInput.value);
    }
  };

  async function attemptVerify() {
    const name = nameInput.value.trim();
    const pinVal = pin.value.trim();
    if (!name || pinVal.length !== 4) { status.textContent = ""; return; }

    setStatus("Checking…", false);
    const result = await verifyAndPull(courseId, name, pinVal);
    if (!result.ok) {
      setStatus("⚠ " + result.reason, true);
      pin.value = "";
      pin.focus();
      return;
    }
    setStatus("✓ Progress synced", false);
    if (typeof window.checkForSavedSession === "function") window.checkForSavedSession();
    if (typeof window.validateStart === "function") window.validateStart();
    if (typeof window.updateTotalAvail === "function") window.updateTotalAvail();
  }

  nameInput.addEventListener("change", attemptVerify);
  pin.addEventListener("change", attemptVerify);
  pin.addEventListener("blur", attemptVerify);

  // Auto‑fill from URL params (passed from hub or track pages)
  const params = new URLSearchParams(window.location.search);
  const linkedName = params.get("u");
  const linkedPin = params.get("p");
  if (linkedName) nameInput.value = linkedName;
  if (linkedPin) pin.value = linkedPin;
  if (linkedName && linkedPin) attemptVerify();
}

function logoutUser(redirect = true) {
  localStorage.removeItem("qb_global_user");
  localStorage.removeItem("qb_global_pin");
  verifiedName = null;
  verifiedPinHash = null;
  if (redirect) window.location.replace("index.html");
}

export { initCloudSync, registerUser, logoutUser, verifyAndPull };
