/* analytics.js — scoring and learning analytics. */

export class AnalyticsManager {
  constructor({ storage }) { this.storage = storage; }

  computeLiveStats(session) {
    let correct = 0, wrong = 0;
    session.userAnswers.forEach((ans, idx) => {
      if (ans !== null && ans !== undefined) {
        const q = session.questionSet[idx];
        if (q && q.opts[ans] === q.ans) correct++; else wrong++;
      }
    });
    const answered = correct + wrong;
    return { correct, wrong, scorePercent: answered ? Math.round(correct / answered * 100) : 0 };
  }

  computeResults(session, passMarkOverride) {
    const { correct, wrong, scorePercent: accuracyOnAnswered } = this.computeLiveStats(session);
    const total = session.totalQuestions;
    const answered = correct + wrong;
    const unanswered = session.userAnswers.filter(a => a === null || a === undefined).length;
    const timed = session.testMode === 'exam' || session.mode === 'exam';
    let lastAnswered = -1;
    session.userAnswers.forEach((a, i) => { if (a !== null && a !== undefined) lastAnswered = i; });
    const reached = Math.min(total, Math.max(session.furthest || 0, lastAnswered + 1));
    const denominator = timed ? total : reached;
    const percent = denominator ? Math.round(correct / denominator * 100) : 0;
    const passMark = passMarkOverride ?? session.passMark ?? 70;
    return {
      total, correct, wrong, answered, skipped: unanswered, denominator, timed, percent,
      accuracyOnAnswered,
      tier: percent >= passMark ? 'green' : percent >= 50 ? 'amber' : 'red',
      timeTakenSec: session.examStartTime ? Math.max(0, session.timeLimit - session.timeRemaining) : null
    };
  }

  getModuleResults(session) {
    const modules = new Map();
    session.questionSet.forEach((q, idx) => {
      const key = String(q.module ?? 1);
      if (!modules.has(key)) modules.set(key, { module: q.module ?? 1, total: 0, correct: 0, answered: 0 });
      const m = modules.get(key);
      const timed = session.testMode === 'exam' || session.mode === 'exam';
      let lastAnswered = -1;
      session.userAnswers.forEach((a, i) => { if (a !== null && a !== undefined) lastAnswered = i; });
      const reached = Math.min(session.totalQuestions, Math.max(session.furthest || 0, lastAnswered + 1));
      if (timed || idx < reached) m.total++;
      const ans = session.userAnswers[idx];
      if (ans !== null && ans !== undefined && (timed || idx < reached)) {
        m.answered++;
        if (q.opts[ans] === q.ans) m.correct++;
      }
    });
    return [...modules.values()].filter(m => m.total > 0).map(m => ({ ...m, percent: Math.round(m.correct / m.total * 100) }));
  }

  updateMissed(courseId, session, missedQuestionIds) {
    const updated = [...missedQuestionIds];
    session.questionSet.forEach((q, idx) => {
      const userAns = session.userAnswers[idx];
      if (userAns === null || userAns === undefined) return;
      const isCorrect = q.opts[userAns] === q.ans;
      const missedIdx = updated.indexOf(q.id);
      if (isCorrect && missedIdx !== -1) updated.splice(missedIdx, 1);
      else if (!isCorrect && missedIdx === -1) updated.push(q.id);
    });
    this.storage.setMissed(updated);
    return updated;
  }

  /** Record only completed MCQ results. Never lets one session be counted twice. */
  recordCompletedSession(userId, session, course) {
    if (!userId || !session || session.mode === 'flashcard' || session._statsRecorded) return null;
    const results = this.computeResults(session, course.examSettings?.passMark);
    const moduleResults = this.getModuleResults(session);
    const stats = this.storage.getStats(userId) || { questions: {}, sessions: [], modules: {} };
    const questions = stats.questions || {};
    session.questionSet.forEach((q, idx) => {
      const ans = session.userAnswers[idx];
      if (ans === null || ans === undefined) return;
      questions[q.id] = q.opts[ans] === q.ans ? 1 : 0;
    });
    const sessions = Array.isArray(stats.sessions) ? stats.sessions : [];
    sessions.push({ at: Date.now(), mode: session.mode, testMode: session.testMode, percent: results.percent, correct: results.correct, answered: results.answered, total: results.total });
    const trimmedSessions = sessions.slice(-10);
    const modules = { ...(stats.modules || {}) };
    moduleResults.forEach(m => {
      const key = String(m.module);
      const prev = modules[key] || { correct: 0, answered: 0 };
      modules[key] = { correct: prev.correct + m.correct, answered: prev.answered + m.answered };
    });
    const next = { version: 1, questions, sessions: trimmedSessions, modules, updatedAt: Date.now() };
    this.storage.setStats(userId, next);
    return next;
  }
}
