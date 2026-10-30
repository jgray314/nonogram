// scripts/verify-files.mjs must fail when a file named in a verify command is
// missing, because `node --test <missing path>` exits 0 (AGENTS rule 10). The
// tool is run against a throwaway ledger and tree, never the real ones.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/verify-files.mjs', import.meta.url));

/** @param {string[]} present files that exist in the fake tree */
function run(present, verify, id = 'f1') {
  const root = mkdtempSync(join(tmpdir(), 'nng-vf-'));
  try {
    mkdirSync(join(root, 'test'));
    mkdirSync(join(root, 'scripts'));
    for (const p of present) writeFileSync(join(root, p), '');
    const ledger = join(root, 'ledger.json');
    writeFileSync(ledger, JSON.stringify({ features: [{ id: 'f1', verify }] }));
    return spawnSync(process.execPath, [script, id, '--ledger', ledger, '--root', root], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const VERIFY = 'node --test test/a.test.js test/b.test.js && node scripts/x.mjs && npm run lint';

test('verify-files: passes when every named file exists', () => {
  const r = run(['test/a.test.js', 'test/b.test.js', 'scripts/x.mjs'], VERIFY);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /3 files/);
});

test('verify-files: fails and names a deleted test file', () => {
  const r = run(['test/a.test.js', 'scripts/x.mjs'], VERIFY);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /test\/b\.test\.js/);
});

test('verify-files: fails on a deleted script too', () => {
  const r = run(['test/a.test.js', 'test/b.test.js'], VERIFY);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /scripts\/x\.mjs/);
});

test('verify-files: an unknown feature id is an error, not a pass', () => {
  const r = run([], VERIFY, 'nope');
  assert.equal(r.status, 2);
});
