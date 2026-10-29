// The headless UX runner exits 0 whenever nothing fails and at least one check
// passes, so deleting a check file or dropping its registration goes unnoticed.
// This pins the end-to-end pipeline checks by id, in the fast suite, and is
// chained into their FEATURES.json verify commands.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CHECKS } from './ux/checks.js';

const PIPELINE_IDS = [
  'pipeline-mono-upload-to-library',
  'pipeline-color-upload-to-library',
  'pipeline-backup-round-trip',
  'pipeline-webpbn-export',
];

test('ux registry: every end-to-end pipeline check is registered', () => {
  const ids = CHECKS.map((c) => c.id);
  for (const id of PIPELINE_IDS) assert.ok(ids.includes(id), `check ${id} is not in CHECKS`);
});

test('ux registry: check ids are unique and no pipeline check is marked known', () => {
  const ids = CHECKS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate check id');
  for (const c of CHECKS.filter((c) => c.id.startsWith('pipeline-'))) {
    assert.equal(c.known, undefined, `${c.id} is marked known, so its failure would not count`);
  }
});
