// Helpers for the library line-cap UX checks (pipeline-linecap-library.js).
// Records are built here from first principles (ids from puzzleId, verdicts from
// the pure solver), so the expected values never come from the view under test.
import { puzzleId } from '../../src/format.js';
import { createStore } from '../../src/store.js';
import { expectedVerdict } from './expected-verdict.js';
import { pickFile, resetStore, waitFor } from './harness.js';

export const BLACK = [{ name: 'black', hex: '#000000' }];
export const TWO_INKS = [
  { name: 'red', hex: '#cc2222' },
  { name: 'blue', hex: '#2244cc' },
];
export const LIB_FILE = '.nng-lib-toolbar input[type=file]';

/**
 * A puzzle record from digit rows ('0' blank). The id is the real content hash.
 * @param {string} title
 * @param {string[]} rows
 * @param {{ palette?: any[], set?: any, blank?: string }} [opts]
 * @returns {Promise<any>}
 */
export async function makePuzzle(title, rows, { palette = BLACK, set, blank } = {}) {
  const p = {
    v: 1,
    id: '',
    title,
    width: rows[0].length,
    height: rows.length,
    palette,
    solution: rows.map((r) => [...r].map(Number)),
    verdict: null,
  };
  if (set) p.set = set;
  if (blank) p.blank = blank;
  p.id = await puzzleId(p);
  p.verdict = expectedVerdict(p);
  return p;
}

/** A valid in-progress save for `puzzle`. */
export function makeSave(puzzle) {
  const cells = puzzle.solution.map((r) => r.map(() => 0));
  cells[0][0] = -1;
  return {
    puzzleId: puzzle.id,
    cells,
    elapsedMs: 4321,
    rules: { zen: false },
    solvedAt: null,
    hearts: 2,
    hints: 1,
  };
}

export function makeSet(setId, title, tiles, cols) {
  return { v: 1, setId, title, rows: tiles.length / cols, cols, tileIds: tiles.map((t) => t.id) };
}

/** A record as an importer sees it: a verdict that is false on purpose. */
export function withFalseVerdict(p) {
  const real = p.verdict.status;
  return {
    ...p,
    verdict:
      real === 'multiple'
        ? { status: 'unique-line-solvable', sweeps: 1 }
        : { status: 'multiple', sweeps: 0 },
  };
}

export const backupText = ({ puzzles = [], saves = [], sets = [] }) =>
  JSON.stringify({ kind: 'nng-backup', v: 1, puzzles, saves, sets });

/** The frame's store, for reading and for seeding. */
export const storeOf = (app) => createStore(app.win().localStorage);
export const rawOf = (app, kind, id) => app.win().localStorage.getItem(`nng:${kind}:${id}`);
export const nngKeys = (app) =>
  Object.keys(app.win().localStorage).filter(
    (k) => k.startsWith('nng:') && !k.startsWith('nng:pref:'),
  );

/** Open the library with exactly the given records in storage. */
export async function openLibraryWith(app, { puzzles = [], saves = [], sets = [] } = {}) {
  await app.open('#/library');
  resetStore(app);
  const store = storeOf(app);
  for (const p of puzzles) store.put('puzzle', p);
  for (const s of sets) store.put('set', s);
  for (const s of saves) store.put('save', s);
  await app.open('#/library');
}

export const statusText = (app) => app.$('.nng-lib-status')?.textContent ?? '';

export function toolbarButtons(app) {
  return app.$$('.nng-lib-toolbar button');
}

/** Hand the library a backup file, as the Import button's file picker would. */
export function importText(app, text, name = 'backup.json') {
  const blob = new (app.win().Blob)([text], { type: 'application/json' });
  pickFile(app, LIB_FILE, blob, name);
}

/** Wait for an import to end: a status that begins "Import" (done, failed or stopped). */
export async function importDone(app, ms = 20000) {
  await waitFor(() => /^Import/.test(statusText(app)), 'the import to end', ms);
  return statusText(app);
}

/**
 * Replace the frame's Worker with a counting wrapper. Options: `hold` keeps
 * every message back until `release()`; `failPost` makes postMessage throw;
 * `failCtor` makes `new Worker` throw.
 */
export function hookWorker(app, { hold = false, failPost = false, failCtor = false } = {}) {
  const win = app.win();
  const Real = win.Worker;
  let open;
  const gate = new Promise((r) => (open = r));
  const stats = {
    created: 0,
    terminated: 0,
    release: () => open(),
    restore: () => {
      win.Worker = Real;
    },
  };
  win.Worker = class extends Real {
    constructor(...args) {
      if (failCtor) throw new Error('no worker');
      super(...args);
      stats.created += 1;
    }
    postMessage(...args) {
      if (failPost) throw new Error('post failed');
      if (!hold) return super.postMessage(...args);
      gate.then(() => super.postMessage(...args));
    }
    terminate() {
      stats.terminated += 1;
      super.terminate();
    }
  };
  return stats;
}

/** Make the `n`th app write to localStorage (counted from now) throw a quota error. */
export function failNthWrite(app, n) {
  const proto = app.win().Storage.prototype;
  const real = proto.setItem;
  const stats = {
    writes: 0,
    restore: () => {
      proto.setItem = real;
    },
  };
  proto.setItem = function setItem(key, value) {
    if (String(key).startsWith('nng:')) {
      stats.writes += 1;
      if (stats.writes === n) throw new Error('quota exceeded');
    }
    return real.call(this, key, value);
  };
  return stats;
}

/** Collect uncaught errors and unhandled rejections in the frame. */
export function trapErrors(app) {
  const win = app.win();
  const errors = [];
  win.addEventListener('error', (e) => errors.push(String(e.message)));
  win.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
  return errors;
}
