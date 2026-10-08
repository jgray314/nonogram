import { test } from 'node:test';
import assert from 'node:assert/strict';
import { difficultyLabel, isFair } from '../src/difficulty.js';

test('difficulty label from verdict', () => {
  assert.equal(difficultyLabel(null), 'Unchecked');
  assert.equal(difficultyLabel({ status: 'unique-line-solvable', sweeps: 3 }), 'Easy');
  assert.equal(difficultyLabel({ status: 'unique-line-solvable', sweeps: 4 }), 'Medium');
  assert.equal(difficultyLabel({ status: 'unique-needs-guessing', sweeps: 2 }), 'Hard');
  for (const status of ['multiple', 'none', 'unknown']) {
    assert.equal(difficultyLabel({ status, sweeps: 1 }), 'Not fair');
  }
});

test('only unique verdicts are fair', () => {
  assert.equal(isFair(null), false);
  assert.equal(isFair({ status: 'unique-line-solvable', sweeps: 1 }), true);
  assert.equal(isFair({ status: 'unique-needs-guessing', sweeps: 1 }), true);
  assert.equal(isFair({ status: 'unknown', sweeps: 1 }), false);
});
