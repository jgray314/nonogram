import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personaTier, solveAndRate, newcomerLine, casualLine, TIERS } from '../src/personas.js';
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

test('sample tiers and labels: two Easy, three Medium, six Hard (difficulty-personas.md)', async () => {
  const rated = Object.fromEntries(
    (await samplePuzzles()).map((p) => [
      p.title.replace('AI test sample: ', ''),
      `${p.verdict.tier} ${difficultyLabel(p.verdict, p)}`,
    ]),
  );
  assert.deepEqual(rated, {
    'Plus (5x5)': 'newcomer Easy',
    'Castle (10x10)': 'newcomer Easy',
    'Heart (5x5)': 'casual Medium',
    'House (10x10)': 'casual Medium',
    'Smiley (15x15)': 'regular Hard',
    'Cat (10x10)': 'regular Hard',
    'Cat (15x15)': 'casual Medium',
    'Cat (20x20)': 'regular Hard',
    'Cat (25x25)': 'regular Hard',
    'Banana (10x10)': 'regular Hard',
    'Spider (20x20)': 'regular Hard',
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

test('the worker call solves and rates in one step', () => {
  const result = solveAndRate(problemOf(grid(ONE_TRIAL)), {});
  assert.equal(result.status, 'unique-needs-guessing');
  assert.equal(result.tier, 'expert');
});

test('a puzzle with more than one color gets no tier (gate pass 4, M1)', () => {
  // Touching runs of different colors broke the gap the techniques assume,
  // and the Newcomer rated this one Easy.
  const solution = [
    [2, 1, 2, 2],
    [2, 0, 2, 0],
    [1, 1, 2, 0],
    [2, 0, 2, 2],
  ];
  const problem = problemOf(solution);
  assert.equal(personaTier(problem, 'unique-line-solvable'), null);
  assert.equal(solveAndRate(problem, {}).tier, null);
});

test('unfair puzzles have no tier', () => {
  const problem = problemOf(grid(['#.', '.#']));
  assert.equal(solve(problem).status, 'multiple');
  assert.equal(personaTier(problem, 'multiple'), null);
});
