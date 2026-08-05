# Course Definition Schema

Every course is one JSON file living in `/courses/<id>.json`. This is the
**only** place course-specific data (title, modules, questions, exam sizes)
is allowed to live. If you find yourself editing anything under `/engine/`
to add a course, something has gone wrong — stop and re-read
[ADDING_A_COURSE.md](../docs/ADDING_A_COURSE.md).

```jsonc
{
  "meta": {
    "id": "critical-thinking",       // REQUIRED, unique, used for storage keys & URLs
    "title": "Critical Thinking",    // REQUIRED, shown on the setup screen and <title>
    "description": "...",            // optional, shown under the title
    "category": "retail",            // optional, free text — "retail" | "graduate" | etc.
    "version": "1.0.0"               // optional, for your own change tracking
  },

  "examSettings": {                  // optional — defaults shown below are used if omitted
    "sizes": [
      { "count": 30, "minutes": 40 },
      { "count": 40, "minutes": 45 },
      { "count": 50, "minutes": 60 }
    ],
    "passMark": 70                   // percent — controls the green/amber/red result tier
  },

  "flashcardSettings": {             // optional
    "enabled": true
  },

  "modules": [                       // optional — auto-derived from questionBank if omitted
    { "id": 1, "title": "Introduction to X" },
    { "id": 2, "title": "Ratio Analysis" },
    { "id": 0, "title": "Case Studies" }   // convention: module 0 = case studies
  ],

  "questionBank": [
    {
      "id": "Q1",                    // REQUIRED, unique across the WHOLE file
      "module": 1,                   // REQUIRED — a number matching an entry in "modules"
      "type": "mcq",                 // optional, defaults to "mcq". Also: "case-mcq", or any
                                      // custom type registered in engine/question-types.js
      "q": "What is ...?",           // REQUIRED — question text
      "opts": ["Berlin", "Madrid", "Paris", "Rome"],  // REQUIRED — exactly 4, NO letter prefixes
      "ans": "C",                    // REQUIRED — a letter A-D, OR the exact text of the correct option
      "exp": "Paris is the capital of France.",       // recommended — shown after answering
      "case": "A retail bank noticed..."              // only for type: "case-mcq"
    }
  ]
}
```

## Rules the loader enforces

- `meta.id` must be present — the loader refuses to load without it.
- `questionBank` must be a non-empty array.
- Every question needs `id`, `module`, `opts` (exactly 4), and `ans`.
- IDs must be unique across the entire `questionBank`.
- `opts` must not contain hand-typed letter prefixes ("A. ", "B) ") — the
  renderer adds these automatically, after shuffling.
- `ans` may be a bare letter (`"A"`–`"D"`) or the exact option text; the
  loader resolves letters to full text once at load time.

Any of these problems produce a console warning naming the exact question
index and id; missing `meta.id` or an empty `questionBank` is a hard error
(the page shows a friendly "couldn't load this quiz" message instead of a
silent blank screen).

## Adding a question type

See the bottom of `/engine/question-types.js` — register a new type there,
then just set `"type": "your-type"` on questions in this JSON. No other
engine file needs to change.
