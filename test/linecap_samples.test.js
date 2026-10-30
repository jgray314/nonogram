// Closes the mutation survivors of src/samples.js listed in
// docs/plans/line-cap-300-audit-samples.md (S06-S25, S29, S37, S45), ahead of splitting the file.
//
// The ids are the first 16 hex digits of the SHA-256 of each record's canonical form, which holds
// the title, size, palette (names and hexes) and every cell of the solution. One flipped cell, a
// changed ink hex or a changed palette order changes the id, so the id table below pins all the
// sample art. The literals were taken once from the current code. The blank hex is not in the id
// (D29) and has its own table.
//
// Accepted survivors (no test, one reason each):
// - S34: every sample is square, so swapping width and height cannot be seen; the size table below
//   still pins both numbers per sample.
// - S35: the initial `verdict: null` is overwritten before the record is returned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorSamplePuzzles, loadSamples, samplePuzzles } from '../src/samples.js';

// title -> [id, size, status, sweeps]
const TWO_TONE = [
  ['AI test sample: Plus (5x5)', '894b0f623c1ef58f', 5, 1],
  ['AI test sample: Castle (10x10)', 'fb5b17c9b4b21235', 10, 1],
  ['AI test sample: Heart (5x5)', '474c89e11d7bbf75', 5, 2],
  ['AI test sample: House (10x10)', '1b0db345f819493c', 10, 2],
  ['AI test sample: Smiley (15x15)', 'e3882ad6f169cb6f', 15, 2],
  ['AI test sample: Cat (10x10)', '8e43ea2c9751b5d6', 10, 2],
  ['AI test sample: Cat (15x15)', 'b3705f906cba7c7a', 15, 2],
  ['AI test sample: Cat (20x20)', '5e147981bc5a4d6e', 20, 2],
  ['AI test sample: Cat (25x25)', '4d45f100011aec60', 25, 5],
  ['AI test sample: Banana (10x10)', 'f604c8364fbb4cda', 10, 4],
  ['AI test sample: Spider (20x20)', '99c9ab4b3451e0d8', 20, 4],
];
// title -> [id, size, sweeps, blank hex, ink names]
const COLOR = [
  [
    'AI test sample: Strawberry (10x10)',
    '39b9964cc34b9524',
    10,
    2,
    '#fdf1dc',
    ['red', 'green', 'yellow'],
  ],
  [
    'AI test sample: Mushroom (10x10)',
    '57ecc87ea0308dac',
    10,
    2,
    '#1f2f4f',
    ['red', 'cream', 'tan', 'green'],
  ],
  [
    'AI test sample: Flower (15x15)',
    '773442de3f197add',
    15,
    6,
    '#cde8f6',
    ['pink', 'yellow', 'green', 'brown'],
  ],
];

test('two-tone samples: ids, sizes, black ink and verdict sweeps (S06, S07, S37)', async () => {
  const got = await samplePuzzles();
  assert.deepEqual(
    got.map((p) => p.title),
    TWO_TONE.map((t) => t[0]),
  );
  assert.deepEqual(
    got.map((p) => p.id),
    TWO_TONE.map((t) => t[1]),
  );
  got.forEach((p, i) => {
    assert.equal(p.width, TWO_TONE[i][2], p.title);
    assert.equal(p.height, TWO_TONE[i][2], p.title);
    assert.deepEqual(p.palette, [{ name: 'black', hex: '#000000' }], p.title);
    assert.equal(p.verdict.status, 'unique-line-solvable', p.title);
    assert.equal(p.verdict.sweeps, TWO_TONE[i][3], p.title);
    assert.ok(p.verdict.sweeps >= 1, p.title);
  });
});

test('color samples: ids, sizes, ink names, blank hex and verdict sweeps (S15-S25, S29, S37)', async () => {
  const got = await colorSamplePuzzles();
  assert.deepEqual(
    got.map((p) => p.title),
    COLOR.map((t) => t[0]),
  );
  assert.deepEqual(
    got.map((p) => p.id),
    COLOR.map((t) => t[1]),
  );
  got.forEach((p, i) => {
    assert.equal(p.width, COLOR[i][2], p.title);
    assert.equal(p.height, COLOR[i][2], p.title);
    assert.equal(p.blank, COLOR[i][4], `${p.title}: blank`);
    assert.deepEqual(
      p.palette.map((x) => x.name),
      COLOR[i][5],
      `${p.title}: ink names`,
    );
    assert.equal(p.verdict.status, 'unique-line-solvable', p.title);
    assert.equal(p.verdict.sweeps, COLOR[i][3], p.title);
    assert.ok(p.verdict.sweeps >= 1, p.title);
  });
});

test('color sample ids do not depend on the blank color (D29)', async () => {
  const [first] = await colorSamplePuzzles();
  assert.equal(first.id, '39b9964cc34b9524');
  assert.equal(first.blank, '#fdf1dc');
});

/** A store that records the order of its puts. */
function fakeStore(existing = []) {
  const rows = new Map(existing.map((p) => [p.id, p]));
  const puts = [];
  return {
    puts,
    rows,
    get: (kind, id) => (kind === 'puzzle' ? rows.get(id) : undefined),
    put: (kind, record) => {
      assert.equal(kind, 'puzzle');
      rows.set(record.id, record);
      puts.push(record.title);
    },
  };
}

test('loadSamples puts the two-tone samples first, then the color ones (S45)', async () => {
  const store = fakeStore();
  assert.deepEqual(await loadSamples(store), { added: 14, skipped: 0 });
  assert.deepEqual(store.puts, [...TWO_TONE.map((t) => t[0]), ...COLOR.map((t) => t[0])]);
  assert.deepEqual(await loadSamples(store), { added: 0, skipped: 14 });
  assert.equal(store.puts.length, 14, 'nothing is put twice');
});

test('loadSamples skips a sample that is already stored and adds the rest', async () => {
  const [plus] = await samplePuzzles();
  const store = fakeStore([plus]);
  assert.deepEqual(await loadSamples(store), { added: 13, skipped: 1 });
  assert.ok(!store.puts.includes(plus.title));
});
