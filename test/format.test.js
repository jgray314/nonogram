import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puzzleId,
  idMatches,
  pickKnown,
  jpegSize,
  MAX_ART_SIDE,
  validatePuzzle,
  validateSave,
  validateSet,
  toJSON,
  fromJSON,
  ART_PREFIX,
  MAX_ART_CHARS,
  MAX_TITLE_CHARS,
  MAX_NAME_CHARS,
  MAX_SET_ID_CHARS,
  MAX_SWEEPS,
} from '../src/format.js';
import { jpegHeader } from './jpeg-fixture.js';
import { MAX_HEARTS } from '../src/game.js';

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

test('validate bounds tile set position and set size (gate H1)', () => {
  const base = {
    v: 1,
    id: 'p',
    title: 't',
    width: 1,
    height: 1,
    palette: [{ name: 'black', hex: '#000000' }],
    solution: [[1]],
    verdict: null,
  };
  assert.equal(validatePuzzle({ ...base, set: { id: 's', row: 3, col: 3 } }).ok, true);
  assert.equal(validatePuzzle({ ...base, set: { id: 's', row: 4, col: 0 } }).ok, false);
  assert.equal(validatePuzzle({ ...base, set: { id: 's', row: 100000, col: 100000 } }).ok, false);
  const set = {
    v: 1,
    setId: 's',
    title: 't',
    rows: 5,
    cols: 1,
    tileIds: ['a', 'b', 'c', 'd', 'e'],
  };
  assert.equal(validateSet(set).ok, false);
});

test('validate rejects empty ids (gate M2)', () => {
  const base = {
    v: 1,
    id: '',
    title: 't',
    width: 1,
    height: 1,
    palette: [{ name: 'black', hex: '#000000' }],
    solution: [[1]],
    verdict: null,
  };
  assert.equal(validatePuzzle(base).ok, false);
  assert.equal(
    validateSet({ v: 1, setId: '', title: 't', rows: 1, cols: 1, tileIds: ['a'] }).ok,
    false,
  );
});

test('idMatches rejects a forged id (gate M3)', async () => {
  const p = makePuzzle();
  p.id = await puzzleId(p);
  assert.equal(await idMatches(p), true);
  assert.equal(
    await idMatches({ ...p, solution: p.solution.map((r) => r.map((v) => 1 - v)) }),
    false,
  );
  assert.equal(await idMatches({ ...p, id: 'demo' }), false);
});

test('validate bounds grid size and palette length (gate H1 shape sweep)', () => {
  const ok = makePuzzle();
  assert.equal(validatePuzzle(ok).ok, true);
  const wide = 26;
  const big = { ...ok, width: wide, height: 1, solution: [Array(wide).fill(0)] };
  assert.equal(validatePuzzle(big).ok, false);
  const palette = Array.from({ length: 31 }, (_, i) => ({ name: `c${i}`, hex: '#000000' }));
  assert.equal(validatePuzzle({ ...ok, palette }).ok, false);
});

test('v1 save without hearts is valid', () => {
  const save = makeSave();
  assert.equal('hearts' in save, false);
  assert.deepEqual(validateSave(save, makePuzzle()), { ok: true });
});

test('hearts from 0 to MAX_HEARTS and a boolean zen are valid', () => {
  assert.deepEqual(validateSave(makeSave({ hearts: 0 }), makePuzzle()), { ok: true });
  assert.deepEqual(validateSave(makeSave({ hearts: MAX_HEARTS }), makePuzzle()), { ok: true });
  assert.deepEqual(validateSave(makeSave({ rules: { zen: true } }), makePuzzle()), { ok: true });
});

test('hearts above MAX_HEARTS rejected', () => {
  assert.equal(validateSave(makeSave({ hearts: MAX_HEARTS + 1 }), makePuzzle()).ok, false);
});

test('negative or fractional hearts rejected', () => {
  for (const hearts of [-1, 1.5, NaN, '2', null]) {
    assert.equal(validateSave(makeSave({ hearts }), makePuzzle()).ok, false, String(hearts));
  }
});

test('art is optional and excluded from the id', async () => {
  const plain = makePuzzle();
  const withArt = makePuzzle({ art: ART_PREFIX + 'AAAA' });
  assert.deepEqual(validatePuzzle(plain), { ok: true });
  assert.deepEqual(validatePuzzle(withArt), { ok: true });
  assert.equal(await puzzleId(withArt), await puzzleId(plain));
});

test('art over the bound, or not a JPEG data URL, rejected', () => {
  const bad = [ART_PREFIX + 'A'.repeat(MAX_ART_CHARS), 'data:image/png;base64,AAAA', 42, null];
  for (const art of bad) {
    assert.equal(validatePuzzle(makePuzzle({ art })).ok, false, String(art).slice(0, 30));
  }
});

test('art at exactly the bound is valid, one character over is not', () => {
  const at = ART_PREFIX + 'A'.repeat(MAX_ART_CHARS - ART_PREFIX.length);
  assert.equal(at.length, MAX_ART_CHARS);
  assert.deepEqual(validatePuzzle(makePuzzle({ art: at })), { ok: true });
  assert.equal(validatePuzzle(makePuzzle({ art: at + 'A' })).ok, false);
});

test('over-long title, palette name, set id or sweeps rejected (gate pass 3, L2)', () => {
  const long = (n) => 'x'.repeat(n + 1);
  const bad = [
    { title: long(MAX_TITLE_CHARS) },
    { palette: [{ name: long(MAX_NAME_CHARS), hex: '#000000' }] },
    { set: { id: long(MAX_SET_ID_CHARS), row: 0, col: 0 } },
    { verdict: { status: 'unique-line-solvable', sweeps: MAX_SWEEPS + 1 } },
  ];
  for (const over of bad) {
    assert.equal(validatePuzzle(makePuzzle(over)).ok, false, Object.keys(over)[0]);
  }
  assert.deepEqual(validatePuzzle(makePuzzle({ title: 'x'.repeat(MAX_TITLE_CHARS) })), {
    ok: true,
  });
});

test('hints from 0 to the cell count are valid, missing means 0', () => {
  assert.deepEqual(validateSave(makeSave(), makePuzzle()), { ok: true });
  assert.deepEqual(validateSave(makeSave({ hints: 0 }), makePuzzle()), { ok: true });
  assert.deepEqual(validateSave(makeSave({ hints: 6 }), makePuzzle()), { ok: true });
});

test('hints above the cell count, negative or fractional, rejected', () => {
  for (const hints of [7, -1, 1.5, '2', null, 1e9]) {
    assert.equal(validateSave(makeSave({ hints }), makePuzzle()).ok, false, String(hints));
  }
});

test('non-boolean zen rejected', () => {
  for (const zen of [1, 'true', null]) {
    assert.equal(validateSave(makeSave({ rules: { zen } }), makePuzzle()).ok, false, String(zen));
  }
});

test('pickKnown drops unknown keys', () => {
  const p = makePuzzle({ extra: 'x' });
  assert.deepEqual(pickKnown('puzzle', p), makePuzzle());
  assert.deepEqual(pickKnown('save', { ...makeSave(), note: 'hi' }), makeSave());
  const set = { v: 1, setId: 's', title: 'S', rows: 1, cols: 1, tileIds: ['a'] };
  assert.deepEqual(pickKnown('set', { ...set, junk: [1] }), set);
});

test('pickKnown keeps optional keys that are present', () => {
  const full = makePuzzle({
    set: { id: 's', row: 0, col: 1 },
    art: `${ART_PREFIX}AAAA`,
  });
  assert.deepEqual(pickKnown('puzzle', full), full);
  assert.equal('set' in pickKnown('puzzle', makePuzzle()), false);
  assert.equal('art' in pickKnown('puzzle', makePuzzle()), false);
  const save = makeSave({ hearts: 2, hints: 1 });
  assert.deepEqual(pickKnown('save', save), save);
  assert.equal('hearts' in pickKnown('save', makeSave()), false);
});

test('pickKnown drops unknown keys inside palette entries, set and rules', () => {
  const p = pickKnown(
    'puzzle',
    makePuzzle({
      palette: [{ name: 'black', hex: '#000000', junk: 1 }],
      set: { id: 's', row: 0, col: 1, junk: 2 },
    }),
  );
  assert.deepEqual(p.palette, [{ name: 'black', hex: '#000000' }]);
  assert.deepEqual(p.set, { id: 's', row: 0, col: 1 });
  const s = pickKnown('save', makeSave({ rules: { zen: true, autoCross: false, junk: 3 } }));
  assert.deepEqual(s.rules, { zen: true, autoCross: false });
  // Absent optional rule keys stay absent.
  assert.deepEqual(pickKnown('save', makeSave({ rules: { junk: 1 } })).rules, {});
  // The verdict is left alone: imports replace it.
  const v = { status: 'multiple', sweeps: 1, extra: 1 };
  assert.deepEqual(pickKnown('puzzle', makePuzzle({ verdict: v })).verdict, v);
});

test('jpegSize reads SOF dimensions', () => {
  assert.deepEqual(jpegSize(jpegHeader(320, 200)), { width: 320, height: 200 });
  assert.deepEqual(jpegSize(jpegHeader(7, 9000, 0xc2)), { width: 7, height: 9000 });
  assert.equal(MAX_ART_SIDE, 320);
});

test('jpegSize returns null for non-JPEG', () => {
  assert.equal(jpegSize('data:image/png;base64,AAAA'), null);
  assert.equal(jpegSize(`${ART_PREFIX}AAAA`), null);
  assert.equal(jpegSize(`${ART_PREFIX}not base64!!`), null);
  assert.equal(jpegSize(`${ART_PREFIX}`), null);
  assert.equal(jpegSize(undefined), null);
  // Starts as a JPEG but ends before any frame header.
  assert.equal(
    jpegSize(ART_PREFIX + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')),
    null,
  );
  // A DHT (C4) is not a frame header.
  assert.equal(jpegSize(jpegHeader(10, 10, 0xc4)), null);
});
