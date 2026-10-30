// Pins format.js, format-keys.js and format-art.js limits and parsing that no
// other test covered, found by mutating the code before it was split
// (docs/plans/line-cap-300-audit-format.md).
//
// Limits below are written as literals, not read from the exported MAX_*
// constants: a test that reads the constant moves with it, so loosening the
// constant by one would still pass (that is how the five text and count bounds survived).
//
// Survivor accepted in writing:
//   jpegSize, `length < 2` guard removed: equivalent in effect. A segment
//   length below 2 has a zero high byte, so without the guard the scan lands on
//   the length bytes themselves (0x00 or 0x01), and the next loop turn returns
//   null because that byte is not 0xFF. No input can tell the two apart. The
//   length 0 and 1 cases are still pinned below (they return null) so a
//   different regression there is caught, but the guard itself cannot be killed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  idMatches,
  jpegSize,
  puzzleId,
  validatePuzzle,
  validateSave,
  validateSet,
} from '../src/format.js';

const PREFIX = 'data:image/jpeg;base64,';

function puzzle(over = {}) {
  return {
    v: 1,
    id: 'abc',
    title: 'T',
    width: 2,
    height: 2,
    palette: [{ name: 'black', hex: '#000000' }],
    solution: [
      [1, 0],
      [0, 1],
    ],
    verdict: null,
    ...over,
  };
}

function set(over = {}) {
  return { v: 1, setId: 's', title: 'T', rows: 1, cols: 2, tileIds: ['a', 'b'], ...over };
}

const str = (n) => 'x'.repeat(n);
const artOfLength = (n) => PREFIX + 'A'.repeat(n - PREFIX.length);

// [what, build a record with a value of length/size n, validator, limit]
/** @type {[string, (n: number) => any, (x: any) => { ok: boolean }, number][]} */
const LIMITS = [
  ['art chars', (n) => puzzle({ art: artOfLength(n) }), validatePuzzle, 200000],
  ['puzzle title chars', (n) => puzzle({ title: str(n) }), validatePuzzle, 500],
  ['set title chars', (n) => set({ title: str(n) }), validateSet, 500],
  [
    'palette name chars',
    (n) => puzzle({ palette: [{ name: str(n), hex: '#000000' }] }),
    validatePuzzle,
    100,
  ],
  [
    'puzzle.set.id chars',
    (n) => puzzle({ set: { id: str(n), row: 0, col: 0 } }),
    validatePuzzle,
    200,
  ],
  ['setId chars', (n) => set({ setId: str(n) }), validateSet, 200],
  ['puzzle id chars', (n) => puzzle({ id: str(n) }), validatePuzzle, 200],
  ['tile id chars', (n) => set({ tileIds: [str(n), 'b'] }), validateSet, 200],
  [
    'verdict sweeps',
    (n) => puzzle({ verdict: { status: 'multiple', sweeps: n } }),
    validatePuzzle,
    1000000,
  ],
];

for (const [what, build, validate, limit] of LIMITS) {
  test(`limit: ${what} accepted at ${limit}, refused at ${limit + 1}`, () => {
    assert.equal(validate(build(limit)).ok, true, `at ${limit}`);
    assert.equal(validate(build(limit + 1)).ok, false, `at ${limit + 1}`);
  });
}

test('limit: save puzzleId accepted at 200 chars, refused at 201', () => {
  const p = puzzle();
  const save = (n) => ({
    puzzleId: str(n),
    cells: [
      [0, 0],
      [0, 0],
    ],
    elapsedMs: 0,
    rules: {},
    solvedAt: null,
  });
  assert.equal(validateSave(save(200), p).ok, true);
  assert.equal(validateSave(save(201), p).ok, false);
});

test('limit: verdict sweeps of 0 is accepted and -1 is refused', () => {
  assert.equal(validatePuzzle(puzzle({ verdict: { status: 'none', sweeps: 0 } })).ok, true);
  assert.equal(validatePuzzle(puzzle({ verdict: { status: 'none', sweeps: -1 } })).ok, false);
});

// ---- idMatches ----

test('idMatches is false, not a throw, when puzzleId throws', async () => {
  assert.equal(await idMatches({}), false);
  assert.equal(
    await idMatches({ id: 'x', palette: null, width: 1, height: 1, solution: [[1]] }),
    false,
  );
});

test('idMatches is true for the hash of the content and false for any other id', async () => {
  const p = puzzle();
  p.id = await puzzleId(p);
  assert.equal(await idMatches(p), true);
  assert.equal(await idMatches({ ...p, id: '0000000000000000' }), false);
});

// ---- jpegSize on hand-built files ----

const b64 = (bytes) => PREFIX + Buffer.from(bytes).toString('base64');
const SOI = [0xff, 0xd8];
// A frame header: marker, length, precision 8, height, width, then padding up to the declared length.
function sof(marker, length, height, width) {
  const head = [
    0xff,
    marker,
    length >> 8,
    length & 255,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
  ];
  const pad = Math.max(0, length + 2 - head.length);
  return head.concat(new Array(pad).fill(0));
}

test('jpegSize reads a plain frame header (width and height not swapped)', () => {
  assert.deepEqual(jpegSize(b64([...SOI, ...sof(0xc0, 11, 100, 200)])), {
    width: 200,
    height: 100,
  });
  // The smallest legal header length, 8, is accepted.
  assert.deepEqual(jpegSize(b64([...SOI, ...sof(0xc0, 8, 3, 5), 0, 0, 0, 0])), {
    width: 5,
    height: 3,
  });
});

test('jpegSize skips a DAC (0xCC) segment: it is not a frame header', () => {
  // The DAC is long enough that, read as a frame, it would report 16 x 16.
  const dac = [0xff, 0xcc, 0x00, 0x0a, 0x00, 0x00, 0x10, 0x00, 0x10, 0x00, 0x00, 0x00];
  const real = sof(0xc0, 11, 100, 200);
  assert.deepEqual(jpegSize(b64([...SOI, ...dac, ...real])), { width: 200, height: 100 });
  // With no real frame after it, the DAC alone yields null, not a size.
  assert.equal(jpegSize(b64([...SOI, ...dac, 0xff, 0xd9, 0, 0])), null);
});

test('jpegSize refuses a frame header of declared length 7', () => {
  assert.equal(jpegSize(b64([...SOI, 0xff, 0xc0, 0x00, 0x07, 8, 0, 16, 0, 16, 0, 0, 0])), null);
});

test('jpegSize returns null for a segment length of 0 or 1 before the frame', () => {
  for (const len of [0, 1]) {
    const bytes = [...SOI, 0xff, 0xe0, 0x00, len, ...sof(0xc0, 11, 100, 200)];
    assert.equal(jpegSize(b64(bytes)), null, `length ${len}`);
  }
});

test('jpegSize returns null for a zero dimension, a non-JPEG and a non-string', () => {
  assert.equal(jpegSize(b64([...SOI, ...sof(0xc0, 11, 0, 200)])), null);
  assert.equal(jpegSize(b64([0x89, 0x50, 0x4e, 0x47, 0, 0])), null);
  assert.equal(jpegSize(undefined), null);
  assert.equal(jpegSize('data:image/png;base64,AAAA'), null);
});
