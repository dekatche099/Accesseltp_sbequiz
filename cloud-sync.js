/* cloud-sync.js — cross-device progress sync for quiz pages.
 * ============================================================
 * Rebuilt on Firebase Authentication (engine/firebase-auth.js) instead
 * of the old 4-digit PIN scheme. Auth state now comes from Firebase's
 * own onAuthChange(), which fires reliably on every page load — no PIN
 * field, no manual verification event, no race condition to get wrong.
 * ============================================================ */

import { db, onAuthChange } from "./engine/firebase-auth.js?v=20260822";
import { resolvePinSession, logoutPin, PIN_PREFIX } from "./engine/pin-auth.js?v=20260822";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function docIdFor(courseId, uid) {
  return uid + "_" + courseId;
}

let currentUid = null;
let currentProfile = null;
let usingPinSession = false;

/**
 * Pull this trainee's saved progress for one course from Firestore into
 * localStorage, under the same qb_missed_ / qb_session_ / qb_answered_
 * keys the exam engine already reads — only the key suffix changes,
 * from lowercased-name to uid.
 */
async function pullProgress(courseId, uid) {
  const progRef = doc(db, "progress", docIdFor(courseId, uid));
  const snap = await getDoc(progRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.missed != null) localStorage.setItem("qb_missed_" + courseId, data.missed);
  if (data.session != null) localStorage.setItem("qb_session_" + courseId + "_" + uid, data.session);
  if (data.answered != null) localStorage.setItem("qb_answered_" + courseId + "_" + uid, data.answered);
}

// ---- Push local progress to Firestore (debounced, same 800ms as before) ----
let pushTimer = null;
function pushToCloud(courseId, uid) {
  if (!uid) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const payload = {
      identity: uid,
      courseId,
      missed: localStorage.getItem("qb_missed_" + courseId) || null,
      session: localStorage.getItem("qb_session_" + courseId + "_" + uid) || null,
      answered: localStorage.getItem("qb_answered_" + courseId + "_" + uid) || null,
      updatedAt: Date.now()
    };
    try {
      await setDoc(doc(db, "progress", docIdFor(courseId, uid)), payload, { merge: true });
    } catch (e) { console.warn("cloud-sync: push failed", e); }
  }, 800);
}

/**
 * Call once per course page. Wires up: (1) auto sign-in-state detection,
 * (2) pulling cloud progress the moment we know who's signed in, (3) a
 * localStorage.setItem watcher that auto-pushes any progress write back
 * to the cloud. Calls window.checkForSavedSession() etc. (bridged by
 * firebase-adapter.js) once the pull completes, same as before.
 */
function initCloudSync(courseId) {
  const origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    origSetItem(key, value);
    if (currentUid &&
       (key.startsWith("qb_missed_" + courseId) ||
        key.startsWith("qb_session_" + courseId + "_") ||
        key.startsWith("qb_answered_" + courseId + "_"))) {
      pushToCloud(courseId, currentUid);
    }
  };

  async function signInAs(user, profile, isPin) {
    if (typeof window.setSignedInUser === "function") {
      window.setSignedInUser(user, profile);
    }
    usingPinSession = isPin;
    if (!user) {
      currentUid = null;
      currentProfile = null;
      return;
    }
    currentUid = user.uid;
    currentProfile = profile;
    try {
      await pullProgress(courseId, user.uid);
    } catch (e) {
      console.warn("cloud-sync: pull failed", e);
    }
    if (typeof window.checkForSavedSession === "function") window.checkForSavedSession();
    if (typeof window.validateStart === "function") window.validateStart();
    if (typeof window.updateTotalAvail === "function") window.updateTotalAvail();
  }

  onAuthChange(async (user, profile) => {
    if (user) {
      // A real Firebase Auth account always takes priority over any
      // leftover PIN session in localStorage.
      await signInAs(user, profile, false);
      return;
    }

    // No Firebase Auth session — see if a PIN session was remembered
    // and still checks out against Firestore.
    let pinResult = null;
    try {
      pinResult = await resolvePinSession();
    } catch (e) {
      console.warn("cloud-sync: pin session check failed", e);
    }

    if (pinResult && pinResult.ok) {
      const pinUser = {
        uid: pinResult.identity,
        email: null,
        displayName: pinResult.profile.username
      };
      await signInAs(pinUser, pinResult.profile, true);
    } else {
      await signInAs(null, null, false);
    }
  });
}

/** Sign out of whichever session (Firebase Auth or PIN) is currently active. */
async function signOutAny() {
  if (usingPinSession) {
    logoutPin();
  } else {
    const { logout } = await import("./engine/firebase-auth.js?v=20260822");
    await logout();
  }
}

export { initCloudSync, signOutAny };
