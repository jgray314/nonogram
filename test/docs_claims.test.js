// Numbers the docs quote are checked against their source: test counts, suite
// timings and corpus sizes. A claim that no longer holds fails here, so a doc
// cannot drift without a test going red (gate passes 2, 3, 5 and 6 each found one).
//
// Limits: only the fast suite is re-timed on every run. The slow suites cost
// 8 s and 47 s, so their timings are RECORDED below (measured 2026-10-15) and
// the docs are held to them within a tolerance; re-measure when those suites change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { samplePuzzles } from '../src/samples.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const DOCS = ['README.md', 'PLAN.md', 'AGENTS.md', 'docs/difficulty-personas.md'];
const pkg = JSON.parse(read('package.json'));
const FULL_CHECK = JSON.parse(read('FEATURES.json')).check_command;

// Seconds, measured on the owner's machine. Docs may quote within these factors.
const RECORDED_SECONDS = {
  [FULL_CHECK]: 3,
  'npm run test:solver_slow': 8,
  'npm run test:difficulty_very_slow': 47,
};
const RECORDED_FAIR = 396; // seeded corpus, printed by test:difficulty_very_slow
const SLOW_TOLERANCE = 1.5; // a doc may be this factor above or below the record
const FAST_TOLERANCE = 3; // live fast-suite time may be this factor above the doc

const HISTORICAL_LINE = /^\s*(?:[-*]\s*)?\*{0,2}(?:Done\s+)?20\d\d-\d\d-\d\d/;

const lines = (file) =>
  read(file)
    .split('\n')
    .map((text, i) => ({ file, n: i + 1, text }));
const allLines = DOCS.flatMap(lines);
const isHistorical = (l) => HISTORICAL_LINE.test(l.text);

const testSources = readdirSync(fileURLToPath(new URL('test/', ROOT)), { recursive: true })
  .filter((f) => f.endsWith('.js'))
  .map((f) => read(`test/${f.replaceAll('\\', '/')}`))
  .join('\n');

// ---- fast suite: collected count and live time ------------------------------

const CHILD = process.env.NNG_DOCS_CLAIMS_CHILD === '1';
let ownTests = 0;
const t = (...args) => {
  ownTests += 1;
  return test(...args);
};

function runFastSuite() {
  const dir = fileURLToPath(new URL('test/', ROOT));
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.test.js') && f !== 'docs_claims.test.js')
    .map((f) => dir + f);
  // NODE_TEST_CONTEXT would make the child report to this runner instead of printing.
  const env = { ...process.env, NNG_DOCS_CLAIMS_CHILD: '1' };
  delete env.NODE_TEST_CONTEXT;
  const start = performance.now();
  const r = spawnSync(process.execPath, ['--test', ...files], { encoding: 'utf8', env });
  const seconds = (performance.now() - start) / 1000;
  const count = Number(/^ℹ tests (\d+)/m.exec(r.stdout)?.[1]);
  return { seconds, count, status: r.status };
}

// ---- claim extraction -------------------------------------------------------

const SUITE = new RegExp(
  `${FULL_CHECK.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}|npm run [\\w:]+|npm test|\`test:\\w+\``,
  'g',
);
const DURATION =
  /(?:under|about|target under)(?: about)? (?:(\d+)\s*(s|seconds?|minutes?)|a (minute))/g;

const suiteName = (raw) => {
  const m = /^`?(?:npm run )?(test:\w+)`?$/.exec(raw);
  return m ? `npm run ${m[1]}` : raw;
};

function timingClaims() {
  const claims = [];
  for (const l of allLines) {
    if (isHistorical(l)) continue;
    const suites = [...l.text.matchAll(SUITE)].map((m) => ({ at: m.index, name: suiteName(m[0]) }));
    if (suites.length === 0) continue;
    for (const m of l.text.matchAll(DURATION)) {
      // A duration inside a backticked test name is a test title, pinned elsewhere.
      const span = /`([^`]*)`/g;
      let inTitle = false;
      for (const b of l.text.matchAll(span)) {
        if (b.index < m.index && m.index < b.index + b[0].length && testSources.includes(b[1]))
          inTitle = true;
      }
      if (inTitle) continue;
      const seconds = m[3] ? 60 : Number(m[1]) * (m[2].startsWith('m') ? 60 : 1);
      const named = suites.filter((s) => s.at < m.index).at(-1);
      claims.push({ ...l, seconds, suite: named?.name ?? null });
    }
  }
  return claims;
}

// ---- tests ------------------------------------------------------------------

if (!CHILD) {
  const fast = runFastSuite();
  const total = fast.count + 0; // own tests are added below, once registered

  t('docs: the fast suite runs clean when collected for counting', () => {
    assert.equal(fast.status, 0);
    assert.ok(Number.isInteger(fast.count) && fast.count > 0);
  });

  t('docs: every timing claim about a suite names that suite', () => {
    const unnamed = timingClaims().filter((c) => c.suite === null);
    assert.deepEqual(
      unnamed.map((c) => `${c.file}:${c.n}`),
      [],
    );
  });

  t(
    'docs: every named suite in a timing claim is a script in package.json or the full check',
    () => {
      const known = (s) =>
        s === 'npm test' || s === FULL_CHECK || pkg.scripts[s.replace('npm run ', '')];
      const bad = timingClaims().filter((c) => c.suite && !known(c.suite));
      assert.deepEqual(
        bad.map((c) => `${c.file}:${c.n} ${c.suite}`),
        [],
      );
    },
  );

  t('docs: the fast suite is no slower than the quoted time times the tolerance', () => {
    const claims = timingClaims().filter((c) => c.suite === 'npm test');
    assert.ok(claims.length > 0, 'no fast-suite timing claim found');
    for (const c of claims) {
      assert.ok(
        fast.seconds <= c.seconds * FAST_TOLERANCE,
        `${c.file}:${c.n} says ${c.seconds}s for npm test, measured ${fast.seconds.toFixed(1)}s`,
      );
    }
  });

  t(
    'docs: slow-suite and full-check timings are within tolerance of the recorded measurement',
    () => {
      const claims = timingClaims().filter((c) => c.suite && c.suite !== 'npm test');
      assert.ok(claims.length > 0);
      for (const c of claims) {
        const rec = RECORDED_SECONDS[c.suite];
        assert.ok(rec, `${c.file}:${c.n} no recorded time for ${c.suite}`);
        assert.ok(
          c.seconds <= rec * SLOW_TOLERANCE && c.seconds >= rec / SLOW_TOLERANCE,
          `${c.file}:${c.n} says ${c.seconds}s for ${c.suite}, recorded ${rec}s`,
        );
      }
    },
  );

  t('docs: a named test title in a doc exists in the test sources', () => {
    const planLine = allLines.find(
      (l) => l.file === 'PLAN.md' && l.text.includes('25x25 completes'),
    );
    assert.ok(planLine);
    assert.ok(testSources.includes('25x25 completes under 1s'));
  });

  t('docs: every "N Node tests" outside a dated record equals the collected test count', () => {
    const own = ownTests;
    const claims = [];
    for (const l of allLines) {
      if (isHistorical(l)) continue;
      for (const m of l.text.matchAll(/(\d[\d,]*) Node tests/g)) {
        claims.push({ at: `${l.file}:${l.n}`, n: Number(m[1].replaceAll(',', '')) });
      }
    }
    for (const c of claims) assert.equal(c.n, total + own, `${c.at} quotes a test count`);
  });

  t('docs: the "seeded sample of N" claims equals the sample loop in the solver test', () => {
    const src = read('test/solver.test.js');
    const body = src.slice(src.indexOf("test('seeded 4x4 cross-check sample'"));
    const actual = Number(/i < (\d+)/.exec(body)?.[1]);
    let found = 0;
    for (const l of allLines) {
      if (isHistorical(l)) continue;
      for (const m of l.text.matchAll(/seeded (?:4x4 )?samples? of (\d[\d,]*)/g)) {
        found += 1;
        assert.equal(Number(m[1].replaceAll(',', '')), actual, `${l.file}:${l.n}`);
      }
    }
    assert.ok(found > 0);
  });

  t('docs: every `test:` script named in a doc exists in package.json', () => {
    const missing = [];
    for (const l of allLines) {
      for (const m of l.text.matchAll(/`(?:npm run )?(test:\w+)`/g)) {
        if (pkg.scripts[m[1]] || isHistorical(l)) continue;
        missing.push(`${l.file}:${l.n} ${m[1]}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  t(
    'docs: the corpus size and its parts quoted in difficulty-personas.md match the corpus test',
    async () => {
      const src = read('test/difficulty_very_slow/personas.corpus.test.js');
      const sizes = /for \(const size of \[([\d, ]+)\]\)/.exec(src)[1].split(',').length;
      const blobEach = Number(/i < (\d+); i \+= 1\) rows\.push\(rate\('blob'/.exec(src)[1]);
      const densities = /for \(const d of \[([\d., ]+)\]\)/.exec(src)[1].split(',').length;
      const noiseEach = Number(
        /for \(const d of [^\n]+\n\s+for \(let i = 0; i < (\d+)/.exec(src)[1],
      );
      const samples = (await samplePuzzles()).length;
      const blobs = sizes * blobEach;
      const noise = sizes * densities * noiseEach;
      const doc = read('docs/difficulty-personas.md');
      assert.ok(doc.includes(`The ${samples} samples.`), 'sample count');
      assert.ok(doc.includes(`- ${blobs} picture-like grids`), 'picture-like count');
      assert.ok(doc.includes(`- ${noise} random grids`), 'random grid count');
      assert.ok(
        doc.includes(`Of these ${samples + blobs + noise}, ${RECORDED_FAIR} are fair`),
        'corpus total and fair count',
      );
    },
  );

  t(
    'docs: the "3,000 random lines" quoted in difficulty-personas.md match the persona test',
    () => {
      const src = read('test/personas.test.js');
      const loops = [...src.matchAll(/i < (\d+); i \+= 1/g)].map((m) => Number(m[1]));
      assert.ok(loops.includes(3000));
      assert.ok(read('docs/difficulty-personas.md').includes('on 3,000 random lines'));
    },
  );
}
