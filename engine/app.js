/* app.js — Application Bootstrap
 * ============================================================
 * The one file course.html actually imports. Reads ?course=<id>
 * from the URL, loads that course's JSON definition, and wires
 * Loader -> State -> Storage -> Analytics -> ExamEngine /
 * FlashcardEngine -> UIRenderer -> Firebase adapter together.
 *
 * Adding a brand-new course NEVER touches this file — see
 * /docs/ADDING_A_COURSE.md. This file only knows how to run
 * "a course", not which one.
 * ============================================================ */

import { createAppState } from './state.js';
import { StorageManager } from './storage.js';
import { CourseLoader, CourseLoadError } from './loader.js';
import { AnalyticsManager } from './analytics.js';
import { ExamEngine } from './exam-engine.js';
import { FlashcardEngine } from './flashcard-engine.js';
import { UIRenderer } from './ui-renderer.js';
import { attachFirebaseSync } from './firebase-adapter.js';
import './question-types.js'; // registers built-in mcq / case-mcq renderers

function getCourseUrlFromQueryString() {
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('course');
  if (!courseId) return null;
  // Course JSON files live in /courses/<id>.json relative to this page.
  return `courses/${courseId}.json`;
}

function showFatalError(message) {
  const root = document.getElementById('app-root') || document.body;
  root.innerHTML = `
    <div style="max-width:600px;margin:60px auto;padding:24px;background:#1e293b;border-radius:12px;color:#f8fafc;font-family:sans-serif;">
      <h2 style="margin-bottom:12px;">Couldn't load this quiz</h2>
      <p style="color:#cbd5e1;line-height:1.5;">${message}</p>
    </div>
  `;
}

async function bootstrap() {
  const courseUrl = getCourseUrlFromQueryString();
  if (!courseUrl) {
    showFatalError('No course was specified. Expected a URL like <code>course.html?course=critical-thinking</code>.');
    return;
  }

  let course;
  try {
    course = await CourseLoader.load(courseUrl);
  } catch (e) {
    if (e instanceof CourseLoadError) {
      showFatalError(e.message.replace(/\n/g, '<br>'));
    } else {
      showFatalError('An unexpected error occurred while loading this course.');
    }
    console.error(e);
    return;
  }

  const state = createAppState();
  const storage = new StorageManager(course.meta.id);
  const analytics = new AnalyticsManager({ storage });
  const examEngine = new ExamEngine({ state, storage, analytics });
  const flashcardEngine = new FlashcardEngine({ state, storage });
  const uiRenderer = new UIRenderer({ state, storage, examEngine, flashcardEngine, analytics });

  state.set({
    course,
    missedQuestionIds: storage.getMissed()
  });

  uiRenderer.init();

  // Exposed for cloud-sync.js / debugging, same role window.__courseId played before.
  window.__courseId = course.meta.id;
  await attachFirebaseSync(course.meta.id, uiRenderer);
}

bootstrap();
