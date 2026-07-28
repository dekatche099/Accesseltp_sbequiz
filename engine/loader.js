/* loader.js — Course Loader
 * ============================================================
 * Fetches a course definition JSON file and turns it into a
 * normalized, validated in-memory object. This is the ONLY place
 * course-specific data enters the engine — nothing downstream
 * ever hardcodes a course name, module, or question count.
 *
 * Expected shape (see /courses/SCHEMA.md for the full spec):
 * {
 *   "meta": { "id", "title", "description", "category", "version" },
 *   "examSettings": { "sizes": [{count, minutes}, ...], "passMark": 70 },
 *   "flashcardSettings": { "enabled": true },
 *   "modules": [ { "id": 1, "title": "..." }, ... ],
 *   "questionBank": [ { "id","module","type","q","opts","ans","exp","case"? }, ... ]
 * }
 * ============================================================ */

export class CourseLoadError extends Error {
  constructor(message, problems = []) {
    super(message);
    this.name = 'CourseLoadError';
    this.problems = problems;
  }
}

/** Convert a single-letter answer ("A".."D") to the matching option's full text. */
function resolveLetterAnswer(question) {
  const { ans, opts } = question;
  if (typeof ans === 'string' && ans.length === 1 && ans >= 'A' && ans <= 'D') {
    const idx = ans.charCodeAt(0) - 65;
    if (Array.isArray(opts) && opts.length > idx) {
      return opts[idx];
    }
  }
  return ans;
}

/**
 * Same checks as the old inline `validateQB()` self-check, generalized
 * to run against any course's question bank. Returns a list of human
 * readable problem strings; does not throw — the caller decides whether
 * problems are fatal.
 */
function runSelfCheck(questionBank) {
  const seenIds = new Set();
  const problems = [];

  questionBank.forEach((q, i) => {
    const label = `questionBank[${i}] (id: ${q.id || 'MISSING ID'})`;

    if (q.module === undefined || q.module === null) {
      problems.push(`${label}: missing "module" field.`);
    }
    if (!q.id) {
      problems.push(`${label}: missing "id" field.`);
    } else if (seenIds.has(q.id)) {
      problems.push(`${label}: duplicate id "${q.id}".`);
    } else {
      seenIds.add(q.id);
    }
    if (!Array.isArray(q.opts) || (q.opts.length !== 4 && q.opts.length !== 2)) {
      problems.push(`${label}: "opts" must be an array of exactly 4 items (standard MCQ) or exactly 2 items (True/False).`);
    } else if (q.opts.some((o) => /^[A-D][.)]\s/.test(o))) {
      problems.push(`${label}: an option starts with "A. "/"B) " etc. — remove letter prefixes.`);
    }
    if (!q.ans) {
      problems.push(`${label}: missing "ans" field.`);
    }
    if (q.type === 'case-mcq' && !q.case) {
      problems.push(`${label}: type is "case-mcq" but "case" text is missing.`);
    }
  });

  return problems;
}

/** Derive a { id, title } module list from the question bank if the course JSON omits it. */
function deriveModulesFromBank(questionBank) {
  const seen = new Map();
  questionBank.forEach((q) => {
    const id = q.module ?? 1;
    if (!seen.has(id)) {
      seen.set(id, id === 0 ? 'Case Studies' : `Module ${id}`);
    }
  });
  return [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, title]) => ({ id, title }));
}

export class CourseLoader {
  /**
   * @param {string} url - path to the course JSON file
   * @param {object} [options]
   * @param {boolean} [options.strict=false] - if true, throws on any self-check problem instead of just warning
   */
  static async load(url, options = {}) {
    const { strict = false } = options;

    let raw;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = await res.json();
    } catch (e) {
      throw new CourseLoadError(`Could not load course file "${url}": ${e.message}`);
    }

    if (!raw.meta || !raw.meta.id) {
      throw new CourseLoadError(`Course file "${url}" is missing meta.id.`);
    }
    if (!Array.isArray(raw.questionBank) || raw.questionBank.length === 0) {
      throw new CourseLoadError(`Course file "${url}" has no questionBank.`);
    }

    // ---- Normalize question bank: resolve letter answers, default type ----
    const questionBank = raw.questionBank.map((q) => ({
      type: 'mcq',
      ...q,
      ans: resolveLetterAnswer(q)
    }));

    // ---- Self-check ----
    const problems = runSelfCheck(questionBank);
    if (problems.length) {
      const message = `⚠️ Course "${raw.meta.id}" has ${problems.length} issue(s):\n${problems.join('\n')}`;
      if (strict) throw new CourseLoadError(message, problems);
      console.warn(message);
    } else {
      console.log(`✅ Course "${raw.meta.id}" passed self-check: ${questionBank.length} questions.`);
    }

    // ---- Defaults ----
    const modules = Array.isArray(raw.modules) && raw.modules.length
      ? raw.modules
      : deriveModulesFromBank(questionBank);

    const examSettings = {
      sizes: [
        { count: 30, minutes: 40 },
        { count: 40, minutes: 45 },
        { count: 50, minutes: 60 }
      ],
      passMark: 70,
      ...raw.examSettings
    };

    const flashcardSettings = {
      enabled: true,
      ...raw.flashcardSettings
    };

    return {
      meta: raw.meta,
      examSettings,
      flashcardSettings,
      modules,
      questionBank
    };
  }
}
