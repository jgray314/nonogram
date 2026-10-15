// The persona corpus behind docs/difficulty-personas.md. Seeded, so the printed
// table is the one the doc quotes; rerun with `npm run test:extended`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puzzleClues } from '../../src/clues.js';
import { solve } from '../../src/solver.js';
import { personaTier, TIERS } from '../../src/personas.js';
import { samplePuzzles } from '../../src/samples.js';
import { difficultyLabel } from '../../src/difficulty.js';

let seed = 12345;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const noise = (size, density) =>
  Array.from({ length: size }, () =>
    Array.from({ length: size }, () => (rand() < density ? 1 : 0)),
  );

/** Picture-like: a few soft blobs, thresholded, with a little noise. */
function blobs(size) {
  const k = 2 + Math.floor(rand() * 4);
  const centers = Array.from({ length: k }, () => [
    rand() * size,
    rand() * size,
    (0.15 + rand() * 0.3) * size,
  ]);
  const t = 0.5 + rand() * 0.4;
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      const v = centers.reduce(
        (a, [y, x, s]) => a + Math.exp(-((r - y) ** 2 + (c - x) ** 2) / (2 * s * s)),
        0,
      );
      return v + (rand() - 0.5) * 0.25 > t ? 1 : 0;
    }),
  );
}

function rate(src, solution) {
  const problem = { width: solution[0].length, height: solution.length, ...puzzleClues(solution) };
  const { status, sweeps } = solve(problem);
  const t0 = performance.now();
  const tier = personaTier(problem, status);
  return { src, size: problem.width, status, sweeps, tier, ms: performance.now() - t0 };
}

test('persona corpus: every fair puzzle gets a tier that fits its verdict', async () => {
  const rows = [];
  for (const p of await samplePuzzles()) rows.push(rate('sample', p.solution));
  for (const size of [5, 10, 15, 20, 25]) {
    for (let i = 0; i < 40; i += 1) rows.push(rate('blob', blobs(size)));
    for (const d of [0.45, 0.55, 0.65, 0.75]) {
      for (let i = 0; i < 15; i += 1) rows.push(rate('noise', noise(size, d)));
    }
  }

  const fair = rows.filter((r) => r.status.startsWith('unique'));
  for (const r of rows) {
    if (r.status === 'unique-line-solvable') {
      assert.ok(['newcomer', 'casual', 'regular'].includes(r.tier), JSON.stringify(r));
    } else if (r.status === 'unique-needs-guessing') {
      assert.ok(['expert', 'guess'].includes(r.tier), JSON.stringify(r));
    } else {
      assert.equal(r.tier, null);
    }
  }

  const lines = [`corpus ${rows.length}, fair ${fair.length}`];
  for (const tier of TIERS) {
    const sw = fair
      .filter((r) => r.tier === tier)
      .map((r) => r.sweeps)
      .sort((a, b) => a - b);
    if (sw.length === 0) continue;
    const mid = sw[Math.floor(sw.length / 2)];
    lines.push(`${tier}: ${sw.length} (sweeps ${sw[0]} / ${mid} / ${sw[sw.length - 1]})`);
  }
  for (const src of ['blob', 'noise']) {
    for (const size of [5, 10, 15, 20, 25]) {
      const g = fair.filter((r) => r.src === src && r.size === size);
      const n = (t) => g.filter((r) => r.tier === t).length;
      // The shown label, size step included (D23).
      const shown = (l) =>
        g.filter(
          (r) =>
            difficultyLabel(
              { status: r.status, sweeps: r.sweeps, tier: r.tier },
              { width: size, height: size },
            ) === l,
        ).length;
      lines.push(
        `${src} ${size}: fair ${g.length}; ` +
          TIERS.map((t) => `${t} ${n(t)}`).join(', ') +
          ` | Easy ${shown('Easy')}, Medium ${shown('Medium')}, Hard ${shown('Hard')},` +
          ` Very hard ${shown('Very hard')}`,
      );
    }
  }
  // Wall-clock time: varies by machine, unlike the seeded counts above.
  const slowest = Math.max(...fair.map((r) => r.ms));
  lines.push(`slowest tier: ${slowest.toFixed(0)} ms`);
  console.log(lines.join('\n'));
});
