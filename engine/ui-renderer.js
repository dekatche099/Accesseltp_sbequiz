/* ui-renderer.js — UI Renderer
 * ============================================================
 * The only module that touches the DOM. Binds to the static
 * skeleton in course.html (same element IDs the legacy per-course
 * templates used, so the CSS/markup didn't need to change) and
 * renders whatever ExamEngine / FlashcardEngine / AnalyticsManager
 * currently hold in shared state. Course-specific content (module
 * names, exam sizes, question text) is read from state.course —
 * never hardcoded here.
 *
 * NEW: Previous button for practice sessions, with confirm popup.
 * ============================================================ */

import { getQuestionTypeRenderer } from './question-types.js';

const escapeHTML = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

export class UIRenderer {
  constructor({ state, storage, examEngine, flashcardEngine, analytics }) {
    this.state = state;
    this.storage = storage;
    this.examEngine = examEngine;
    this.flashcardEngine = flashcardEngine;
    this.analytics = analytics;
    this.savedSession = null;
    this.pendingExamCount = null;
    this.pendingLeaveAction = null;
    this.originalQuizScreenHTML = '';
  }

  init() {
    this.cacheDom();
    this.initTheme();
    this.populateCourseChrome();
    this.applyLoginState();
    this.bindEvents();
    this.originalQuizScreenHTML = this.quizScreen.innerHTML;
    this.attachQuizListeners();   // ← attach listeners to static buttons
    this.switchTab('practice');
    this.updateTotalAvail();
    this.checkForSavedSession();

    this.examEngine.onTimer({
      tick: (secondsLeft) => this.updateTimerDisplay(secondsLeft),
      timeUp: () => {
        const { session } = this.state.get();
        if (session.mode === 'exam') this.submitExam();
        else this.endSession(true);
      }
    });
  }

  // ---- Day / night theme (light is the default, matching the workbook) ----
  initTheme() {
    this.themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (!this.themeToggleBtn) return;
    this.syncThemeIcon();
    this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
  }

  toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    try { localStorage.setItem('qb_theme', isDark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    this.syncThemeIcon();
  }

  syncThemeIcon() {
    if (!this.themeToggleBtn) return;
    const isDark = document.body.classList.contains('dark');
    // Icon shows the mode a click will switch you INTO.
    this.themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
  }

  cacheDom() {
    const byId = (id) => document.getElementById(id);
    this.setupScreen = byId('setup-screen');
    this.quizScreen = byId('quiz-screen');
    this.flashcardScreen = byId('flashcard-screen');
    this.resultsScreen = byId('results-screen');

    this.courseTitleEl = byId('course-title');
    this.courseDescEl = byId('course-desc');

    this.userIdInput = byId('userId-input');
    this.modeSelect = byId('mode-select');
    this.countSelect = byId('count-select');
    this.startBtn = byId('start-btn');
    this.topicGroup = byId('topic-group');
    this.topicSelect = byId('topic-select');
    this.testModeGroup = byId('test-mode-group');
    this.testModeSelect = byId('test-mode-select');
    this.examTimeGroup = byId('exam-time-group');
    this.examTimeInput = byId('exam-time-input');
    this.totalAvailLabel = byId('total-avail-label');
    this.totalMissedSpan = byId('total-missed');
    this.resetProgressRow = byId('reset-progress-row');
    this.resetProgressBtn = byId('reset-progress-btn');
    this.sessionStatus = byId('session-status');
    this.sessionInfo = byId('session-info');
    this.resumeSessionBtn = byId('resume-session-btn');
    this.startFreshBtn = byId('start-fresh-btn');

    this.tabPracticeBtn = byId('tab-practice-btn');
    this.tabExamBtn = byId('tab-exam-btn');
    this.practiceSetup = byId('practice-setup');
    this.examSetup = byId('exam-setup');
    this.examCountButtonsContainer = byId('exam-count-buttons');
    this.examCountHint = byId('exam-count-hint');
    this.beginExamBtn = byId('begin-exam-btn');
    this.examConfirmModal = byId('exam-confirm-modal');
    this.examConfirmText = byId('exam-confirm-text');
    this.examConfirmCancelBtn = byId('exam-confirm-cancel-btn');
    this.examConfirmStartBtn = byId('exam-confirm-start-btn');
    this.leaveConfirmModal = byId('leave-confirm-modal');
    this.leaveConfirmTitle = byId('leave-confirm-title');
    this.leaveConfirmText = byId('leave-confirm-text');
    this.leaveConfirmCancelBtn = byId('leave-confirm-cancel-btn');
    this.leaveConfirmProceedBtn = byId('leave-confirm-proceed-btn');

    this.retryMissedBtn = byId('retry-missed-btn');
    this.newSessionBtn = byId('new-session-btn');

    // Login bar (hub-injected user)
    this.loggedInBar = byId('loggedInBar');
    this.loggedInName = byId('loggedInName');
    this.logoutBtn = byId('logoutFromQuiz');
  }

  // ---- Course-driven chrome: title, module dropdown, exam size buttons ----
  populateCourseChrome() {
    const { course } = this.state.get();
    if (this.courseTitleEl) this.courseTitleEl.textContent = course.meta.title;
    if (this.courseDescEl) this.courseDescEl.textContent = course.meta.description || '';
    document.title = course.meta.title;

    // Module dropdown — built from course.modules, not hand-maintained per course.
    this.topicSelect.innerHTML = '<option value="all">All Modules</option>' +
      course.modules
        .map((m) => `<option value="${m.id}">${m.id === 0 ? '📘 ' : ''}${escapeHTML(m.title)}</option>`)
        .join('');

    // Exam size buttons — built from course.examSettings.sizes.
    this.examCountButtonsContainer.innerHTML = course.examSettings.sizes
      .map((s) => `<button type="button" class="exam-count-btn" data-count="${s.count}">${s.count}<br><small>${s.minutes} min</small></button>`)
      .join('');
    this.examCountButtons = [...this.examCountButtonsContainer.querySelectorAll('.exam-count-btn')];
    this.examCountButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedExamCount = parseInt(btn.dataset.count, 10);
        this.examCountButtons.forEach((b) => b.classList.toggle('selected', b === btn));
        this.onExamCountInput();
      });
    });
  }

  bindEvents() {
    this.modeSelect.addEventListener('change', () => this.onModeChange());
    this.topicSelect.addEventListener('change', () => this.updateTotalAvail());
    this.countSelect.addEventListener('change', () => this.validateStart());
    this.testModeSelect.addEventListener('change', () => this.onTestModeChange());
    this.examTimeInput.addEventListener('input', () => this.validateStart());
    this.userIdInput.addEventListener('input', () => this.onUserIdInput());
    this.startBtn.addEventListener('click', () => this.startSession());
    this.resetProgressBtn.addEventListener('click', () => this.resetProgress());
    this.resumeSessionBtn.addEventListener('click', () => this.resumeSession());
    this.startFreshBtn.addEventListener('click', () => this.startFresh());
    this.retryMissedBtn.addEventListener('click', () => this.retryMissed());
    this.newSessionBtn.addEventListener('click', () => this.newSession());

    this.tabPracticeBtn.addEventListener('click', () => this.switchTab('practice'));
    this.tabExamBtn.addEventListener('click', () => this.switchTab('exam'));
    this.beginExamBtn.addEventListener('click', () => this.onBeginExamClick());
    this.examConfirmCancelBtn.addEventListener('click', () => this.closeExamConfirm());
    this.examConfirmStartBtn.addEventListener('click', () => this.onExamConfirmStart());
    this.leaveConfirmCancelBtn.addEventListener('click', () => this.closeLeaveConfirm());
    this.leaveConfirmProceedBtn.addEventListener('click', () => this.onLeaveConfirmProceed());

    if (this.logoutBtn) {
      this.logoutBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to log out?')) {
          this.storage.clearGlobalUser();
          window.location.reload();
        }
      });
    }

    window.addEventListener('beforeunload', () => {
      const { session, user } = this.state.get();
      if (session.active) this.storage.setSession(user.id, session);
    });
  }

  // ---- Hub login pass-through (name pre-filled, PIN handled by cloud-sync's injected field) ----
  applyLoginState() {
    const { name, pin } = this.storage.getGlobalUser();
    if (name && pin) {
      this.state.set({ user: { globalUser: name, globalPin: pin } });
      const parentGroup = this.userIdInput.closest('.form-group');
      if (parentGroup) parentGroup.style.display = 'none';
      if (this.loggedInBar) {
        this.loggedInBar.classList.add('visible');
        if (this.loggedInName) this.loggedInName.textContent = name;
      }
      this.userIdInput.value = name;
      this.state.set({ user: { id: name } });

      const setPinAndVerify = (pinField) => {
        pinField.value = pin;
        pinField.dispatchEvent(new Event('change', { bubbles: true }));
        this.checkForSavedSession();
        this.validateStart();
        this.updateTotalAvail();
      };
      const existingPin = document.getElementById('userPin-input');
      if (existingPin) setPinAndVerify(existingPin);
      else document.addEventListener('pinFieldReady', (e) => setPinAndVerify(e.detail.pinField), { once: true });
    }
  }

  // ---- Screen switching ----
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    this.state.set({ currentScreen: screenId });
  }

  switchTab(tab) {
    if (tab === 'exam') {
      this.tabExamBtn.classList.add('active');
      this.tabPracticeBtn.classList.remove('active');
      this.practiceSetup.style.display = 'none';
      this.examSetup.style.display = 'block';
      this.currentMode = 'exam';
    } else {
      this.tabPracticeBtn.classList.add('active');
      this.tabExamBtn.classList.remove('active');
      this.practiceSetup.style.display = 'block';
      this.examSetup.style.display = 'none';
      this.currentMode = this.modeSelect.value;
      this.validateStart();
    }
    this.updateTotalAvail();
  }

  onModeChange() {
    this.currentMode = this.modeSelect.value;
    this.topicGroup.style.display = this.currentMode === 'sequential' ? 'block' : 'none';
    this.validateStart();
    this.updateTotalAvail();
  }

  onTestModeChange() {
    this.testMode = this.testModeSelect.value;
    this.examTimeGroup.style.display = this.testMode === 'exam' ? 'block' : 'none';
    this.validateStart();
  }

  onUserIdInput() {
    this.state.set({ user: { id: this.userIdInput.value.trim() } });
    this.checkForSavedSession();
    this.validateStart();
    this.onExamCountInput();
  }

  validateStart() {
    const userId = this.userIdInput.value.trim();
    if (!userId) { this.startBtn.disabled = true; return; }
    if (!this.countSelect.value) { this.startBtn.disabled = true; return; }
    if (this.testModeSelect.value === 'exam' && !this.examTimeInput.value) { this.startBtn.disabled = true; return; }
    this.startBtn.disabled = false;
  }

  updateTotalAvail() {
    const { course, missedQuestionIds } = this.state.get();
    let pool = course.questionBank;
    if (this.currentMode === 'sequential' && this.topicSelect.value && this.topicSelect.value !== 'all') {
      pool = course.questionBank.filter((q) => (q.module ?? 1) === parseInt(this.topicSelect.value, 10));
    }
    this.totalAvailLabel.textContent = pool.length;
    this.totalMissedSpan.textContent = missedQuestionIds.length;
    this.resetProgressRow.style.display = missedQuestionIds.length > 0 ? 'block' : 'none';
  }

  // ---- Saved-session resume ----
  checkForSavedSession() {
    const userId = this.userIdInput.value.trim();
    if (!userId) { this.sessionStatus.style.display = 'none'; return; }
    const saved = this.storage.getSession(userId);
    if (saved) {
      this.savedSession = saved;
      const answered = saved.userAnswers ? saved.userAnswers.filter((a) => a !== null).length : 0;
      this.sessionInfo.textContent = `📂 Saved session found (${saved.mode}, ${answered} of ${saved.totalQuestions} answered)`;
      this.sessionStatus.style.display = 'block';
    } else {
      this.sessionStatus.style.display = 'none';
      this.savedSession = null;
    }
  }

  resumeSession() {
    if (!this.savedSession) return;
    this.state.set({ session: { ...this.savedSession, active: true } });
    this.showScreen('quiz-screen');
    const { session } = this.state.get();
    if (session.mode === 'flashcard') this.renderFlashcard();
    else if (session.mode === 'exam') this.renderExamSheet();
    else { this.restoreQuizScreenStructure(); this.renderQuestion(); }
  }

  startFresh() {
    const userId = this.userIdInput.value.trim();
    if (userId) this.storage.clearSession(userId);
    this.savedSession = null;
    this.sessionStatus.style.display = 'none';
  }

  // ---- Starting sessions ----
  startSession() {
    const userId = this.userIdInput.value.trim();
    if (!userId) return;
    this.state.set({ user: { id: userId } });
    this.restoreQuizScreenStructure();

    const mode = this.currentMode;
    const testMode = this.testModeSelect.value;
    const count = this.countSelect.value;

    if (mode === 'flashcard') {
      this.flashcardEngine.start({ count });
      this.showScreen('flashcard-screen');
      this.renderFlashcard();
      return;
    }

    this.examEngine.startPracticeSession({
      mode,
      moduleFilter: this.topicSelect.value,
      count,
      testMode,
      examTimeMinutes: parseInt(this.examTimeInput.value, 10) || 60
    });
    this.showScreen('quiz-screen');
    this.renderQuestion();
  }

  onExamCountInput() {
    const { course } = this.state.get();
    if (this.selectedExamCount == null) {
      this.examCountHint.textContent = 'Pick a size to see your time limit.';
      this.examCountHint.className = 'exam-count-hint';
      this.beginExamBtn.disabled = true;
      return;
    }
    const sizeConfig = course.examSettings.sizes.find((s) => s.count === this.selectedExamCount);
    this.examCountHint.textContent = `Time limit: ${sizeConfig ? sizeConfig.minutes : this.selectedExamCount} minutes`;
    this.examCountHint.className = 'exam-count-hint valid';
    this.beginExamBtn.disabled = !this.userIdInput.value.trim();
  }

  onBeginExamClick() {
    if (!this.userIdInput.value.trim()) { alert('Please enter your User ID.'); return; }
    const { course } = this.state.get();
    const n = this.selectedExamCount;
    if (!course.examSettings.sizes.some((s) => s.count === n)) return;
    this.pendingExamCount = n;
    const sizeConfig = course.examSettings.sizes.find((s) => s.count === n);
    this.examConfirmText.textContent =
      `You're about to start a ${n}-question exam with a ${sizeConfig.minutes}-minute time limit. ` +
      `Once you begin, the timer starts immediately and can't be paused. Ready?`;
    this.examConfirmModal.classList.add('visible');
  }

  closeExamConfirm() {
    this.examConfirmModal.classList.remove('visible');
    this.pendingExamCount = null;
  }

  onExamConfirmStart() {
    if (this.pendingExamCount == null) return;
    const n = this.pendingExamCount;
    this.examConfirmModal.classList.remove('visible');
    this.pendingExamCount = null;
    const userId = this.userIdInput.value.trim();
    this.state.set({ user: { id: userId } });
    this.examEngine.startExam(n);
    this.showScreen('quiz-screen');
    this.renderExamSheet();
  }

  // ---- Leave/skip confirmation modal ----
  openLeaveConfirm(title, text, onProceed) {
    this.leaveConfirmTitle.textContent = title;
    this.leaveConfirmText.textContent = text;
    this.pendingLeaveAction = onProceed;
    this.leaveConfirmModal.classList.add('visible');
  }

  closeLeaveConfirm() {
    this.leaveConfirmModal.classList.remove('visible');
    this.pendingLeaveAction = null;
  }

  onLeaveConfirmProceed() {
    const action = this.pendingLeaveAction;
    this.closeLeaveConfirm();
    if (action) action();
  }

  confirmSkip() {
    this.openLeaveConfirm('Skip this question?', "You won't be able to come back to it.", () => this.skipQuestion());
  }

  confirmEndSession() {
    this.openLeaveConfirm('End this session?', "Your progress so far will be saved, but you'll leave the quiz.", () => this.endSession(false));
  }

  // ---- NEW: Previous button confirmation ----
  confirmPrev() {
    const { session } = this.state.get();
    if (session.currentIndex <= 0) return;
    this.openLeaveConfirm(
      'Go to previous question?',
      'You will move back one question. Your answer (if any) will stay as is.',
      () => this.prevQuestion()
    );
  }

  prevQuestion() {
    const { session } = this.state.get();
    if (session.currentIndex > 0) {
      this.state.set({ session: { currentIndex: session.currentIndex - 1 } });
      this.renderQuestion();
    }
  }

  // ---- Practice/timed single-question rendering ----
  restoreQuizScreenStructure() {
    const questionTextDiv = document.getElementById('question-text');
    if (questionTextDiv && document.body.contains(questionTextDiv)) return;
    this.quizScreen.innerHTML = this.originalQuizScreenHTML;
    this.attachQuizListeners();
  }

  attachQuizListeners() {
    const byId = (id) => document.getElementById(id);
    const skipBtn = byId('skip-btn');
    const endSessionBtn = byId('end-session-btn');
    const nextBtn = byId('next-btn');
    const prevBtn = byId('prev-btn');               // <-- new
    const prevExamBtn = byId('prev-exam-btn');
    const submitExamBtn = byId('submit-exam-btn');
    const nextExamBtn = byId('next-exam-btn');

    if (skipBtn) skipBtn.addEventListener('click', () => this.confirmSkip());
    if (endSessionBtn) endSessionBtn.addEventListener('click', () => this.confirmEndSession());
    if (nextBtn) nextBtn.addEventListener('click', () => this.nextQuestion());
    if (prevBtn) prevBtn.addEventListener('click', () => this.confirmPrev());  // <-- new
    if (prevExamBtn) prevExamBtn.addEventListener('click', () => this.examEngine.prev() || this.renderQuestion());
    if (submitExamBtn) submitExamBtn.addEventListener('click', () => this.submitExam());
    if (nextExamBtn) nextExamBtn.addEventListener('click', () => this.nextExamQuestion());
  }

  renderQuestion() {
    this.restoreQuizScreenStructure();
    const { session } = this.state.get();
    if (session.currentIndex >= session.totalQuestions) { this.endSession(); return; }

    const q = session.questionSet[session.currentIndex];
    const renderer = getQuestionTypeRenderer(q.type);
    const caseTextDiv = document.getElementById('case-text');
    const questionTextDiv = document.getElementById('question-text');
    const optionsList = document.getElementById('options-list');
    const explanationDiv = document.getElementById('explanation');

    renderer.renderPrompt(q, { caseTextEl: caseTextDiv, questionTextEl: questionTextDiv });

    optionsList.innerHTML = '';
    optionsList.classList.toggle('exam-mode', session.testMode !== 'practice');

    q.opts.forEach((opt, idx) => {
      const label = renderer.getOptionLabel(q, idx, opt);
      if (session.testMode === 'practice') {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = label;
        btn.onclick = () => this.selectAnswer(idx);
        if (session.userAnswers[session.currentIndex] !== null) {
          btn.disabled = true;   // <-- cannot change answer on revisit
          if (idx === session.userAnswers[session.currentIndex]) {
            btn.classList.add('selected');
            btn.classList.add(q.opts[idx] === q.ans ? 'correct' : 'wrong');
          }
          if (q.opts[idx] === q.ans) btn.classList.add('correct');
        }
        optionsList.appendChild(btn);
      } else {
        const row = document.createElement('label');
        row.className = 'option-row';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'quiz-option';
        radio.value = idx;
        // Clicking anywhere on the row (label) forwards to the radio.
        // Radios stay enabled and back in sync with state, so the choice
        // can be changed right up until Next / Submit — same as the
        // exam-sheet view, which never locks an answer either.
        radio.onchange = () => this.selectAnswer(idx);
        const textSpan = document.createElement('span');
        textSpan.textContent = label;
        row.appendChild(radio);
        row.appendChild(textSpan);
        if (idx === session.userAnswers[session.currentIndex]) {
          radio.checked = true;
          row.classList.add('selected');
        }
        optionsList.appendChild(row);
      }
    });

    if (session.testMode === 'practice' && session.userAnswers[session.currentIndex] !== null) {
      explanationDiv.textContent = q.exp;
      explanationDiv.classList.add('visible');
    } else {
      explanationDiv.classList.remove('visible');
    }

    document.getElementById('current-q-num').textContent = session.currentIndex + 1;
    document.getElementById('total-q-num').textContent = session.totalQuestions;
    document.getElementById('progress-bar').style.width = `${((session.currentIndex + 1) / session.totalQuestions) * 100}%`;

    const { correct, wrong, scorePercent } = this.analytics.computeLiveStats(session);
    document.getElementById('live-correct').textContent = correct;
    document.getElementById('live-wrong').textContent = wrong;
    document.getElementById('live-score').textContent = `${scorePercent}%`;

    const practiceActions = document.getElementById('practice-actions');
    const examActions = document.getElementById('exam-actions');
    if (session.testMode === 'practice') {
      practiceActions.style.display = 'flex';
      examActions.style.display = 'none';

      // ---- Ensure Previous button exists ----
      let prevBtn = document.getElementById('prev-btn');
      if (!prevBtn) {
        prevBtn = document.createElement('button');
        prevBtn.id = 'prev-btn';
        prevBtn.className = 'secondary-btn';
        prevBtn.textContent = '⬅ Previous';
        const skipBtn = document.getElementById('skip-btn');
        if (skipBtn) {
          practiceActions.insertBefore(prevBtn, skipBtn);
        } else {
          practiceActions.prepend(prevBtn);
        }
        prevBtn.addEventListener('click', () => this.confirmPrev());
      }
      prevBtn.style.display = (session.currentIndex > 0) ? 'inline-block' : 'none';

      document.getElementById('skip-btn').style.display =
        session.userAnswers[session.currentIndex] === null ? 'inline-block' : 'none';
      document.getElementById('next-btn').style.display =
        session.userAnswers[session.currentIndex] !== null ? 'inline-block' : 'none';
    } else {
      practiceActions.style.display = 'none';
      examActions.style.display = 'flex';
    }
    document.getElementById('exam-timer').style.display = (session.testMode === 'exam' || session.mode === 'exam') ? 'block' : 'none';
  }

  selectAnswer(idx) {
    this.examEngine.selectAnswer(idx);
    this.renderQuestion();
  }

  skipQuestion() {
    this.examEngine.skip();
    this.renderQuestion();
  }

  nextQuestion() {
    this.examEngine.next();
    this.renderQuestion();
  }

  nextExamQuestion() {
    const { session } = this.state.get();
    if (session.currentIndex < session.totalQuestions - 1) {
      this.examEngine.next();
      this.renderQuestion();
    }
  }

  // ---- All-questions-on-one-page exam sheet ----
  renderExamSheet() {
    const { session } = this.state.get();
    const container = this.quizScreen;
    container.innerHTML = `
      <div id="exam-timer" style="text-align:center; font-size:20px; font-weight:700; margin-bottom:12px; display:block;">
        Time Remaining: <span id="timer-display">00:00</span>
      </div>
      <div class="stats-bar" id="quiz-stats-bar">
        <span>Correct: <span id="live-correct">${session.correctCount}</span></span>
        <span>Wrong: <span id="live-wrong">${session.wrongCount}</span></span>
        <span>Score: <span id="live-score">0%</span></span>
      </div>
      <div class="progress-container"><div class="progress-bar" id="progress-bar" style="width:0%"></div></div>
      <div style="text-align:right; font-size:14px; color:var(--text-secondary); margin-bottom:16px;">
        Question <span id="current-q-num">1</span> of <span id="total-q-num">${session.totalQuestions}</span>
      </div>
    `;

    let sheetHTML = '<div class="exam-sheet" style="max-height: 70vh; overflow-y: auto; padding-right: 8px;">';
    session.questionSet.forEach((q, idx) => {
      const renderer = getQuestionTypeRenderer(q.type);
      sheetHTML += `
        <div class="exam-question" style="margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid var(--bg-tertiary);">
          <div class="question-number" style="font-weight: bold; margin-bottom: 6px;">Question ${idx + 1}</div>
          ${q.case ? `<div class="case-text" style="font-size:14px; margin-bottom:12px;">${escapeHTML(q.case)}</div>` : ''}
          <div class="question-text" style="font-size:18px; font-weight:600; margin-bottom:16px;">${escapeHTML(q.q)}</div>
          <div class="options-list" style="display:flex; flex-direction:column; gap:0;">
            ${q.opts.map((opt, oIdx) => `
              <label class="exam-option" style="display:flex; align-items:center; gap:8px; padding:6px 2px; cursor:pointer; font-size:14px; font-weight:400; line-height:1.35;">
                <input type="radio" name="q${idx}" value="${oIdx}" ${session.userAnswers[idx] === oIdx ? 'checked' : ''}
                       data-qidx="${idx}" data-oidx="${oIdx}" class="exam-sheet-radio"
                       style="flex-shrink:0; margin:0; width:14px; height:14px; accent-color: var(--accent);">
                <span>${escapeHTML(renderer.getOptionLabel(q, oIdx, opt))}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    });
    sheetHTML += '</div>';
    sheetHTML += '<div style="text-align:right; margin-top:20px;"><button id="exam-submit-btn" style="width:auto; padding:12px 30px;">Submit Exam</button></div>';
    container.insertAdjacentHTML('beforeend', sheetHTML);

    container.querySelectorAll('.exam-sheet-radio').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.examEngine.setExamAnswer(parseInt(e.target.dataset.qidx, 10), parseInt(e.target.dataset.oidx, 10));
        this.updateExamSheetLiveStats();
      });
    });
    document.getElementById('exam-submit-btn').addEventListener('click', () => this.submitExam());
    this.updateExamSheetLiveStats();
    this.updateTimerDisplay(session.timeRemaining);
  }

  updateExamSheetLiveStats() {
    const { session } = this.state.get();
    const { correct, wrong, scorePercent } = this.analytics.computeLiveStats(session);
    document.getElementById('live-correct').textContent = correct;
    document.getElementById('live-wrong').textContent = wrong;
    document.getElementById('live-score').textContent = `${scorePercent}%`;
    const progress = ((correct + wrong + session.skippedCount) / session.totalQuestions) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;
  }

  updateTimerDisplay(secondsLeft) {
    const el = document.getElementById('timer-display');
    if (!el) return;
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    el.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  submitExam() {
    this.examEngine.stopTimer();
    this.updateExamSheetLiveStats?.();
    const { session } = this.state.get();
    const unanswered = session.userAnswers.filter((a) => a === null).length;
    this.state.set({ session: { skippedCount: unanswered, active: false } });
    this.examEngine.finalize({ autoSubmit: true });
    this.showResults();
  }

  // ---- Flashcards ----
  renderFlashcard() {
    const { session } = this.state.get();
    if (session.currentIndex >= session.totalQuestions) { this.endSession(); return; }
    const q = session.questionSet[session.currentIndex];

    const fcCaseText = document.getElementById('fc-case-text');
    const fcQuestion = document.getElementById('fc-question');
    const fcAnswer = document.getElementById('fc-answer');
    const fcExplanation = document.getElementById('fc-explanation');
    const flashcard = document.getElementById('flashcard');
    const fcNextBtn = document.getElementById('fc-next-btn');

    fcQuestion.textContent = q.q;
    fcCaseText.textContent = q.case || '';
    fcCaseText.style.display = q.case ? 'block' : 'none';
    fcAnswer.textContent = q.ans;
    fcExplanation.textContent = q.exp;
    flashcard.classList.remove('flipped');
    fcNextBtn.style.display = 'none';
    document.getElementById('fc-current-num').textContent = session.currentIndex + 1;
    document.getElementById('fc-total-num').textContent = session.totalQuestions;
    document.getElementById('fc-progress-bar').style.width = `${((session.currentIndex + 1) / session.totalQuestions) * 100}%`;

    if (!this._flashcardHandlersBound) {
      document.querySelector('.flashcard-container').addEventListener('click', () => {
        flashcard.classList.toggle('flipped');
        fcNextBtn.style.display = 'block';
      });
      document.querySelector('#fc-next-btn button').addEventListener('click', () => {
        this.flashcardEngine.next();
        this.renderFlashcard();
      });
      document.getElementById('fc-end-btn').addEventListener('click', () => this.confirmEndSession());
      this._flashcardHandlersBound = true;
    }
  }

  // ---- Ending a session / results ----
  endSession(autoSubmit = false) {
    this.examEngine.stopTimer();
    this.examEngine.finalize({ autoSubmit });
    this.showResults();
  }

  showResults() {
    this.showScreen('results-screen');
    const { session } = this.state.get();
    const results = this.analytics.computeResults(session);

    const resultsScore = document.getElementById('results-score');
    resultsScore.textContent = `${results.percent}%`;
    resultsScore.className = `results-score ${results.tier}`;
    document.getElementById('res-correct').textContent = results.correct;
    document.getElementById('res-wrong').textContent = results.wrong;
    document.getElementById('res-skipped').textContent = results.skipped;
    document.getElementById('res-total').textContent = results.total;

    const timeStatBox = document.getElementById('time-stat-box');
    if (results.timeTakenSec != null) {
      timeStatBox.style.display = 'block';
      const mins = Math.floor(results.timeTakenSec / 60);
      const secs = results.timeTakenSec % 60;
      document.getElementById('res-time').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    } else {
      timeStatBox.style.display = 'none';
    }

    const reviewSection = document.getElementById('review-section');
    reviewSection.innerHTML = '';
    session.questionSet.forEach((q, idx) => {
      const userAns = session.userAnswers[idx];
      let statusClass = 'skipped';
      if (userAns !== null && userAns !== undefined) {
        statusClass = q.opts[userAns] === q.ans ? 'correct' : 'wrong';
      }
      const item = document.createElement('div');
      item.className = `review-item ${statusClass}`;
      item.innerHTML = `
        <div class="review-q">${escapeHTML(q.q)}</div>
        <div class="review-detail"><strong>Your answer:</strong> ${userAns !== null && userAns !== undefined ? escapeHTML(q.opts[userAns]) : 'None'}</div>
        <div class="review-detail"><strong>Correct answer:</strong> ${escapeHTML(q.ans)}</div>
        <div class="review-detail" style="margin-top:4px;">${escapeHTML(q.exp)}</div>
      `;
      reviewSection.appendChild(item);
    });

    this.updateTotalAvail();
  }

  retryMissed() {
    if (!this.examEngine.retryMissed()) { alert('No missed questions to retry.'); return; }
    this.showScreen('quiz-screen');
    this.restoreQuizScreenStructure();
    this.renderQuestion();
  }

  newSession() {
    this.examEngine.stopTimer();
    this.state.resetSession();
    this.showScreen('setup-screen');
    this.modeSelect.value = '';
    this.countSelect.value = '';
    this.topicSelect.value = 'all';
    this.testModeSelect.value = 'practice';
    this.examTimeInput.value = '60';
    this.testModeGroup.style.display = 'block';
    this.examTimeGroup.style.display = 'none';
    this.topicGroup.style.display = 'none';
    this.startBtn.disabled = true;

    this.selectedExamCount = null;
    (this.examCountButtons || []).forEach((b) => b.classList.remove('selected'));
    this.closeExamConfirm();
    this.closeLeaveConfirm();
    this.switchTab('practice');
    this.onExamCountInput();
    this.updateTotalAvail();

    this.quizScreen.innerHTML = this.originalQuizScreenHTML;
    this.attachQuizListeners();
    this.checkForSavedSession();
  }

  resetProgress() {
    if (!confirm('Reset all your missed questions and progress?')) return;
    const { course } = this.state.get();
    this.storage.clearMissed();
    this.state.set({ missedQuestionIds: [] });
    const userId = this.userIdInput.value.trim();
    if (userId) this.storage.clearSession(userId);
    this.updateTotalAvail();
    this.checkForSavedSession();
  }
}
