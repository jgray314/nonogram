// Registry of import bounds. Every import entry point is driven through the same
// table of fields: allow-listed keys at every depth, per-field length and count
// limits, and duplicate ids. The registry check fails when a field appears in a
// key list in src/format.js without a row here, so a new field cannot ship unbounded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBackup,
  parseBackup,
  planImport,
  ratePlan,
  MAX_BACKUP_RECORDS,
} from '../src/backup.js';
import { serializeSaveFile, parseSaveFile } from '../src/save.js';
import {
  PUZZLE_KEYS,
  SAVE_KEYS,
  SET_KEYS,
  PALETTE_ENTRY_KEYS,
  PUZZLE_SET_KEYS,
  RULES_KEYS,
  MAX_TITLE_CHARS,
  MAX_NAME_CHARS,
  MAX_SET_ID_CHARS,
  MAX_SWEEPS,
  MAX_SET_SIDE,
  MAX_GRID_SIDE,
  MAX_PALETTE,
  MAX_ART_CHARS,
  MAX_ART_SIDE,
  ART_PREFIX,
  idMatches,
  puzzleId,
} from '../src/format.js';
import { MAX_HEARTS } from '../src/game.js';
import { jpegHeader } from './jpeg-fixture.js';

// ---- fixtures -------------------------------------------------------------

const grid = (w, h, fill) => Array.from({ length: h }, () => Array(w).fill(fill));
const palette = (n) =>
  Array.from({ length: n }, (_, i) => ({ name: `c${i}`, hex: `#${(i + 16).toString(16)}0000` }));

const basePuzzle = () => ({
  v: 1,
  id: 'p1',
  title: 'Base',
  width: 2,
  height: 2,
  palette: palette(1),
  solution: [
    [1, 0],
    [0, 1],
  ],
  verdict: null,
  set: { id: 's1', row: 0, col: 0 },
});
const baseSave = () => ({
  puzzleId: 'p1',
  cells: grid(2, 2, -1),
  elapsedMs: 10,
  rules: { zen: false, autoCross: true },
  solvedAt: null,
  hearts: 2,
  hints: 1,
});
const baseSet = () => ({ v: 1, setId: 's1', title: 'S', rows: 1, cols: 2, tileIds: ['a', 'b'] });
/** @type {Record<string, () => any>} */
const BASE = { puzzle: basePuzzle, save: baseSave, set: baseSet };

// A save that fits a puzzle of any (even invalid) size, so a size row tests the puzzle.
const saveFitting = (p) => ({ ...baseSave(), puzzleId: p.id, cells: grid(p.width, p.height, -1) });

// ---- entry points ---------------------------------------------------------
// run(kind, record) -> {accepted, record, artDropped, skipped}

const fromBackup = (parsed, kind) => {
  const list = { puzzle: parsed.puzzles, save: parsed.saves, set: parsed.sets }[kind];
  return {
    accepted: parsed.ok && list.length === 1,
    record: list[0],
    artDropped: parsed.artDroppedIds.length > 0,
    skipped: parsed.skipped.length,
  };
};

/** @type {Record<string, { kinds: string[], run: (kind: string, record: any) => any }>} */
const ENTRY_POINTS = {
  'library backup': {
    kinds: ['puzzle', 'save', 'set'],
    run(kind, record) {
      const data = { puzzles: [], saves: [], sets: [] };
      if (kind === 'puzzle') data.puzzles = [record];
      else if (kind === 'save') data.puzzles = [basePuzzle()];
      if (kind === 'save') data.saves = [record];
      if (kind === 'set') data.sets = [record];
      return fromBackup(parseBackup(buildBackup(data)), kind);
    },
  },
  'save file': {
    kinds: ['puzzle', 'save'],
    run(kind, record) {
      const [puzzle, save] =
        kind === 'puzzle' ? [record, saveFitting(record)] : [basePuzzle(), record];
      const parsed = parseSaveFile(serializeSaveFile(puzzle, save));
      const picked = kind === 'puzzle' ? parsed.puzzle : parsed.save;
      return {
        accepted: parsed.ok,
        record: picked,
        artDropped: parsed.artDropped === 1,
        skipped: parsed.ok ? 0 : 1,
      };
    },
  },
};

// ---- the registry ---------------------------------------------------------
// One row per field. `cases` are [label, mutate(record), outcome] where outcome
// is 'accepted', 'rejected' or 'art-dropped' (record kept, picture removed).

const set = (obj, path, value) => {
  const keys = path.split('.');
  const last = keys.pop();
  let o = obj;
  for (const k of keys) o = o[/^\d+$/.test(k) ? Number(k) : k];
  o[last] = value;
  return obj;
};
const withValue = (path, value) => (r) => set(r, path, value);
const without = (key) => (r) => {
  delete r[key];
  return r;
};
const resizeTo = (w, h) => (r) => {
  r.width = w;
  r.height = h;
  r.solution = grid(w, h, 0);
  return r;
};
const resizePalette = (n) => (r) => {
  r.palette = palette(n);
  return r;
};
const resizeSet = (rows, cols) => (r) => {
  r.rows = rows;
  r.cols = cols;
  r.tileIds = Array(rows * cols).fill('t');
  return r;
};

/** @type {{ field: string, kind: string, cases: [string, (record: any) => any, string][] }[]} */
const REGISTRY = [
  // puzzle
  {
    field: 'v',
    kind: 'puzzle',
    cases: [
      ['version 1', (r) => r, 'accepted'],
      ['version 2', withValue('v', 2), 'rejected'],
    ],
  },
  {
    field: 'id',
    kind: 'puzzle',
    cases: [
      ['id at the limit', withValue('id', 'i'.repeat(MAX_SET_ID_CHARS)), 'accepted'],
      ['id over the limit', withValue('id', 'i'.repeat(MAX_SET_ID_CHARS + 1)), 'rejected'],
      ['empty id', withValue('id', ''), 'rejected'],
      ['non-string id', withValue('id', 7), 'rejected'],
    ],
  },
  {
    field: 'title',
    kind: 'puzzle',
    cases: [
      ['title at the limit', withValue('title', 'x'.repeat(MAX_TITLE_CHARS)), 'accepted'],
      ['title over the limit', withValue('title', 'x'.repeat(MAX_TITLE_CHARS + 1)), 'rejected'],
    ],
  },
  {
    field: 'width',
    kind: 'puzzle',
    cases: [
      ['width at the limit', resizeTo(MAX_GRID_SIDE, 2), 'accepted'],
      ['width over the limit', resizeTo(MAX_GRID_SIDE + 1, 2), 'rejected'],
      ['width 0', resizeTo(0, 2), 'rejected'],
    ],
  },
  {
    field: 'height',
    kind: 'puzzle',
    cases: [
      ['height at the limit', resizeTo(2, MAX_GRID_SIDE), 'accepted'],
      ['height over the limit', resizeTo(2, MAX_GRID_SIDE + 1), 'rejected'],
      ['height 0', resizeTo(2, 0), 'rejected'],
    ],
  },
  {
    field: 'palette',
    kind: 'puzzle',
    cases: [
      ['palette at the count limit', resizePalette(MAX_PALETTE), 'accepted'],
      ['palette over the count limit', resizePalette(MAX_PALETTE + 1), 'rejected'],
      ['empty palette', resizePalette(0), 'rejected'],
    ],
  },
  {
    field: 'palette[].name',
    kind: 'puzzle',
    cases: [
      ['name at the limit', withValue('palette.0.name', 'n'.repeat(MAX_NAME_CHARS)), 'accepted'],
      [
        'name over the limit',
        withValue('palette.0.name', 'n'.repeat(MAX_NAME_CHARS + 1)),
        'rejected',
      ],
    ],
  },
  {
    field: 'palette[].hex',
    kind: 'puzzle',
    cases: [
      ['hex not #rrggbb', withValue('palette.0.hex', '#fff'), 'rejected'],
      ['hex with trailing text', withValue('palette.0.hex', '#000000;x'), 'rejected'],
    ],
  },
  {
    field: 'solution',
    kind: 'puzzle',
    cases: [
      ['cell value past the palette', withValue('solution.0.0', 2), 'rejected'],
      ['solution row too short', (r) => set(r, 'solution.0', [1]), 'rejected'],
    ],
  },
  {
    field: 'verdict',
    kind: 'puzzle',
    cases: [
      [
        'sweeps at the limit',
        withValue('verdict', { status: 'multiple', sweeps: MAX_SWEEPS }),
        'accepted',
      ],
      [
        'sweeps over the limit',
        withValue('verdict', { status: 'multiple', sweeps: MAX_SWEEPS + 1 }),
        'rejected',
      ],
      ['unknown status', withValue('verdict', { status: 'solved', sweeps: 1 }), 'rejected'],
      [
        'unknown tier',
        withValue('verdict', { status: 'multiple', sweeps: 1, tier: 'wizard' }),
        'rejected',
      ],
    ],
  },
  {
    field: 'set',
    kind: 'puzzle',
    cases: [
      ['set absent', without('set'), 'accepted'],
      ['set not an object', withValue('set', 'a'), 'rejected'],
    ],
  },
  {
    field: 'set.id',
    kind: 'puzzle',
    cases: [
      ['set id at the limit', withValue('set.id', 's'.repeat(MAX_SET_ID_CHARS)), 'accepted'],
      ['set id over the limit', withValue('set.id', 's'.repeat(MAX_SET_ID_CHARS + 1)), 'rejected'],
    ],
  },
  {
    field: 'set.row',
    kind: 'puzzle',
    cases: [
      ['row at the limit', withValue('set.row', MAX_SET_SIDE - 1), 'accepted'],
      ['row over the limit', withValue('set.row', MAX_SET_SIDE), 'rejected'],
      ['negative row', withValue('set.row', -1), 'rejected'],
    ],
  },
  {
    field: 'set.col',
    kind: 'puzzle',
    cases: [
      ['col at the limit', withValue('set.col', MAX_SET_SIDE - 1), 'accepted'],
      ['col over the limit', withValue('set.col', MAX_SET_SIDE), 'rejected'],
      ['huge col', withValue('set.col', 100000), 'rejected'],
    ],
  },
  {
    field: 'art',
    kind: 'puzzle',
    cases: [
      ['art at the side limit', withValue('art', jpegHeader(MAX_ART_SIDE, 10)), 'accepted'],
      [
        'art over the side limit',
        withValue('art', jpegHeader(MAX_ART_SIDE + 1, 10)),
        'art-dropped',
      ],
      ['art with a JPEG prefix but no JPEG', withValue('art', `${ART_PREFIX}AAAA`), 'art-dropped'],
      [
        'art over the character limit',
        withValue('art', ART_PREFIX + 'A'.repeat(MAX_ART_CHARS)),
        'rejected',
      ],
      [
        'art that is not a JPEG data URL',
        withValue('art', 'data:image/png;base64,AAAA'),
        'rejected',
      ],
    ],
  },
  {
    field: 'blank',
    kind: 'puzzle',
    cases: [
      ['blank absent', without('blank'), 'accepted'],
      ['blank #rrggbb', withValue('blank', '#1f2f4f'), 'accepted'],
      ['blank not #rrggbb', withValue('blank', '#fff'), 'rejected'],
      ['blank with trailing text', withValue('blank', '#1f2f4f;x'), 'rejected'],
      ['blank over a hex length', withValue('blank', '#' + 'a'.repeat(100000)), 'rejected'],
      ['blank not a string', withValue('blank', 7), 'rejected'],
    ],
  },
  // save
  {
    field: 'puzzleId',
    kind: 'save',
    cases: [
      ['non-string puzzleId', withValue('puzzleId', 5), 'rejected'],
      [
        'puzzleId over the limit',
        withValue('puzzleId', 'i'.repeat(MAX_SET_ID_CHARS + 1)),
        'rejected',
      ],
    ],
  },
  {
    field: 'cells',
    kind: 'save',
    cases: [
      ['cells with the wrong row count', (r) => ((r.cells = grid(2, 3, -1)), r), 'rejected'],
      ['cell past the palette', withValue('cells.0.0', 2), 'rejected'],
      ['cell below -1', withValue('cells.0.0', -2), 'rejected'],
    ],
  },
  {
    field: 'elapsedMs',
    kind: 'save',
    cases: [
      ['negative elapsedMs', withValue('elapsedMs', -1), 'rejected'],
      ['infinite elapsedMs', withValue('elapsedMs', Infinity), 'rejected'],
    ],
  },
  {
    field: 'rules',
    kind: 'save',
    cases: [['rules not an object', withValue('rules', []), 'rejected']],
  },
  {
    field: 'rules.zen',
    kind: 'save',
    cases: [['zen not a boolean', withValue('rules.zen', 'yes'), 'rejected']],
  },
  {
    field: 'rules.autoCross',
    kind: 'save',
    cases: [['autoCross true', withValue('rules.autoCross', true), 'accepted']],
  },
  {
    field: 'solvedAt',
    kind: 'save',
    cases: [['solvedAt a string', withValue('solvedAt', 'now'), 'rejected']],
  },
  {
    field: 'hearts',
    kind: 'save',
    cases: [
      ['hearts at the limit', withValue('hearts', MAX_HEARTS), 'accepted'],
      ['hearts over the limit', withValue('hearts', MAX_HEARTS + 1), 'rejected'],
      ['negative hearts', withValue('hearts', -1), 'rejected'],
    ],
  },
  {
    field: 'hints',
    kind: 'save',
    cases: [
      ['hints at the cell count', withValue('hints', 4), 'accepted'],
      ['hints over the cell count', withValue('hints', 5), 'rejected'],
    ],
  },
  // set record
  {
    field: 'setId',
    kind: 'set',
    cases: [
      ['setId at the limit', withValue('setId', 's'.repeat(MAX_SET_ID_CHARS)), 'accepted'],
      ['setId over the limit', withValue('setId', 's'.repeat(MAX_SET_ID_CHARS + 1)), 'rejected'],
      ['empty setId', withValue('setId', ''), 'rejected'],
    ],
  },
  {
    field: 'rows',
    kind: 'set',
    cases: [
      ['rows at the limit', resizeSet(MAX_SET_SIDE, 1), 'accepted'],
      ['rows over the limit', resizeSet(MAX_SET_SIDE + 1, 1), 'rejected'],
    ],
  },
  {
    field: 'cols',
    kind: 'set',
    cases: [
      ['cols at the limit', resizeSet(1, MAX_SET_SIDE), 'accepted'],
      ['cols over the limit', resizeSet(1, MAX_SET_SIDE + 1), 'rejected'],
    ],
  },
  {
    field: 'tileIds',
    kind: 'set',
    cases: [
      ['tileIds count equals rows*cols', (r) => r, 'accepted'],
      ['tileIds count differs from rows*cols', withValue('tileIds', ['a']), 'rejected'],
      ['tileIds with a non-string', withValue('tileIds', ['a', 7]), 'rejected'],
      [
        'tileIds entry at the limit',
        withValue('tileIds', ['t'.repeat(MAX_SET_ID_CHARS), 'b']),
        'accepted',
      ],
      [
        'tileIds entry over the limit',
        withValue('tileIds', ['t'.repeat(MAX_SET_ID_CHARS + 1), 'b']),
        'rejected',
      ],
    ],
  },
  // 'v' and 'title' also exist on the set record; the puzzle rows cover the same
  // validators, so the set rows below pin the set copies separately.
  {
    field: 'title',
    kind: 'set',
    cases: [
      ['set title at the limit', withValue('title', 'x'.repeat(MAX_TITLE_CHARS)), 'accepted'],
      ['set title over the limit', withValue('title', 'x'.repeat(MAX_TITLE_CHARS + 1)), 'rejected'],
    ],
  },
  {
    field: 'v',
    kind: 'set',
    cases: [['set version 2', withValue('v', 2), 'rejected']],
  },
];

// ---- the tests ------------------------------------------------------------

test('every field in the format key lists has a registry row, and every row names a field', () => {
  const expected = {
    puzzle: new Set([
      ...PUZZLE_KEYS,
      ...PALETTE_ENTRY_KEYS.map((k) => `palette[].${k}`),
      ...PUZZLE_SET_KEYS.map((k) => `set.${k}`),
    ]),
    save: new Set([...SAVE_KEYS, ...RULES_KEYS.map((k) => `rules.${k}`)]),
    set: new Set(SET_KEYS),
  };
  for (const [kind, fields] of Object.entries(expected)) {
    const covered = new Set(REGISTRY.filter((r) => r.kind === kind).map((r) => r.field));
    assert.deepEqual(
      [...fields].filter((f) => !covered.has(f)),
      [],
      `${kind} fields with no registry row`,
    );
    assert.deepEqual(
      [...covered].filter((f) => !fields.has(f)),
      [],
      `${kind} registry rows for fields no key list names`,
    );
  }
});

for (const [entryName, entry] of Object.entries(ENTRY_POINTS)) {
  for (const row of REGISTRY.filter((r) => entry.kinds.includes(r.kind))) {
    for (const [label, mutate, outcome] of row.cases) {
      test(`${entryName}: ${row.kind} ${row.field}: ${label} is ${outcome}`, () => {
        const result = entry.run(row.kind, mutate(BASE[row.kind]()));
        assert.equal(result.accepted, outcome !== 'rejected', 'accepted');
        if (outcome === 'art-dropped') {
          assert.equal(result.artDropped, true, 'art dropped');
          assert.equal(Object.hasOwn(result.record, 'art'), false, 'art removed from the record');
        }
        if (outcome === 'accepted') assert.equal(result.artDropped, false, 'art kept');
      });
    }
  }
}

// Unknown keys are dropped at every depth the formats have.
/** @type {[string, string, (record: any, key: string) => any][]} */
const UNKNOWN_KEY_SITES = [
  ['puzzle', 'puzzle top level', (r, k) => set(r, k, 1)],
  ['puzzle', 'palette entry', (r, k) => set(r, `palette.0.${k}`, 1)],
  ['puzzle', 'puzzle set', (r, k) => set(r, `set.${k}`, 1)],
  ['save', 'save top level', (r, k) => set(r, k, 1)],
  ['save', 'save rules', (r, k) => set(r, `rules.${k}`, 1)],
  ['set', 'set record top level', (r, k) => set(r, k, 1)],
];
const HUGE_KEY = 'k'.repeat(1_000_000);
for (const [entryName, entry] of Object.entries(ENTRY_POINTS)) {
  for (const [kind, site, inject] of UNKNOWN_KEY_SITES.filter(([k]) => entry.kinds.includes(k))) {
    test(`${entryName}: unknown key in ${site} is dropped`, () => {
      const result = entry.run(kind, inject(BASE[kind](), HUGE_KEY));
      assert.equal(result.accepted, true, 'record still accepted');
      assert.equal(JSON.stringify(result.record).includes(HUGE_KEY), false);
    });
  }
}

test('library backup: a repeated puzzle id keeps the first record and is not reported as skipped', () => {
  const a = { ...basePuzzle(), title: 'first' };
  const b = { ...basePuzzle(), title: 'second' };
  const parsed = parseBackup(buildBackup({ puzzles: [a, b] }));
  assert.deepEqual(
    parsed.puzzles.map((p) => p.title),
    ['first'],
  );
  assert.deepEqual(parsed.skipped, []);
});

test('library backup: a repeated set id keeps the first record', () => {
  const a = { ...baseSet(), title: 'first' };
  const b = { ...baseSet(), title: 'second' };
  const parsed = parseBackup(buildBackup({ sets: [a, b] }));
  assert.deepEqual(
    parsed.sets.map((s) => s.title),
    ['first'],
  );
});

test('library backup: a repeated save for one puzzle keeps the first record', () => {
  const a = { ...baseSave(), elapsedMs: 1 };
  const b = { ...baseSave(), elapsedMs: 2 };
  const parsed = parseBackup(buildBackup({ puzzles: [basePuzzle()], saves: [a, b] }));
  assert.deepEqual(
    parsed.saves.map((s) => s.elapsedMs),
    [1],
  );
});

test('library backup: records whose ids already exist in the library are not planned for writing', () => {
  const parsed = parseBackup(
    buildBackup({ puzzles: [basePuzzle()], saves: [baseSave()], sets: [baseSet()] }),
  );
  const plan = planImport(parsed, { puzzles: ['p1'], saves: ['p1'], sets: ['s1'] });
  assert.deepEqual(plan, []);
});

test('library backup: a puzzle with an unusable record beside it does not stop the others', () => {
  const bad = { ...basePuzzle(), id: 'bad', width: 999 };
  const parsed = parseBackup(buildBackup({ puzzles: [bad, basePuzzle()] }));
  assert.deepEqual(
    parsed.puzzles.map((p) => p.id),
    ['p1'],
  );
  assert.deepEqual(
    parsed.skipped.map((s) => s.id),
    ['bad'],
  );
});

test('library backup: an imported verdict is replaced by the solver result, extra keys and all', async () => {
  const claim = { status: 'unique-line-solvable', sweeps: 1, [HUGE_KEY]: 1 };
  const parsed = parseBackup(buildBackup({ puzzles: [{ ...basePuzzle(), verdict: claim }] }));
  const plan = planImport(parsed, {});
  const fresh = { status: 'multiple', sweeps: 5 };
  const rated = await ratePlan(plan, async () => fresh);
  assert.deepEqual(rated[0].record.verdict, fresh);
});

// ids: the content hash is the identity, so a forged id must not match.
test('puzzle id: a record whose id is not the hash of its content does not match', async () => {
  const p = basePuzzle();
  p.id = await puzzleId(p);
  assert.equal(await idMatches(p), true);
  assert.equal(await idMatches({ ...p, id: 'forged' }), false);
  assert.equal(
    await idMatches({
      ...p,
      solution: [
        [0, 1],
        [1, 0],
      ],
    }),
    false,
  );
});

test('puzzle id: title and art do not change it', async () => {
  const p = basePuzzle();
  const id = await puzzleId(p);
  assert.equal(await puzzleId({ ...p, title: 'other', art: jpegHeader(10, 10) }), id);
});

test('set record: a tileIds entry over the id length limit is rejected', () => {
  const r = { ...baseSet(), tileIds: ['x'.repeat(MAX_SET_ID_CHARS + 1), 'b'] };
  assert.equal(ENTRY_POINTS['library backup'].run('set', r).accepted, false);
});

test('library backup: a record count over the per-kind limit refuses the whole backup', () => {
  const puzzles = Array.from({ length: MAX_BACKUP_RECORDS + 1 }, (_, i) => ({
    ...basePuzzle(),
    id: `p${i}`,
  }));
  const parsed = parseBackup(buildBackup({ puzzles }));
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.puzzles, []);
});

test('library backup: a record count at the per-kind limit is accepted', () => {
  const sets = Array.from({ length: MAX_BACKUP_RECORDS }, (_, i) => ({
    ...baseSet(),
    setId: `s${i}`,
  }));
  assert.equal(parseBackup(buildBackup({ sets })).sets.length, MAX_BACKUP_RECORDS);
});
