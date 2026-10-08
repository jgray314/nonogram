import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puzzleId,
  validatePuzzle,
  validateSave,
  validateSet,
  toJSON,
  fromJSON,
} from '../src/format.js';

function makePuzzle(over = {}) {
  return {
    v: 1,
    id: 'x',
    title: 'Test',
    width: 3,
    height: 2,
    palette: [{ name: 'black', hex: '#000000' }],
    solution: [
      [1, 0, 1],
      [0, 1, 0],
    ],
    verdict: { status: 'unique-line-solvable', sweeps: 2 },
    ...over,
  };
}

function makeSave(over = {}) {
  return {
    puzzleId: 'abc',
    cells: [
      [0, -1, 1],
      [0, 0, 0],
    ],
    elapsedMs: 1000,
    rules: {},
    solvedAt: null,
    ...over,
  };
}

function makeSet(over = {}) {
  return { v: 1, setId: 's1', title: 'Set', rows: 1, cols: 2, tileIds: ['a', 'b'], ...over };
}

test('json round-trip', () => {
  for (const rec of [makePuzzle(), makeSave(), makeSet(), makePuzzle({ verdict: null })]) {
    assert.deepEqual(fromJSON(toJSON(rec)), rec);
  }
  assert.throws(() => fromJSON('{nope'));
});

test('validate rejects malformed and wrong-version records', () => {
  assert.deepEqual(validatePuzzle(makePuzzle()), { ok: true });
  assert.deepEqual(validatePuzzle(makePuzzle({ verdict: null })), { ok: true });
  assert.deepEqual(validatePuzzle(makePuzzle({ set: { id: 's', row: 0, col: 1 } })), { ok: true });
  assert.deepEqual(validateSave(makeSave(), makePuzzle()), { ok: true });
  assert.deepEqual(validateSave(makeSave({ solvedAt: 123 }), makePuzzle()), { ok: true });
  assert.deepEqual(validateSet(makeSet()), { ok: true });

  const bad = (r) =>
    assert.equal(r.ok, false, JSON.stringify(r)) || assert.equal(typeof r.error, 'string');

  // null / garbage never throw
  for (const g of [null, undefined, 'str', 42, [], {}]) {
    bad(validatePuzzle(g));
    bad(validateSave(g, makePuzzle()));
    bad(validateSet(g));
  }
  bad(validateSave(makeSave(), null));

  const noTitle = makePuzzle();
  delete noTitle.title;
  bad(validatePuzzle(noTitle));
  bad(validatePuzzle(noTitle));
  bad(validatePuzzle(makePuzzle({ v: 2 })));
  bad(
    validatePuzzle(
      makePuzzle({
        solution: [
          [1, 0, 1],
          [0, 1],
        ],
      }),
    ),
  );
  bad(validatePuzzle(makePuzzle({ solution: [[1, 0, 1]] })));
  bad(
    validatePuzzle(
      makePuzzle({
        solution: [
          [1, 0, 2],
          [0, 1, 0],
        ],
      }),
    ),
  );
  bad(
    validatePuzzle(
      makePuzzle({
        solution: [
          [1, 0, -1],
          [0, 1, 0],
        ],
      }),
    ),
  );
  bad(
    validatePuzzle(
      makePuzzle({
        solution: [
          [1, 0, 0.5],
          [0, 1, 0],
        ],
      }),
    ),
  );
  bad(validatePuzzle(makePuzzle({ palette: [] })));
  bad(validatePuzzle(makePuzzle({ palette: [{ name: 'b', hex: 'black' }] })));
  bad(validatePuzzle(makePuzzle({ verdict: { status: 'bogus', sweeps: 1 } })));
  bad(validatePuzzle(makePuzzle({ verdict: { status: 'multiple', sweeps: -1 } })));
  bad(validatePuzzle(makePuzzle({ set: { id: 's', row: 'a', col: 0 } })));

  // save
  bad(validateSave(makeSave({ puzzleId: undefined }), makePuzzle()));
  bad(validateSave(makeSave({ cells: [[0, 0, 0]] }), makePuzzle()));
  bad(
    validateSave(
      makeSave({
        cells: [
          [0, 0],
          [0, 0],
        ],
      }),
      makePuzzle(),
    ),
  );
  bad(
    validateSave(
      makeSave({
        cells: [
          [0, 0, 0],
          [0, 0],
        ],
      }),
      makePuzzle(),
    ),
  );
  bad(
    validateSave(
      makeSave({
        cells: [
          [0, 0, 2],
          [0, 0, 0],
        ],
      }),
      makePuzzle(),
    ),
  );
  bad(
    validateSave(
      makeSave({
        cells: [
          [0, -2, 0],
          [0, 0, 0],
        ],
      }),
      makePuzzle(),
    ),
  );
  bad(validateSave(makeSave({ elapsedMs: -1 }), makePuzzle()));
  bad(validateSave(makeSave({ rules: null }), makePuzzle()));
  bad(validateSave(makeSave({ rules: [] }), makePuzzle()));
  bad(validateSave(makeSave({ solvedAt: 'now' }), makePuzzle()));

  // set
  bad(validateSet(makeSet({ v: 2 })));
  bad(validateSet(makeSet({ tileIds: ['a'] })));
  bad(validateSet(makeSet({ tileIds: ['a', 3] })));
  bad(validateSet(makeSet({ rows: 0 })));
  bad(validateSet(makeSet({ setId: undefined })));
});

test('id stable across title change', async () => {
  assert.equal(
    await puzzleId(makePuzzle()),
    await puzzleId(makePuzzle({ title: 'Other', id: 'y' })),
  );
  assert.match(await puzzleId(makePuzzle()), /^[0-9a-f]{16}$/);
});

test('id excludes verdict', async () => {
  assert.equal(
    await puzzleId(makePuzzle()),
    await puzzleId(makePuzzle({ verdict: { status: 'multiple', sweeps: 9 } })),
  );
  assert.equal(await puzzleId(makePuzzle()), await puzzleId(makePuzzle({ verdict: null })));
});

test('id changes when a cell changes', async () => {
  const b = makePuzzle({
    solution: [
      [1, 0, 1],
      [0, 1, 1],
    ],
  });
  assert.notEqual(await puzzleId(makePuzzle()), await puzzleId(b));
});

test('id includes set position', async () => {
  const a = makePuzzle({ set: { id: 's', row: 0, col: 0 } });
  const b = makePuzzle({ set: { id: 's', row: 1, col: 0 } });
  assert.notEqual(await puzzleId(a), await puzzleId(b));
  assert.notEqual(await puzzleId(a), await puzzleId(makePuzzle()));
});

test('id independent of key order', async () => {
  const p = makePuzzle({ set: { id: 's', row: 0, col: 1 } });
  const shuffled = {
    set: { col: 1, row: 0, id: 's' },
    solution: p.solution,
    palette: [{ hex: '#000000', name: 'black' }],
    height: 2,
    width: 3,
    title: 'x',
  };
  assert.equal(await puzzleId(p), await puzzleId(shuffled));
  // hex case does not matter
  assert.equal(
    await puzzleId(makePuzzle({ palette: [{ name: 'b', hex: '#ABCDEF' }] })),
    await puzzleId(makePuzzle({ palette: [{ name: 'c', hex: '#abcdef' }] })),
  );
});
