/* state.js — Shared Application State
 * ============================================================
 * Every engine module reads and writes through this single store
 * instead of closing over its own private variables. This is what
 * lets Loader, ExamEngine, FlashcardEngine, UIRenderer, Analytics,
 * and the Firebase adapter talk to each other without knowing
 * about each other directly — they all subscribe to state changes.
 *
 * This is intentionally tiny (no external state library). It gives
 * us: get(), set(patch), subscribe(fn), and a `session` sub-object
 * that mirrors what used to be scattered module-scope `let` vars
 * in the old monolithic template (currentMode, testMode, totalQuestions,
 * questionSet, userAnswers, currentIndex, correctCount, ...).
 * ============================================================ */

export function createAppState() {
  const listeners = new Set();

  const state = {
    // ---- Course data (populated by CourseLoader) ----
    course: null,          // normalized course definition (meta, examSettings, flashcardSettings, modules, questionBank)

    // ---- User identity ----
    user: {
      id: '',              // Firebase Auth uid once signed in, or a free-text local-only id typed into the setup screen
      displayName: ''       // username shown in the UI (from users/{uid} profile, or a fallback)
    },

    // ---- Progress (persisted via StorageManager) ----
    missedQuestionIds: [],

    // ---- Active session (mirrors the old module-scope quiz vars) ----
    session: {
      active: false,
      mode: '',            // 'random' | 'sequential' | 'missed' | 'flashcard' | 'exam'
      testMode: 'practice',// 'practice' | 'exam' (timed)
      totalQuestions: 0,
      questionSet: [],
      userAnswers: [],
      currentIndex: 0,
      correctCount: 0,
      wrongCount: 0,
      skippedCount: 0,
      timeLimit: 0,
      timeRemaining: 0,
      examStartTime: null
    },

    // ---- UI ----
    currentScreen: 'setup-screen'
  };

  function get() {
    return state;
  }

  /** Shallow-merge a patch into state (or into state.session with {session: {...}}). */
  function set(patch) {
    Object.keys(patch).forEach((key) => {
      if (
        key === 'session' &&
        typeof patch.session === 'object' &&
        patch.session !== null
      ) {
        Object.assign(state.session, patch.session);
      } else if (
        key === 'user' &&
        typeof patch.user === 'object' &&
        patch.user !== null
      ) {
        Object.assign(state.user, patch.user);
      } else {
        state[key] = patch[key];
      }
    });
    listeners.forEach((fn) => fn(state));
  }

  function resetSession() {
    set({
      session: {
        active: false,
        mode: '',
        testMode: 'practice',
        totalQuestions: 0,
        questionSet: [],
        userAnswers: [],
        currentIndex: 0,
        correctCount: 0,
        wrongCount: 0,
        skippedCount: 0,
        timeLimit: 0,
        timeRemaining: 0,
        examStartTime: null
      }
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { get, set, resetSession, subscribe };
}
