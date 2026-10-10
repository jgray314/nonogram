import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personaTier, newcomerLine, casualLine, TIERS } from '../src/personas.js';
import { puzzleClues, lineClues } from '../src/clues.js';
import { solve } from '../src/solver.js';
import { samplePuzzles } from '../src/samples.js';
import { difficultyLabel } from '../src/difficulty.js';

const grid = (rows) => rows.map((r) => Array.from(r, (ch) => (ch === '#' ? 1 : 0)));
const problemOf = (sol) => ({ width: sol[0].length, height: sol.length, ...puzzleClues(sol) });
const tierOf = (rows) => {
  const problem = problemOf(grid(rows));
  return personaTier(problem, solve(problem).status);
};

let seed = 4242;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

test('persona line techniques never contradict the solution', () => {
  // A persona that deduced a wrong cell could "finish" a puzzle it can't.
  for (let i = 0; i < 3000; i += 1) {
    const len = 1 + Math.floor(rand() * 15);
    const line = Array.from({ length: len }, () => (rand() < 0.55 ? 1 : 0));
    const known = line.map((v) => (rand() < 0.4 ? v : null));
    for (const fn of [newcomerLine, casualLine]) {
      const out = fn(lineClues(line), known);
      out.forEach((v, x) => {
        if (v !== null) assert.equal(v, line[x], `${fn.name} on ${line.join('')} at ${x}`);
      });
    }
  }
});

test('full and empty lines are Newcomer puzzles', () => {
  assert.equal(tierOf(['###', '...', '###']), 'newcomer');
});

test('trimming a crossed end and gluing to an edge fill are Casual steps', () => {
  const _ = null;
  const three = [{ n: 3, c: 1 }];
  // The Newcomer counts overlap over the whole line: only the middle cell.
  // After trimming the crossed end, a 3 in 4 cells fills the middle two.
  assert.deepEqual(newcomerLine(three, [0, _, _, _, _]), [0, _, 1, _, _]);
  assert.deepEqual(casualLine(three, [0, _, _, _, _]), [0, _, 1, 1, _]);
  // A fill at the edge of the open span starts the run: grow it, then cross the rest.
  assert.deepEqual(newcomerLine(three, [0, 1, _, _, _]), [0, 1, 1, _, _]);
  assert.deepEqual(casualLine(three, [0, 1, _, _, _]), [0, 1, 1, 1, 0]);
});

test('sample labels: three samples Easy, six Medium (difficulty-personas.md)', async () => {
  const labels = Object.fromEntries(
    (await samplePuzzles()).map((p) => [
      p.title.replace('AI test sample: ', ''),
      difficultyLabel(p.verdict),
    ]),
  );
  assert.deepEqual(labels, {
    'Heart (5x5)': 'Easy',
    'House (10x10)': 'Easy',
    'Cat (15x15)': 'Easy',
    'Smiley (15x15)': 'Medium',
    'Cat (10x10)': 'Medium',
    'Cat (20x20)': 'Medium',
    'Cat (25x25)': 'Medium',
    'Banana (10x10)': 'Medium',
    'Spider (20x20)': 'Medium',
  });
});

const ONE_TRIAL = ['#....', '....#', '...##', '##...', '.###.'];

test('one-cell trial finishes a needs-guessing puzzle: Expert', () => {
  const problem = problemOf(grid(ONE_TRIAL));
  assert.equal(solve(problem).status, 'unique-needs-guessing');
  assert.equal(personaTier(problem, 'unique-needs-guessing'), 'expert');
});

test('an Expert out of trials rates the puzzle guess (Very hard), never easier', () => {
  const problem = problemOf(grid(ONE_TRIAL));
  assert.equal(personaTier(problem, 'unique-needs-guessing', { probeBudget: 0 }), 'guess');
  assert.ok(TIERS.includes('guess'));
});

test('unfair puzzles have no tier', () => {
  const problem = problemOf(grid(['#.', '.#']));
  assert.equal(solve(problem).status, 'multiple');
  assert.equal(personaTier(problem, 'multiple'), null);
});
