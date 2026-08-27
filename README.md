# ELTP Quiz Hub

A browser-based study platform for the Access Bank ELTP (Executive/Entry-Level Trainee Programme) — practice quizzes, timed exams, flashcards, and a full workbook system, all running client-side with no backend required.

**Live site:** https://dekatche099.github.io/Accesseltp_sbequiz/

---

## 📓 Practice Workbooks — the heart of this platform

Everything else here exists to feed into the workbook. **[`workbooks.html`](./workbooks.html)** is a free-form study space, not tied to any single course, where you actually process what you're learning instead of just clicking through multiple-choice options.

### What you can do in a workbook

- **Subjects & Sheets** — organize like a real notebook. Create a Subject (e.g. "Banking Operations"), and inside it, add Sheets that work like Excel tabs — click **+** to add one, double-click to rename, click to switch.
- **Question panel** — paste a question exactly as it appears in your textbook, a Word doc, or a webpage, and the panel keeps the original tables and formatting intact. It sits above your answer space (not mixed into it), so you can read the question while you write. Resize it by dragging the bottom edge, or hide it entirely.
- **Answer editor** — a full rich-text space to actually work through the answer: draw and fill in tables from the Table menu, format text, and use the **Ω** button to write proper equations (fractions, Greek letters, and more) via a TeX-based editor.
- **Autosave + cross-device sync** — everything saves as you type. Sign in (top right) to sync your workbooks across devices, using the same login as the rest of the platform.
- **Export** — pull your work out as PDF or JSON. The PDF export includes both your questions and your answers, so it reads back as a complete study record you can print or share.
- **Day / Night mode** — 🌙 / ☀️ toggle, remembers your preference.

Open a workbook any time from the **Practice Workbooks** banner at the top of either track page — it isn't gated behind picking a course first.

---

## 🧠 Quizzes & Practice

The rest of the platform is the quiz engine that sits around the workbook:

- **[`index.html`](./index.html)** — login hub. Register or log in with email + password (or Google) to sync your progress across devices.
- **[`grad-track.html`](./grad-track.html)** / **[`retail-track.html`](./retail-track.html)** — course listings for the Graduate Track (ELTP 14–17) and Retail Track (ELTP 18–21).
- **[`course.html`](./course.html)** — the shared quiz engine used by every course. Supports:
  - **Quiz modes:** Sequential, Random Mix, Missed Questions Only
  - **Test modes:** Practice (instant feedback, locks your answer once picked) and Timed (freely change your answer until you move on or submit — like a real exam)
  - **Flashcards** for a lighter review pass
  - **Exam tab** — a full timed sheet across every question in the bank, with live scoring
- **29 question banks** under [`courses/`](./courses), covering everything from Basic Banking Operations to Cybersecurity to Compliance & Ethics.

---

## Everything is themeable

Every page — quizzes, tracks, hub, and workbooks — now shares a day/night mode. **Dark is the default**; anyone who prefers a bright screen can switch with the 🌙/☀️ button in the top-right corner, and the choice is remembered on that device.

---

## Progress & data

- All progress (scores, missed questions, workbook content) is saved locally in the browser via `localStorage`.
- Signing in additionally syncs that data to the cloud, so progress follows you across devices.
- Nothing here requires a server to run — the whole site is static HTML/CSS/JS and can be hosted anywhere (currently on GitHub Pages).

## Project structure

```
├── index.html              # Login hub
├── grad-track.html         # Graduate Track course list
├── retail-track.html       # Retail Track course list
├── course.html             # Shared quiz engine (used by every course)
├── workbooks.html          # Practice Workbooks
├── courses/                # Question bank JSON files (one per course)
├── engine/                 # Quiz engine logic (state, rendering, exam/flashcard logic)
├── cloud-sync.js           # Cross-device progress sync
└── workbook-sync.js        # Cross-device workbook sync
```

## Deploying an update — bump the cache-busting version

Every internal script/import (`engine/app.js`, `cloud-sync.js`, `workbook-sync.js`,
`engine/firebase-auth.js`, etc.) is loaded with a `?v=YYYYMMDD` query string. This
exists purely so trainees' browsers actually fetch the new file after you deploy,
instead of quietly reusing a cached copy of the old one for days. **It has nothing
to do with saved progress** — that lives in `localStorage`/Firestore, a completely
separate system that this version string never touches.

**Every time you push a real update to any `.js` file (not needed for course JSON
or pure CSS/copy changes), find-and-replace the old `?v=` date with today's date
across every file that references it.** There's no build step to automate this —
it's a manual, but quick, five-minute find-and-replace.

## Adding a new course

Drop a new JSON file into `courses/` following the structure of [`example-course.json`](./example-course.json), then link it from `grad-track.html` or `retail-track.html`. `course.html` picks it up automatically via the `?course=` URL parameter — no engine changes needed.
