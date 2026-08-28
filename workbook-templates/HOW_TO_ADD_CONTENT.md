# Workbook Starter Pack Prompt — How to Add Content

## How it looks to the trainee, end to end

1. They open a subject (e.g. "Accounting") and see Sheet 1, Sheet 2, Sheet 3... one per question.
2. The **question** is shown at the top, in the question panel — same as any question you'd add manually today.
3. Below that is their own blank writing space (the TinyMCE editor) — this is where **they** write their own answer. It starts empty. Your solution is never pre-filled in here.
4. Below their writing space sits a closed strip: **"🔒 Show Solution."** Nothing is visible until they click it.
5. Clicking it pops up a confirmation: *"Are you sure you want to see the solution? Try answering the question first."* Only if they confirm does the solution appear, in its own green-bordered panel, below their own answer.
6. They can hide it again anytime — hiding never asks for confirmation, only revealing does.

That's the full shape. Now here's how to produce the file that creates this.

## The prompt

Use this with any AI (Claude, ChatGPT, etc.) whenever you have questions in any format — typed notes, a PDF, a past exam, whatever — and want them converted into a file ready to drop into `workbook-templates/`.

Copy everything below the line, paste your source questions where indicated, and send it.

---

You are converting a set of practice questions and their solutions into a specific JSON format for a workbook app. Follow the schema exactly — the app reads this file automatically, so it must be valid JSON with these exact field names.

**Output this exact shape:**

```json
{
  "subjectName": "<the subject/course name, e.g. 'Accounting' or 'Financial Statement Analysis'>",
  "sheets": [
    {
      "sheetName": "<a short label, e.g. 'Section B - Q1' or 'Case Study 1'>",
      "question": "<the question text, as HTML>",
      "solution": "<the full worked solution/answer, as HTML>"
    }
  ]
}
```

**Rules:**
1. Output ONLY the JSON — no explanation before or after, no markdown code fences, just the raw JSON object.
2. `question` and `solution` are HTML strings. Use `<p>` for paragraphs, `<strong>` for bold/emphasis, `<br>` for line breaks within a paragraph. Do not use Markdown syntax (no `**bold**`, no `#` headers) — it must be HTML since that's what the app's editor renders.
3. **If the source material has a table** (trial balances, journal entries, comparative figures, anything row/column shaped), reproduce it as a real HTML table, not as plain text with dashes or tabs. Use this exact structure:
   ```html
   <table><tr><th>Column 1</th><th>Column 2</th></tr><tr><td>Row 1 value</td><td>Row 1 value</td></tr></table>
   ```
   Use `<th>` only for the header row, `<td>` for every data row. The app already has styling for tables inside both the question and solution panels — you don't need to add any styling yourself, just the plain table markup.
4. One `sheet` per question. If a question has multiple parts (a, b, c), keep them together in one sheet's `question`/`solution` unless they're genuinely long enough to deserve separate sheets — use your judgment, but default to one sheet per question.
5. `sheetName` should be short and describe what it is — reuse the exam's own section labels (e.g. "Section B - Q3") if the source material has them, otherwise something plain like "Depreciation Question 1".
6. If a solution isn't provided in my source material, write a correct, complete solution yourself — don't leave it blank, and don't just restate the question.
7. Keep numbers, currency, and figures exactly as given in the source — don't round or simplify them.
8. If my source material spans more than one subject, only include the one I specify below — ignore the rest.

**Subject for this file:** [fill in — e.g. "Accounting"]

**Source questions:**
[paste your questions and solutions here — any format is fine, messy notes are fine, tables in your source are fine too]

---

## What to do with the output

1. Save it as `<subjectname>.json` (all lowercase, no spaces — e.g. `accounting.json`, `financial-statement-analysis.json`) inside the `workbook-templates/` folder.
2. Add that exact filename as a new line in `workbook-templates/manifest.json`.
3. Push. That's the entire process — no code changes, ever, for adding more subjects.

See `accounting.json` in this same folder for a complete real example, including one question with tables in both the question and the solution — copy its shape directly if you'd rather build a file by hand than use the prompt.
