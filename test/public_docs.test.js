// What a stranger reads must not point at private material. Three denylists:
//   1. review ids (pass numbers, finding ids) in code comments;
//      decision ids (D1 to D24) are kept, they resolve in PLAN.md;
//   2. private workspace paths anywhere in tracked text;
//   3. third-person references to the owner in README and docs/*.md.
// PLAN.md and docs/reviews/ are process records: they may use review ids and
// "the owner" by design, so only the private-path rule applies to them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.git']);

function walk(dir, out = []) {
  for (const e of readdirSync(ROOT + dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}
const files = walk('');
const read = (rel) => readFileSync(ROOT + rel, 'utf8');

// ---- comment extraction -----------------------------------------------------

/** [{n, text}] for each comment in JS-like source (// and block comments). */
function jsComments(src) {
  const out = [];
  let i = 0;
  let line = 1;
  let quote = null;
  while (i < src.length) {
    const ch = src[i];
    const two = src.slice(i, i + 2);
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      else if (ch === '\n') line += 1;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out.push({ n: line, text: src.slice(i, stop) });
      i = stop - 1;
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      const text = src.slice(i, stop);
      text.split('\n').forEach((t, k) => out.push({ n: line + k, text: t }));
      line += text.split('\n').length - 1;
      i = stop - 1;
    } else if (ch === '\n') {
      line += 1;
    }
    i += 1;
  }
  return out;
}

/** Comments of a CSS or HTML file: block comments, HTML comments, and inline script comments. */
function markupComments(src) {
  const out = [];
  for (const m of src.matchAll(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g)) {
    const before = src.slice(0, m.index).split('\n').length;
    m[0].split('\n').forEach((t, k) => out.push({ n: before + k, text: t }));
  }
  for (const m of src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    const before = src.slice(0, m.index).split('\n').length - 1;
    for (const c of jsComments(m[1])) out.push({ n: before + c.n, text: c.text });
  }
  return out;
}

const isCode = (f) => /\.(?:js|mjs)$/.test(f);
const isMarkup = (f) => /\.(?:css|html)$/.test(f);
const isText = (f) => /\.(?:js|mjs|css|html|md|json|yml|yaml|py)$/.test(f);

// Files whose comments ship with the app or the repo. Tests are included.
const commentFiles = files.filter(
  (f) =>
    (isCode(f) || isMarkup(f)) &&
    !f.startsWith('.githooks/') &&
    f !== 'FEATURES.json' &&
    f !== 'scripts/features.py',
);

const commentsOf = (f) => (isCode(f) ? jsComments(read(f)) : markupComments(read(f)));

// ---- patterns ---------------------------------------------------------------

const REVIEW_ID = [
  /\bgate pass \d+/i,
  /\b(?:UX )?pass \d+\b/i,
  /\b(?:UX|W|H|M|L)\d{1,2}\b/,
  /\bplan review #\d+/i,
  /\bretro lesson\b/i,
];
const PRIVATE_PATH =
  /[A-Za-z]:\\Users\\|\/Users\/[a-z]|ClaudeCodeWork|context-directory|AppData|\bscisp\b/i;
const OWNER_REF = /\bthe owner\b|\bowner's\b|\bJess\b/i;

const PUBLIC_DOCS = files.filter(
  (f) =>
    f === 'README.md' || (/^docs\/(?!reviews\/).+\.md$/.test(f) && !f.startsWith('docs/reviews/')),
);

// ---- tests ------------------------------------------------------------------

test('code comments carry no review ids (gate pass N, finding ids)', () => {
  const hits = [];
  for (const f of commentFiles) {
    for (const c of commentsOf(f)) {
      if (REVIEW_ID.some((re) => re.test(c.text)))
        hits.push({ file: f, n: c.n, text: c.text.trim() });
    }
  }
  assert.deepEqual(
    hits.map((h) => `${h.file}:${h.n} ${h.text}`),
    [],
  );
});

test('no tracked text file names a private workspace path', () => {
  const hits = [];
  for (const f of files.filter(isText)) {
    if (f === 'test/public_docs.test.js') continue;
    read(f)
      .split('\n')
      .forEach((text, i) => {
        if (PRIVATE_PATH.test(text)) hits.push({ file: f, n: i + 1, text: text.trim() });
      });
  }
  assert.deepEqual(
    hits.map((h) => `${h.file}:${h.n} ${h.text.slice(0, 100)}`),
    [],
  );
});

test('README and docs/*.md do not refer to the owner in the third person', () => {
  const hits = [];
  for (const f of PUBLIC_DOCS) {
    read(f)
      .split('\n')
      .forEach((text, i) => {
        if (OWNER_REF.test(text)) hits.push(`${f}:${i + 1} ${text.trim().slice(0, 100)}`);
      });
  }
  assert.deepEqual(hits, []);
});
