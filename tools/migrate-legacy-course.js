#!/usr/bin/env node
/**
 * tools/migrate-legacy-course.js
 *
 * Converts an old single-file legacy quiz HTML page into a courses/<id>.json
 * file matching engine/SCHEMA.md, as documented in engine/ADDING_A_COURSE.md.
 *
 * Usage:
 *   node tools/migrate-legacy-course.js path/to/old-course-quiz.html courses/
 *
 * How it works (matches the doc's description exactly):
 *   1. Finds the legacy page's inline <script> block(s) and executes them in
 *      a sandboxed vm context (NOT regex-parsing) so `COURSE` / `QB` end up
 *      as real JS values, however they were originally declared (var/let/
 *      const, object literal, array literal, computed values, etc.).
 *   2. Recovers module titles from <select id="topic-select"><option>...
 *      if present, so modules get real names instead of generic ones.
 *   3. Normalizes into the current schema: meta / examSettings /
 *      flashcardSettings / modules / questionBank, resolving single-letter
 *      `ans` values the same way engine/loader.js does.
 *   4. Writes courses/<meta.id>.json (id derived from filename unless the
 *      legacy COURSE object already had one) and runs the same letter-prefix
 *      / duplicate-id checks as engine/loader.js::runSelfCheck() before
 *      writing, refusing to write a file that would fail validation.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const [, , inputArg, outDirArg] = process.argv;
if (!inputArg || !outDirArg) {
  fail(
    'Usage: node tools/migrate-legacy-course.js path/to/old-course-quiz.html courses/'
  );
}

const inputPath = path.resolve(inputArg);
const outDir = path.resolve(outDirArg);

if (!fs.existsSync(inputPath)) fail(`Input file not found: ${inputPath}`);
if (!fs.existsSync(outDir)) fail(`Output directory not found: ${outDir}`);

const html = fs.readFileSync(inputPath, 'utf-8');

// ---- 1. Extract and execute inline <script> blocks in a sandbox ----------

function extractScriptBlocks(source) {
  const blocks = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(source)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

const scriptBlocks = extractScriptBlocks(html);
if (scriptBlocks.length === 0) {
  fail('No inline <script> blocks found — nothing to execute/extract.');
}

const sandbox = {
  window: {},
  document: {
    // Minimal stubs so legacy scripts that touch the DOM at load time
    // don't throw. This tool only cares about the data assignments, not
    // any rendering side effects.
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
  },
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const block of scriptBlocks) {
  try {
    vm.runInContext(block, sandbox, { timeout: 5000 });
  } catch (e) {
    // Legacy pages often reference DOM elements that don't exist in this
    // sandbox; keep going as long as COURSE/QB got assigned before the
    // failure. We only hard-fail below if neither ever showed up.
    console.warn(`  (non-fatal script error, continuing: ${e.message})`);
  }
}

const rawCourse = sandbox.COURSE || sandbox.window.COURSE || null;
const rawQB = sandbox.QB || sandbox.window.QB || null;

if (!rawQB && !(rawCourse && rawCourse.questionBank)) {
  fail(
    'Could not find a COURSE or QB variable after executing the page\'s scripts. ' +
      'This tool expects the legacy page to declare one of them at the top level.'
  );
}

const questionBank = rawQB || rawCourse.questionBank;

// ---- 2. Recover module titles from #topic-select --------------------------

function extractModuleTitles(source) {
  const selectMatch = source.match(
    /<select[^>]*id=["']topic-select["'][^>]*>([\s\S]*?)<\/select>/i
  );
  if (!selectMatch) return {};
  const optionRe = /<option[^>]*value=["']?(\d+)["']?[^>]*>([\s\S]*?)<\/option>/gi;
  const titles = {};
  let m;
  while ((m = optionRe.exec(selectMatch[1])) !== null) {
    const id = parseInt(m[1], 10);
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    if (title && !/^(all|select|choose)/i.test(title)) {
      titles[id] = title;
    }
  }
  return titles;
}

const recoveredTitles = extractModuleTitles(html);
const recoveredCount = Object.keys(recoveredTitles).length;

// ---- 3. Normalize into current schema -------------------------------------

function resolveLetterAnswer(q) {
  if (typeof q.ans === 'string' && /^[A-D]$/.test(q.ans) && Array.isArray(q.opts)) {
    const idx = q.ans.charCodeAt(0) - 'A'.charCodeAt(0);
    if (q.opts[idx] !== undefined) return q.opts[idx];
  }
  return q.ans;
}

const letterPrefixRe = /^[A-D][.)]\s/;

const normalizedQuestions = questionBank.map((q, i) => {
  const opts = Array.isArray(q.opts)
    ? q.opts.map((o) => String(o).replace(letterPrefixRe, ''))
    : q.opts;
  return {
    id: q.id || `Q${i + 1}`,
    module: q.module ?? 1,
    ...(q.type ? { type: q.type } : {}),
    q: q.q,
    opts,
    ans: resolveLetterAnswer({ ...q, opts }),
    exp: q.exp || '',
    ...(q.case ? { case: q.case } : {}),
  };
});

const moduleIds = [...new Set(normalizedQuestions.map((q) => q.module))].sort(
  (a, b) => a - b
);
const modules = moduleIds.map((id) => ({
  id,
  title: recoveredTitles[id] || `Module ${id}`,
}));

const baseName = path.basename(inputPath, path.extname(inputPath));
const slug =
  (rawCourse && rawCourse.id) ||
  baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const courseJson = {
  meta: {
    id: slug,
    title: (rawCourse && rawCourse.title) || baseName,
    description: (rawCourse && rawCourse.description) || '',
    category: (rawCourse && rawCourse.category) || '',
    version: '1.0.0',
  },
  examSettings: {
    sizes: [
      { count: 30, minutes: 40 },
      { count: 40, minutes: 45 },
      { count: 50, minutes: 60 },
    ],
    passMark: 70,
  },
  flashcardSettings: { enabled: true },
  modules,
  questionBank: normalizedQuestions,
};

// ---- 4. Run the same checks as engine/loader.js::runSelfCheck() ----------

function runSelfCheck(qb) {
  const problems = [];
  const seenIds = new Set();
  qb.forEach((q, i) => {
    const label = `Q${i + 1} (id=${q.id})`;
    if (!q.id) problems.push(`${label}: missing id`);
    if (seenIds.has(q.id)) problems.push(`${label}: duplicate id`);
    seenIds.add(q.id);
    if (!Array.isArray(q.opts) || (q.opts.length !== 4 && q.opts.length !== 2)) {
      problems.push(`${label}: expected 4 (or 2 for true/false) options`);
    } else if (q.opts.some((o) => letterPrefixRe.test(o))) {
      problems.push(`${label}: an option starts with "A. "/"B) " etc. — remove letter prefixes.`);
    }
    if (!q.ans) problems.push(`${label}: missing ans`);
    if (q.type === 'case-mcq' && !q.case) problems.push(`${label}: case-mcq missing case field`);
  });
  return problems;
}

const problems = runSelfCheck(normalizedQuestions);
if (problems.length > 0) {
  console.error('\n✗ Migration produced data that fails the schema self-check:\n');
  problems.slice(0, 20).forEach((p) => console.error('  - ' + p));
  if (problems.length > 20) console.error(`  ...and ${problems.length - 20} more`);
  console.error(
    '\nNo file was written. Fix the legacy source (or this script) and re-run.\n'
  );
  process.exit(1);
}

// ---- 5. Write output --------------------------------------------------

const outPath = path.join(outDir, `${slug}.json`);
fs.writeFileSync(outPath, JSON.stringify(courseJson, null, 2) + '\n', 'utf-8');

console.log(`\n✓ Wrote ${outPath}`);
console.log(`  ${normalizedQuestions.length} questions across ${modules.length} module(s)`);
if (recoveredCount > 0) {
  console.log(`  Recovered ${recoveredCount} module title(s) from #topic-select`);
} else {
  console.log(
    '  ⚠ No module titles recovered from #topic-select — modules were named ' +
      '"Module N" generically. Replace with real titles by hand.'
  );
}
