/* exam-engine.js — Exam Engine
 * ============================================================
 * Owns question-set generation and the practice/timed-exam session
 * flow (start, answer, skip, next/prev, submit, timer). Ported
 * faithfully from the legacy template's generateExamQuestionSet()
 * and quiz-flow functions, generalized to run against ANY course's
 * questionBank/modules/examSettings — nothing here names a course,
 * a module title, or a question count.
 * ============================================================ */

const shuffleArray = (arr) => [...arr].sort(() => Math.random() - 0.5);

export class ExamEngine {
  constructor({ state, storage, analytics }) {
    this.state = state;
    this.storage = storage;
    this.analytics = analytics;
    this.timerInterval = null;
    this._onTick = null;
    this._onTimeUp = null;
  }

  /** Register callbacks the UI layer wants fired on timer tick / expiry. */
  onTimer({ tick, timeUp }) {
    this._onTick = tick;
    this._onTimeUp = timeUp;
  }

  // ---- Module-balanced question set (used by the dedicated "Exam" tab) ----
  generateBalancedSet(totalQRequested) {
    const { questionBank } = this.state.get().course;
    const moduleCounts = {};
    questionBank.forEach((q) => {
      const mod = q.module ?? 1;
      moduleCounts[mod] = (moduleCounts[mod] || 0) + 1;
    });
    const modules = Object.entries(moduleCounts).map(([mod, count]) => ({
      index: parseInt(mod, 10),
      count
    }));

    let totalQ = totalQRequested;
    const numModules = modules.length;
    if (numModules === 0 || totalQ === 0) return [];

    const totalAvailable = modules.reduce((sum, m) => sum + m.count, 0);
    if (totalQ > totalAvailable) totalQ = totalAvailable;

    const withShuffledOpts = (arr) =>
      arr.map((q) => ({ ...q, opts: shuffleArray([...q.opts]) }));

    if (numModules === 1) {
      return withShuffledOpts(
        shuffleArray(questionBank.filter((q) => (q.module ?? 1) === modules[0].index)).slice(0, totalQ)
      );
    }

    const minPerModule = Math.min(
      Math.floor(totalQ / numModules),
      ...modules.map((m) => m.count)
    );
    let allocated = numModules * minPerModule;
    const remaining = totalQ - allocated;

    if (remaining < 0) {
      const result = [];
      modules.forEach((m) => {
        const qs = shuffleArray(questionBank.filter((q) => (q.module ?? 1) === m.index));
        if (qs.length) result.push(...qs.slice(0, 1));
      });
      return withShuffledOpts(shuffleArray(result).slice(0, totalQ));
    }

    const extra = new Array(numModules).fill(0);
    while (extra.reduce((a, b) => a + b, 0) < remaining) {
      const idx = Math.floor(Math.random() * numModules);
      const cap = modules[idx].count - minPerModule;
      if (cap > 0 && extra[idx] < cap) extra[idx]++;
    }

    let examQuestions = [];
    modules.forEach((mod, i) => {
      const take = minPerModule + extra[i];
      const pool = shuffleArray(questionBank.filter((q) => (q.module ?? 1) === mod.index));
      examQuestions.push(...pool.slice(0, take));
    });

    return withShuffledOpts(shuffleArray(examQuestions));
  }

  // ---- Pool selection for the Practice panel's modes ----
  buildPool(mode, { moduleFilter, missedQuestionIds } = {}) {
    const { questionBank } = this.state.get().course;
    if (mode === 'random') return [...questionBank];
    if (mode === 'sequential') {
      return moduleFilter === 'all' || moduleFilter == null
        ? shuffleArray([...questionBank])
        : shuffleArray(questionBank.filter((q) => (q.module ?? 1) === parseInt(moduleFilter, 10)));
    }
    if (mode === 'missed') {
      return missedQuestionIds
        .map((id) => questionBank.find((q) => q.id === id))
        .filter(Boolean);
    }
    return [];
  }

  /** Start a practice/sequential/missed session (mode !== 'exam'). */
  startPracticeSession({ mode, moduleFilter, count, testMode, examTimeMinutes }) {
    const { missedQuestionIds } = this.state.get();
    const pool = this.buildPool(mode, { moduleFilter, missedQuestionIds });
    const totalQuestions = count === 'all' ? pool.length : Math.min(parseInt(count, 10), pool.length);
    const questionSet = shuffleArray(pool)
      .slice(0, totalQuestions)
      .map((q) => ({ ...q, opts: shuffleArray([...q.opts]) }));

    const session = {
      active: true,
      mode,
      testMode,
      totalQuestions,
      questionSet,
      userAnswers: new Array(totalQuestions).fill(null),
      currentIndex: 0,
      correctCount: 0,
      wrongCount: 0,
      skippedCount: 0,
      timeLimit: testMode === 'exam' ? examTimeMinutes * 60 : 0,
      timeRemaining: testMode === 'exam' ? examTimeMinutes * 60 : 0,
      examStartTime: testMode === 'exam' ? Date.now() : null
    };
    this.state.set({ session });
    if (testMode === 'exam') this.startTimer();
    this.persist();
    return session;
  }

  /** Start a fixed-size, module-balanced timed exam (the "Exam" tab). */
  startExam(totalQ) {
    const { course } = this.state.get();
    const sizeConfig = course.examSettings.sizes.find((s) => s.count === totalQ);
    const minutes = sizeConfig ? sizeConfig.minutes : totalQ;
    const questionSet = this.generateBalancedSet(totalQ);

    const session = {
      active: true,
      mode: 'exam',
      testMode: 'exam',
      totalQuestions: questionSet.length,
      questionSet,
      userAnswers: new Array(questionSet.length).fill(null),
      currentIndex: 0,
      correctCount: 0,
      wrongCount: 0,
      skippedCount: 0,
      timeLimit: minutes * 60,
      timeRemaining: minutes * 60,
      examStartTime: Date.now()
    };
    this.state.set({ session });
    this.startTimer();
    this.persist();
    return session;
  }

  selectAnswer(optionIndex) {
    const { session } = this.state.get();
    const alreadyAnswered = session.userAnswers[session.currentIndex] !== null;
    // Practice mode locks the answer in place once picked (so the
    // correct/wrong reveal underneath it stays meaningful). Timed mode
    // has no reveal, so the pick must stay changeable right up until
    // the learner moves on or submits — same as the exam-sheet's
    // setExamAnswer(), which never locks either.
    if (session.testMode === 'practice' && alreadyAnswered) return;

    const userAnswers = [...session.userAnswers];
    userAnswers[session.currentIndex] = optionIndex;
    let correct = 0;
    let wrong = 0;
    userAnswers.forEach((ans, idx) => {
      if (ans !== null) {
        const q = session.questionSet[idx];
        if (q.opts[ans] === q.ans) correct++;
        else wrong++;
      }
    });
    this.state.set({ session: { userAnswers, correctCount: correct, wrongCount: wrong } });
    this.persist();
  }

  /** Used by the all-on-one-page exam sheet, where any question can be answered/changed via radio buttons. */
  setExamAnswer(questionIndex, optionIndex) {
    const { session } = this.state.get();
    const userAnswers = [...session.userAnswers];
    userAnswers[questionIndex] = optionIndex;
    let correct = 0;
    let wrong = 0;
    userAnswers.forEach((ans, idx) => {
      if (ans !== null) {
        const q = session.questionSet[idx];
        if (q.opts[ans] === q.ans) correct++;
        else wrong++;
      }
    });
    this.state.set({ session: { userAnswers, correctCount: correct, wrongCount: wrong } });
    this.persist();
  }

  skip() {
    const { session } = this.state.get();
    const userAnswers = [...session.userAnswers];
    userAnswers[session.currentIndex] = null;
    this.state.set({
      session: {
        userAnswers,
        skippedCount: session.skippedCount + 1,
        currentIndex: session.currentIndex + 1
      }
    });
    this.persist();
  }

  next() {
    const { session } = this.state.get();
    this.state.set({ session: { currentIndex: session.currentIndex + 1 } });
    this.persist();
  }

  prev() {
    const { session } = this.state.get();
    if (session.currentIndex > 0) {
      this.state.set({ session: { currentIndex: session.currentIndex - 1 } });
      this.persist();
    }
  }

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      const { session } = this.state.get();
      const timeRemaining = session.timeRemaining - 1;
      this.state.set({ session: { timeRemaining } });
      if (this._onTick) this._onTick(timeRemaining);
      if (timeRemaining <= 0) {
        this.stopTimer();
        if (this._onTimeUp) this._onTimeUp();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /** Finalize a session: fold in unanswered questions as skipped, update missed list, persist. */
  finalize({ autoSubmit = false } = {}) {
    this.stopTimer();
    const { session, course, missedQuestionIds } = this.state.get();
    let skippedCount = session.skippedCount;
    if (autoSubmit && (session.testMode === 'exam' || session.mode === 'exam')) {
      skippedCount = session.userAnswers.filter((a) => a === null).length;
    } else if (!autoSubmit && session.mode !== 'flashcard') {
      skippedCount = session.skippedCount + session.userAnswers.filter((a) => a === null).length;
    }
    this.state.set({ session: { active: false, skippedCount } });

    const updatedMissed = this.analytics.updateMissed(course.meta.id, this.state.get().session, missedQuestionIds);
    this.state.set({ missedQuestionIds: updatedMissed });
    this.storage.clearSession(this.state.get().user.id);
  }

  retryMissed() {
    const { missedQuestionIds, course } = this.state.get();
    const missedPool = missedQuestionIds
      .map((id) => course.questionBank.find((q) => q.id === id))
      .filter(Boolean);
    if (missedPool.length === 0) return false;

    const questionSet = shuffleArray(missedPool).map((q) => ({ ...q, opts: shuffleArray([...q.opts]) }));
    this.state.set({
      session: {
        active: true,
        mode: 'missed',
        testMode: 'practice',
        totalQuestions: questionSet.length,
        questionSet,
        userAnswers: new Array(questionSet.length).fill(null),
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
    return true;
  }

  persist() {
    const { user, session } = this.state.get();
    if (!user.id || !session.active) return;
    this.storage.setSession(user.id, session);
  }
}
