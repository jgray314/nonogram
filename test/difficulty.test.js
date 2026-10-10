import { test } from 'node:test';
import assert from 'node:assert/strict';
import { difficultyLabel, isFair } from '../src/difficulty.js';

test('difficulty label from the persona tier', () => {
  const v = (tier, status = 'unique-line-solvable') => ({ status, sweeps: 2, tier });
  assert.equal(difficultyLabel(null), 'Unchecked');
  assert.equal(difficultyLabel(v('newcomer')), 'Easy');
  assert.equal(difficultyLabel(v('casual')), 'Easy');
  assert.equal(difficultyLabel(v('regular')), 'Medium');
  assert.equal(difficultyLabel(v('expert', 'unique-needs-guessing')), 'Hard');
  assert.equal(difficultyLabel(v('guess', 'unique-needs-guessing')), 'Very hard');
  for (const status of ['multiple', 'none', 'unknown']) {
    assert.equal(difficultyLabel({ status, sweeps: 1 }), 'Not fair');
  }
});

test('no tier: needs-guessing stays Hard, line-solvable falls back to Medium', () => {
  assert.equal(difficultyLabel({ status: 'unique-needs-guessing', sweeps: 2 }), 'Hard');
  assert.equal(difficultyLabel({ status: 'unique-line-solvable', sweeps: 1 }), 'Medium');
});

test('only unique verdicts are fair', () => {
  assert.equal(isFair(null), false);
  assert.equal(isFair({ status: 'unique-line-solvable', sweeps: 1 }), true);
  assert.equal(isFair({ status: 'unique-needs-guessing', sweeps: 1 }), true);
  assert.equal(isFair({ status: 'unknown', sweeps: 1 }), false);
});
