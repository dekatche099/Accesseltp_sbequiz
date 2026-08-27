/* workbook-sync.js — cross-device backup/restore for Practice Workbooks.
 * Rebuilt on Firebase Authentication instead of the 4-digit PIN scheme.
 * Keyed by uid instead of lowercased username. */

import { db } from "./engine/firebase-auth.js?v=20260822b";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/** Pull this trainee's saved workbook subjects from Firestore, by uid. */
export async function pullWorkbooks(uid) {
  if (!uid) return { ok: false, reason: "Not signed in." };
  try {
    const wbRef = doc(db, "workbooks", uid);
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
    return { ok: false, reason: "Network error — please try again later." };
  }
}

let pushTimer = null;

/** Push the current workbook subjects to Firestore, by uid. Debounced 600ms, same as before. */
export function pushWorkbooksToCloud(uid, subjectsArray) {
  if (!uid) {
    console.warn("workbook-sync: push skipped — not signed in");
    return;
  }
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      await setDoc(
        doc(db, "workbooks", uid),
        { subjects: JSON.stringify(subjectsArray), updatedAt: Date.now() },
        { merge: true }
      );
      console.log("workbook-sync: push succeeded for", uid);
    } catch (e) {
      console.warn("workbook-sync: push failed", e);
    }
  }, 600);
}
