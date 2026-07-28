/* storage.js — Storage Manager
 * ============================================================
 * Single point of contact with localStorage. Nothing else in the
 * engine (or in course files) should call localStorage directly.
 *
 * IMPORTANT FIX vs. the old per-course templates:
 * -------------------------------------------------------------
 * The legacy quiz template saved progress under:
 *     missed_<courseId>
 *     quiz_engine_<courseId>_<userId>          (whole session object)
 *
 * But cloud-sync.js's localStorage.setItem monkey-patch (and its
 * pull/push logic) only ever watches/writes:
 *     qb_missed_<courseId>
 *     qb_session_<courseId>_<userId>
 *     qb_answered_<courseId>_<userId>
 *
 * Those key schemes never matched, so cross-device sync has never
 * actually synced real quiz progress — only whatever coincidentally
 * used the qb_* names (the login bar's qb_global_user/qb_global_pin).
 *
 * This StorageManager writes under the qb_* scheme so cloud-sync's
 * existing patch/push logic picks up every save automatically, with
 * no changes needed to cloud-sync.js itself.
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

  // ---- Session (user-scoped) ----
  getSession(userId) {
    const lname = (userId || '').trim().toLowerCase();
    if (!lname) return null;
    const raw = safeGet(`qb_session_${this.courseId}_${lname}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  setSession(userId, sessionObj) {
    const lname = (userId || '').trim().toLowerCase();
    if (!lname) return;
    safeSet(`qb_session_${this.courseId}_${lname}`, JSON.stringify(sessionObj));
    const answered = Array.isArray(sessionObj.userAnswers)
      ? sessionObj.userAnswers.filter((a) => a !== null).length
      : 0;
    // Written as its own key because cloud-sync's payload reads
    // qb_answered_<courseId>_<user> as a standalone field.
    safeSet(`qb_answered_${this.courseId}_${lname}`, String(answered));
  }

  clearSession(userId) {
    const lname = (userId || '').trim().toLowerCase();
    if (!lname) return;
    safeRemove(`qb_session_${this.courseId}_${lname}`);
    safeRemove(`qb_answered_${this.courseId}_${lname}`);
  }

  // ---- Global (hub) login, shared across all courses ----
  getGlobalUser() {
    return {
      name: safeGet('qb_global_user'),
      pin: safeGet('qb_global_pin')
    };
  }

  clearGlobalUser() {
    safeRemove('qb_global_user');
    safeRemove('qb_global_pin');
  }

  setGlobalUser(name, pin) {
    safeSet('qb_global_user', name);
    safeSet('qb_global_pin', pin);
  }
}
