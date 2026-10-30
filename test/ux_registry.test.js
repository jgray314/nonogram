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
  'pipeline-save-file-round-trip',
  'pipeline-leave-puzzle-saves-time',
];

// Checks added by the line-cap-300 round to close mutation survivors in grid.js
// and library.js (docs/plans/line-cap-300-audit-*.md). Pinned so that deleting
// one cannot go unnoticed: the line-cap-300 verify chains this file.
const LINECAP_IDS = [
  'linecap-grid-ink-colors',
  'linecap-grid-pop-on-new-fill',
  'linecap-grid-clue-done-per-number',
  'linecap-grid-overlay-replace',
  'linecap-grid-wrong-and-highlight-replace',
  'linecap-grid-sweep-stagger',
  'linecap-grid-hover-highlight',
  'linecap-grid-mouse-stroke',
  'linecap-grid-stray-up-ignored',
  'linecap-grid-pointercancel-ends-stroke',
  'linecap-grid-touch-stroke',
  'linecap-grid-pen-stroke',
  'linecap-grid-destroy-removes-window-listeners',
  'linecap-library-forged-import',
  'linecap-library-export-round-trip',
  'linecap-library-import-status',
  'linecap-library-samples-twice',
  'linecap-library-import-solver-failure',
  'linecap-library-import-write-failure',
  'linecap-library-import-toolbar-disabled',
  'linecap-library-import-navigate-away',
  'linecap-library-delete-set-and-guards',
  'linecap-backup-import-write-failure-rerenders',
];

test('ux registry: every line-cap survivor check is registered and not marked known', () => {
  const byId = new Map(CHECKS.map((c) => [c.id, c]));
  for (const id of LINECAP_IDS) {
    assert.ok(byId.has(id), `check ${id} is not in CHECKS`);
    assert.equal(byId.get(id).known, undefined, `${id} is marked known`);
  }
  const extra = CHECKS.filter((c) => c.id.startsWith('linecap-') && !LINECAP_IDS.includes(c.id));
  assert.deepEqual(
    extra.map((c) => c.id),
    [],
    'a linecap check is registered but not pinned here',
  );
});

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
