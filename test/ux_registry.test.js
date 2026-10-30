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

// The pin checks (test/ux/pins-*.js) pin grid.js and library.js behavior that the
// line-cap-300 mutation audits found unchecked (docs/plans/line-cap-300-audit-*.md).
// Listed by id so that deleting one cannot go unnoticed: the line-cap-300 verify
// chains this file.
const PIN_IDS = [
  'pin-grid-ink-colors',
  'pin-grid-pop-on-new-fill',
  'pin-grid-clue-done-per-number',
  'pin-grid-overlay-replace',
  'pin-grid-wrong-and-highlight-replace',
  'pin-grid-sweep-stagger',
  'pin-grid-hover-highlight',
  'pin-grid-mouse-stroke',
  'pin-grid-stray-up-ignored',
  'pin-grid-pointercancel-ends-stroke',
  'pin-grid-touch-stroke',
  'pin-grid-pen-stroke',
  'pin-grid-destroy-removes-window-listeners',
  'pin-library-forged-import',
  'pin-library-export-round-trip',
  'pin-library-import-status',
  'pin-library-samples-twice',
  'pin-library-import-solver-failure',
  'pin-library-import-write-failure',
  'pin-library-import-toolbar-disabled',
  'pin-library-import-navigate-away',
  'pin-library-delete-set-and-guards',
  'pin-backup-import-write-failure-rerenders',
  'pin-sets-delete-puzzle-rerenders',
  'pin-sets-complete-mosaic-size',
];

test('ux registry: every pin check is registered and not marked known', () => {
  const byId = new Map(CHECKS.map((c) => [c.id, c]));
  for (const id of PIN_IDS) {
    assert.ok(byId.has(id), `check ${id} is not in CHECKS`);
    assert.equal(byId.get(id).known, undefined, `${id} is marked known`);
  }
  const extra = CHECKS.filter((c) => c.id.startsWith('pin-') && !PIN_IDS.includes(c.id));
  assert.deepEqual(
    extra.map((c) => c.id),
    [],
    'a pin- check is registered but not listed in PIN_IDS',
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
