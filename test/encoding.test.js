// Tracked text must be clean UTF-8 with LF line endings. Text written through a
// shell has been corrupted into mojibake (UTF-8 bytes shown as Windows-1252, so
// an em dash becomes "a-circumflex, euro, quote") in two sibling projects; this
// is the mechanical check. Line endings are checked on what git stores, not on
// the working copy: npm and editors on Windows write CRLF there, and
// .gitattributes normalizes it on add. The patterns are written as escapes so this file is
// itself plain ASCII and cannot trip its own scan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cp = (n) => String.fromCodePoint(n);
const ROOT = fileURLToPath(new URL('../', import.meta.url));

// A UTF-8 lead character (A-tilde, A-circumflex, a-circumflex) read as
// Windows-1252, followed by what its continuation bytes decode to there.
const CP1252_TAIL =
  '\\u0080-\\u00bf\\u20ac\\u201a\\u0192\\u201e\\u2026\\u2020\\u2021\\u02c6\\u2030\\u0160\\u2039' +
  '\\u0152\\u017d\\u2018\\u2019\\u201c\\u201d\\u2022\\u2013\\u2014\\u02dc\\u2122\\u0161\\u203a' +
  '\\u0153\\u017e\\u0178';
const MOJIBAKE = new RegExp(`[\\u00c3\\u00c2\\u00e2][${CP1252_TAIL}]`);
const REPLACEMENT_CHAR = new RegExp('\ufffd');
const BOM = new RegExp('^\ufeff');

/** Names of the problems found in decoded `text`, empty when it is clean. */
export function encodingProblems(text) {
  const out = [];
  if (BOM.test(text)) out.push('byte order mark');
  if (REPLACEMENT_CHAR.test(text)) out.push('replacement character');
  if (MOJIBAKE.test(text)) out.push('mojibake sequence');
  return out;
}

const TEXT_EXT = /\.(?:json|md|js|mjs|css|html|yml|yaml|py|txt)$/;
const RECORDING_DIR = /(?:^|\/)(?:recordings?|fixtures?|cassettes?)\//;

function trackedFiles() {
  const r = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split('\n');
  // Not a git checkout (an exported copy): walk the tree instead.
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(ROOT + dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel);
      else out.push(rel);
    }
  };
  walk('');
  return out;
}

const scanned = trackedFiles().filter((f) => TEXT_EXT.test(f) || RECORDING_DIR.test(f));

test('the scan covers JSON, Markdown and source files', () => {
  for (const ext of ['.json', '.md', '.js']) {
    assert.ok(
      scanned.some((f) => f.endsWith(ext)),
      `no ${ext} file scanned`,
    );
  }
});

test('the detector flags a UTF-8 em dash and an accented letter read as Windows-1252', () => {
  const garbledDash = Buffer.from(cp(0x2014), 'utf8').toString('latin1');
  assert.deepEqual(encodingProblems(`a ${garbledDash} b`), ['mojibake sequence']);
  const garbledE = new TextDecoder('windows-1252').decode(Buffer.from(`caf${cp(0xe9)}`, 'utf8'));
  assert.deepEqual(encodingProblems(garbledE), ['mojibake sequence']);
});

test('the detector flags a byte order mark and a replacement character', () => {
  assert.deepEqual(encodingProblems(`${cp(0xfeff)}x`), ['byte order mark']);
  assert.deepEqual(encodingProblems(`x${cp(0xfffd)}y`), ['replacement character']);
});

test('the detector passes real UTF-8 punctuation and accents', () => {
  assert.deepEqual(
    encodingProblems(
      `caf${cp(0xe9)} ${cp(0x2014)} ${cp(0x201c)}q${cp(0x201d)} ${cp(0x2026)} ${cp(0xc3)}A`,
    ),
    [],
  );
});

test('every tracked text file decodes as UTF-8 and has none of those problems', () => {
  const found = [];
  const strict = new TextDecoder('utf-8', { fatal: true });
  for (const f of scanned) {
    let text;
    try {
      text = strict.decode(readFileSync(ROOT + f));
    } catch {
      found.push(`${f}: not valid UTF-8`);
      continue;
    }
    for (const p of encodingProblems(text)) found.push(`${f}: ${p}`);
  }
  assert.deepEqual(found, []);
});

test('.gitattributes pins text files to LF line endings', () => {
  const rules = readFileSync(`${ROOT}.gitattributes`, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const star = rules.find((l) => l.startsWith('* '));
  assert.ok(star, 'no "*" rule');
  const attrs = star.split(/\s+/).slice(1);
  assert.ok(attrs.includes('text=auto') || attrs.includes('text'), 'text not enabled');
  assert.ok(attrs.includes('eol=lf'), 'eol=lf missing');
});

test('no tracked text file is stored with CRLF or mixed line endings', () => {
  const r = spawnSync('git', ['ls-files', '--eol'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return; // not a git checkout: nothing is stored
  const bad = r.stdout
    .split('\n')
    .filter((l) => /^i\/(?:crlf|mixed)\s/.test(l))
    .map((l) => l.split('\t')[1]);
  assert.deepEqual(bad, []);
});
