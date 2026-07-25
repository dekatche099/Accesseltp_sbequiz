/* flashcard-engine.js — Flashcard Engine
 * ============================================================
 * Deliberately separate from ExamEngine: flashcards have no
 * scoring, no timer, and no answer-selection state — just a
 * shuffled deck and a flip/next flow. Sharing one bloated
 * "engine" for both was part of why the legacy template was
 * hard to change safely.
 * ============================================================ */

const shuffleArray = (arr) => [...arr].sort(() => Math.random() - 0.5);

export class FlashcardEngine {
  constructor({ state, storage }) {
    this.state = state;
    this.storage = storage;
  }

  start({ count }) {
    const { course } = this.state.get();
    const pool = [...course.questionBank];
    const totalQuestions = count === 'all' ? pool.length : Math.min(parseInt(count, 10), pool.length);
    const questionSet = shuffleArray(pool).slice(0, totalQuestions);

    this.state.set({
      session: {
        active: true,
        mode: 'flashcard',
        testMode: 'practice',
        totalQuestions,
        questionSet,
        userAnswers: new Array(totalQuestions).fill(null),
        currentIndex: 0,
        correctCount: 0,
        wrongCount: 0,
        skippedCount: 0,
        timeLimit: 0,
        timeRemaining: 0,
        examStartTime: null
      }
    });
    this.persist();
  }

  next() {
    const { session } = this.state.get();
    this.state.set({ session: { currentIndex: session.currentIndex + 1 } });
    this.persist();
  }

  end() {
    const { user } = this.state.get();
    this.state.set({ session: { active: false } });
    this.storage.clearSession(user.id);
  }

  persist() {
    const { user, session } = this.state.get();
    if (!user.id || !session.active) return;
    this.storage.setSession(user.id, session);
  }
}
