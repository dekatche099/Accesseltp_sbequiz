# Adding a New Course

Adding a course never requires editing anything under `/engine/`. Three steps:

## 1. Create the course definition file

Copy `/courses/example-course.json` to `/courses/<your-course-id>.json` and
fill it in. Full field reference: `/courses/SCHEMA.md`.

Minimum you need:
- `meta.id` — unique, becomes the URL (`course.html?course=<id>`) and the
  storage key prefix. Use lowercase-with-hyphens, e.g. `"credit-policy-guide"`.
- `meta.title` — shown on the setup screen.
- `questionBank` — array of questions (`id`, `module`, `q`, `opts`, `ans`,
  `exp`, optional `case`).

You do **not** need to hand-write a module `<select>` list — it's built
automatically from whatever `module` numbers appear in your `questionBank`
(or you can supply nicer titles via the optional `modules` array).

## 2. Migrating an existing (legacy) course page instead of writing JSON by hand

If you already have an old single-file quiz HTML page for this course:

```bash
node tools/migrate-legacy-course.js path/to/old-course-quiz.html courses/
```

This extracts the real `COURSE` object and `QB` array by executing them
(not fragile regex-parsing), recovers module titles from the old
`<select id="topic-select">` if it was filled in, and writes
`courses/<id>.json` for you. It prints a warning if it couldn't find real
module titles — those questions get generic "Module N" names, which you
should replace with real titles by hand afterward.

**Always review the generated JSON before shipping it** — the migration
tool trusts the old file's data was already correct (it doesn't re-verify
answers), it just reshapes it.

## 3. Register the course in a track catalogue

Open `retail-track.html` or `grad-track.html` and add one entry to the
`courses` array:

```js
{ title: "Your Course Name", status: "available", link: "course.html?course=your-course-id", desc: "..." }
```

That's it — no other file changes. The shared engine reads everything else
from the JSON you just created.

## Testing your new course

Open `course.html?course=your-course-id` directly in a browser. Check the
console: the loader logs either
`✅ Course "your-course-id" passed self-check` or a list of specific
problems (missing `module` field, duplicate `id`, wrong option count, etc.)
naming the exact question at fault — the same self-check the old inline
`validateQB()` did, just running against your JSON instead of a hardcoded
array.
