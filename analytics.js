/* analytics.js — Analytics Manager
 * ============================================================
 * All scoring math and missed-question bookkeeping lives here,
 * separated from both the DOM (ui-renderer.js) and the session
 * flow control (exam-engine.js / flashcard-engine.js). Nothing
 * in this file touches localStorage directly either — it hands
 * the updated missed-id list back to the caller, which persists
 * it through StorageManager.
 * ============================================================ */

export class AnalyticsManager {
  constructor({ storage }) {
    this.storage = storage;
  }

  /** Recompute correct/wrong/skipped + live score from a session snapshot. */
  computeLiveStats(session) {
    let correct = 0;
    let wrong = 0;
    session.userAnswers.forEach((ans, idx) => {
      if (ans !== null && ans !== undefined) {
        const q = session.questionSet[idx];
        if (q.opts[ans] === q.ans) correct++;
        else wrong++;
      }
    });
    const answered = correct + wrong;
    const scorePercent = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    return { correct, wrong, scorePercent };
  }

  /** Full results breakdown for the results screen. */
  computeResults(session) {
    const { correct, wrong, scorePercent } = this.computeLiveStats(session);
    const skipped = session.skippedCount;
    const passMark = session.passMark ?? 70;
    return {
      total: session.totalQuestions,
      correct,
      wrong,
      skipped,
      percent: scorePercent,
      tier: scorePercent >= passMark ? 'green' : scorePercent >= 50 ? 'amber' : 'red',
      timeTakenSec: session.examStartTime
        ? session.timeLimit - session.timeRemaining
        : null
    };
  }

  /**
   * Update the missed-question id list for a completed session and
   * persist it. Returns the new list (also written to storage).
   */
  updateMissed(courseId, session, missedQuestionIds) {
    const updated = [...missedQuestionIds];
    session.questionSet.forEach((q, idx) => {
      const userAns = session.userAnswers[idx];
      if (userAns === null || userAns === undefined) return;
      const isCorrect = q.opts[userAns] === q.ans;
      const missedIdx = updated.indexOf(q.id);
      if (isCorrect) {
        if (missedIdx !== -1) updated.splice(missedIdx, 1);
      } else if (missedIdx === -1) {
        updated.push(q.id);
      }
    });
    this.storage.setMissed(updated);
    return updated;
  }
}
