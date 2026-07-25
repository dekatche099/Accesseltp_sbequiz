/* question-types.js — Question Type Registry
 * ============================================================
 * The engine never special-cases "is this a case-study question?"
 * anywhere in exam-engine.js, flashcard-engine.js, or ui-renderer.js.
 * Instead, every question has a `type` field, and each type registers
 * a small renderer object here. Adding a new question type (image
 * question, hotspot, matching, etc.) means adding one entry to this
 * file — the rest of the engine keeps working unmodified.
 *
 * A renderer object implements:
 *   renderPrompt(question, { caseTextEl, questionTextEl })
 *       — populate the case/question text areas for this question.
 *   getOptionLabel(question, optionIndex, optionText)
 *       — returns the display string for one answer option
 *         (both built-in types just do "A) <text>", but an image
 *         type might return an <img> instead of a plain string).
 *
 * All built-in types share the same option-selection / scoring logic
 * (exam-engine.js), since scoring only needs opts/ans, not type.
 * ============================================================ */

const registry = new Map();

export function registerQuestionType(type, renderer) {
  registry.set(type, renderer);
}

export function getQuestionTypeRenderer(type) {
  return registry.get(type) || registry.get('mcq');
}

// ---- Built-in: standard MCQ ----
registerQuestionType('mcq', {
  renderPrompt(question, { caseTextEl, questionTextEl }) {
    caseTextEl.style.display = 'none';
    caseTextEl.textContent = '';
    questionTextEl.textContent = question.q;
  },
  getOptionLabel(question, optionIndex, optionText) {
    return `${String.fromCharCode(65 + optionIndex)}) ${optionText}`;
  }
});

// ---- Built-in: case-study MCQ (adds a narrative block above the question) ----
registerQuestionType('case-mcq', {
  renderPrompt(question, { caseTextEl, questionTextEl }) {
    caseTextEl.style.display = question.case ? 'block' : 'none';
    caseTextEl.textContent = question.case || '';
    questionTextEl.textContent = question.q;
  },
  getOptionLabel(question, optionIndex, optionText) {
    return `${String.fromCharCode(65 + optionIndex)}) ${optionText}`;
  }
});

/*
 * EXAMPLE — adding a future type without touching any other engine file:
 *
 *   import { registerQuestionType } from './question-types.js';
 *   registerQuestionType('image-mcq', {
 *     renderPrompt(question, { caseTextEl, questionTextEl }) {
 *       caseTextEl.style.display = 'none';
 *       questionTextEl.innerHTML = `<img src="${question.imageUrl}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:12px;">${question.q}`;
 *     },
 *     getOptionLabel(question, optionIndex, optionText) {
 *       return `${String.fromCharCode(65 + optionIndex)}) ${optionText}`;
 *     }
 *   });
 *
 * Then set "type": "image-mcq" and "imageUrl": "..." on questions in the
 * course JSON. No engine file needs to change.
 */
