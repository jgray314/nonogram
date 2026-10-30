// Closes the mulberry32 survivor left by the line-cap-300 round (swapping the two
// `t` updates changed the random stream but no colour test noticed): the stream is
// compared with a reference written differently, in BigInt arithmetic mod 2^32.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../src/color-space.js';

const M = 1n << 32n;
/**
 * @param {bigint} a
 * @param {bigint} b
 */
const mul = (a, b) => (a * b) % M;

/** @param {number} seed */
function reference(seed) {
  let a = BigInt(seed) % M;
  return () => {
    a = (a + 0x6d2b79f5n) % M;
    let t = a;
    t = mul(t ^ (t >> 15n), t | 1n);
    t = (t ^ ((t + mul(t ^ (t >> 7n), t | 61n)) % M)) % M;
    return Number((t ^ (t >> 14n)) % M) / 4294967296;
  };
}

test('mulberry32: the stream matches an independent BigInt reference', () => {
  for (const seed of [0, 1, 2, 12345, 4294967295]) {
    const got = mulberry32(seed);
    const want = reference(seed);
    for (let i = 0; i < 20; i++) assert.equal(got(), want(), `seed ${seed}, draw ${i}`);
  }
});

test('mulberry32: values are in [0, 1) and the seed is taken mod 2^32', () => {
  const draw = mulberry32(7);
  for (let i = 0; i < 100; i++) {
    const v = draw();
    assert.ok(v >= 0 && v < 1, `draw ${i} = ${v}`);
  }
  assert.equal(mulberry32(5)(), mulberry32(5 + 2 ** 32)());
});
