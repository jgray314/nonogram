import { test } from 'node:test';
import assert from 'node:assert/strict';
import { difficultyLabel, isFair } from '../src/difficulty.js';

test('difficulty label from the persona tier (D23)', () => {
  const v = (tier, status = 'unique-line-solvable') => ({ status, sweeps: 2, tier });
  assert.equal(difficultyLabel(null), 'Unchecked');
  assert.equal(difficultyLabel(v('newcomer')), 'Easy');
  assert.equal(difficultyLabel(v('casual')), 'Medium');
  assert.equal(difficultyLabel(v('regular')), 'Hard');
  assert.equal(difficultyLabel(v('expert', 'unique-needs-guessing')), 'Very hard');
  assert.equal(difficultyLabel(v('guess', 'unique-needs-guessing')), 'Very hard');
  for (const status of ['multiple', 'none', 'unknown']) {
    assert.equal(difficultyLabel({ status, sweeps: 1 }), 'Not fair');
  }
});

test('a grid 20 or more on a side steps Easy and Medium up one, nothing else', () => {
  const v = (tier, status = 'unique-line-solvable') => ({ status, sweeps: 2, tier });
  const big = { width: 20, height: 20 };
  const wide = { width: 25, height: 10 };
  const under = { width: 19, height: 19 };
  assert.equal(difficultyLabel(v('newcomer'), big), 'Medium');
  assert.equal(difficultyLabel(v('casual'), wide), 'Hard');
  assert.equal(difficultyLabel(v('regular'), big), 'Hard');
  assert.equal(difficultyLabel(v('expert', 'unique-needs-guessing'), big), 'Very hard');
  assert.equal(difficultyLabel(v('newcomer'), under), 'Easy');
  assert.equal(difficultyLabel({ status: 'multiple', sweeps: 1 }, big), 'Not fair');
  assert.equal(difficultyLabel(null, big), 'Unchecked');
});

test('no tier: needs-guessing is Very hard, line-solvable falls back to Medium', () => {
  assert.equal(difficultyLabel({ status: 'unique-needs-guessing', sweeps: 2 }), 'Very hard');
  assert.equal(difficultyLabel({ status: 'unique-line-solvable', sweeps: 1 }), 'Medium');
});

test('a tier that contradicts the status is ignored (gate pass 4, L1)', () => {
  // A hand-edited import: a needs-guessing puzzle claiming the Newcomer tier.
  assert.equal(
    difficultyLabel({ status: 'unique-needs-guessing', sweeps: 1, tier: 'newcomer' }),
    'Very hard',
  );
  assert.equal(
    difficultyLabel({ status: 'unique-line-solvable', sweeps: 1, tier: 'guess' }),
    'Medium',
  );
});

test('only unique verdicts are fair', () => {
  assert.equal(isFair(null), false);
  assert.equal(isFair({ status: 'unique-line-solvable', sweeps: 1 }), true);
  assert.equal(isFair({ status: 'unique-needs-guessing', sweeps: 1 }), true);
  assert.equal(isFair({ status: 'unknown', sweeps: 1 }), false);
});
