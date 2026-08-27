/* storage.js — Storage Manager
 * ============================================================
 * Single point of contact with localStorage. Nothing else in the
 * engine (or in course files) should call localStorage directly.
 *
 * Progress is saved under a single consistent scheme:
 *     qb_missed_<courseId>
 *     qb_session_<courseId>_<uid>
 *     qb_answered_<courseId>_<uid>
 * where <uid> is the signed-in trainee's Firebase Authentication uid
 * (see engine/firebase-auth.js), not a typed name. cloud-sync.js's
 * localStorage.setItem watcher pushes any write under this scheme to
 * Firestore automatically. (Earlier versions of this app used a
 * lowercased, hand-typed username instead of a real uid, which is
 * what the PIN-to-Firebase-Auth migration replaced — see the Firebase
 * Handover Security Plan for why.)
 * ============================================================ */

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn('localStorage unavailable:', e);
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn('localStorage unavailable:', e);
    return false;
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('localStorage unavailable:', e);
  }
}

export class StorageManager {
  constructor(courseId) {
    this.courseId = courseId;
  }

  // ---- Missed questions (course-scoped, not user-scoped — matches legacy behavior) ----
  getMissed() {
    const raw = safeGet(`qb_missed_${this.courseId}`);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  setMissed(idsArray) {
    safeSet(`qb_missed_${this.courseId}`, JSON.stringify(idsArray));
  }

  clearMissed() {
    safeRemove(`qb_missed_${this.courseId}`);
  }

  // ---- Session (user-scoped, keyed by Firebase Auth uid) ----
  getSession(userId) {
    const uid = (userId || '').trim();
    if (!uid) return null;
    const raw = safeGet(`qb_session_${this.courseId}_${uid}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  setSession(userId, sessionObj) {
    const uid = (userId || '').trim();
    if (!uid) return;
    safeSet(`qb_session_${this.courseId}_${uid}`, JSON.stringify(sessionObj));
    const answered = Array.isArray(sessionObj.userAnswers)
      ? sessionObj.userAnswers.filter((a) => a !== null).length
      : 0;
    // Written as its own key because cloud-sync's payload reads
    // qb_answered_<courseId>_<uid> as a standalone field.
    safeSet(`qb_answered_${this.courseId}_${uid}`, String(answered));
  }

  clearSession(userId) {
    const uid = (userId || '').trim();
    if (!uid) return;
    safeRemove(`qb_session_${this.courseId}_${uid}`);
    safeRemove(`qb_answered_${this.courseId}_${uid}`);
  }
}
