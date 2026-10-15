// Library view: saved puzzles, backup export/import, sample loader.
import { idMatches } from '../format.js';
import { createStore } from '../store.js';
import { toWebpbn } from '../webpbn.js';
import { buildBackup, parseBackup, planImport, ratePlan } from '../backup.js';
import { createSolverClient, ratePuzzleWith } from '../solver-client.js';
import { loadSamples } from '../samples.js';
import { libraryModel, safeFilename, tileSolved, tileFace } from '../library-logic.js';

let root = null;
let store = null;
let status = null;
let listEl = null;
// The toolbar's Export, Import and Load sample buttons; disabled while an import runs.
let toolbarButtons = [];
// Bumped by mount and unmount; async work checks it before touching the page.
let generation = 0;

function ensureCss(href) {
  if (document.querySelector(`link[data-nng-css="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.nngCss = href;
  document.head.append(link);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, onClick) {
  const b = el('button', 'nng-btn', label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function link(label, href) {
  const a = el('a', 'nng-btn', label);
  a.href = href;
  return a;
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function say(message) {
  status.textContent = message;
}

function exportXml(id) {
  const puzzle = store.get('puzzle', id);
  if (!puzzle) return say('That puzzle no longer exists.');
  download(`${safeFilename(puzzle.title)}.xml`, toWebpbn(puzzle), 'application/xml');
}

function deletePuzzle(id, name) {
  if (!confirm(`Delete "${name}" and its saved progress? This can't be undone.`)) return;
  store.remove('puzzle', id);
  render();
}

function exportLibrary() {
  const puzzles = store.list('puzzle');
  const saves = store.list('save');
  const sets = store.list('set');
  const text = buildBackup({ puzzles: puzzles.records, saves: saves.records, sets: sets.records });
  const stamp = new Date().toISOString().slice(0, 10);
  download(`nonogram-library-${stamp}.json`, text, 'application/json');
  const lost = puzzles.skipped + saves.skipped + sets.skipped;
  // Corrupt records cannot be exported; say so rather than imply a full backup.
  say(
    lost
      ? `Library exported. ${lost} corrupt record${lost === 1 ? ' was' : 's were'} left out.`
      : 'Library exported.',
  );
}

/**
 * Runs `fn` only while the mount that started an async task is still live, so a
 * task that outlives the view (the player navigated away mid-import) still
 * finishes its writes but never touches a torn-down page (gate pass 1, L7).
 */
function forThisMount() {
  const gen = generation;
  return (fn) => {
    if (gen === generation) fn();
  };
}

/**
 * Imports re-solve every new puzzle, which can take a while, so the other
 * toolbar actions stay off until it ends (gate pass 6, L2). Re-enabling goes
 * through `ui`, so a later mount's fresh buttons are never touched.
 */
async function importLibrary(file) {
  const ui = forThisMount();
  for (const b of toolbarButtons) b.disabled = true;
  try {
    await runImport(file, ui);
  } finally {
    ui(() => {
      for (const b of toolbarButtons) b.disabled = false;
    });
  }
}

async function runImport(file, ui) {
  // Keep this mount's store: unmount clears the module's `store`.
  const store0 = store;
  const parsed = parseBackup(await file.text(), (id) => store0.get('puzzle', id));
  if (!parsed.ok) return ui(() => say(`Import failed: ${parsed.error}.`));
  // Reject puzzles whose id is not the hash of their content, and their saves.
  const forged = new Set();
  for (const p of parsed.puzzles) if (!(await idMatches(p))) forged.add(p.id);
  if (forged.size) {
    parsed.puzzles = parsed.puzzles.filter((p) => !forged.has(p.id));
    parsed.saves = parsed.saves.filter((s) => !forged.has(s.puzzleId));
    for (const id of forged)
      parsed.skipped.push({ kind: 'puzzle', id, error: 'id does not match content' });
  }
  let plan = planImport(parsed, {
    puzzles: store0.list('puzzle').records.map((p) => p.id),
    saves: store0.list('save').records.map((s) => s.puzzleId),
    sets: store0.list('set').records.map((s) => s.setId),
  });
  // An imported verdict is only a claim: re-solve each puzzle that will be written.
  const toCheck = plan.filter((w) => w.kind === 'puzzle').length;
  if (toCheck) {
    const checking = (done) =>
      ui(() => say(`Checking ${done} of ${toCheck} imported puzzle${toCheck === 1 ? '' : 's'}…`));
    checking(0);
    // Created inside the try: `new Worker` can throw synchronously.
    let solver;
    try {
      solver = createSolverClient();
      plan = await ratePlan(plan, ratePuzzleWith(solver), checking);
    } catch {
      return ui(() =>
        say('Import failed: the solver could not check the puzzles. Nothing was imported.'),
      );
    } finally {
      solver?.terminate();
    }
  }
  let written = 0;
  try {
    for (const { kind, record } of plan) {
      store0.put(kind, record);
      written += 1;
    }
  } catch (e) {
    return ui(() => {
      render();
      say(`Import stopped after ${written} of ${plan.length} records: ${e.message}.`);
    });
  }
  const valid = parsed.puzzles.length + parsed.saves.length + parsed.sets.length;
  const parts = [`Imported ${plan.length} record${plan.length === 1 ? '' : 's'}`];
  if (valid > plan.length) parts.push(`${valid - plan.length} already existed`);
  if (parsed.skipped.length) {
    const why = parsed.skipped
      .slice(0, 3)
      .map((s) => `${s.kind} ${s.id}: ${s.error}`)
      .join('; ');
    parts.push(
      `${parsed.skipped.length} invalid skipped (${why}${parsed.skipped.length > 3 ? '; ...' : ''})`,
    );
  }
  // Only puzzles this import wrote: an existing puzzle keeps its own art.
  const dropped = new Set(parsed.artDroppedIds);
  const n = plan.filter((w) => w.kind === 'puzzle' && dropped.has(w.record.id)).length;
  if (n) {
    parts.push(`${n} picture${n === 1 ? '' : 's'} dropped (not a small JPEG)`);
  }
  ui(() => {
    render();
    say(`${parts.join(', ')}.`);
  });
}

async function addSamples() {
  const ui = forThisMount();
  const { added, skipped } = await loadSamples(store);
  ui(() => {
    render();
    say(
      `Added ${added} sample puzzle${added === 1 ? '' : 's'}${skipped ? `, ${skipped} already present` : ''}.`,
    );
  });
}

/** A script-free "More" menu: Print, export for other solvers, and a tucked-away Delete. */
function moreMenu(row) {
  const menu = el('details', 'nng-more');
  menu.append(el('summary', null, 'More'));
  const panel = el('div', 'nng-more-panel');
  const del = button('Delete', () => deletePuzzle(row.id, row.name));
  del.classList.add('nng-btn-danger');
  panel.append(
    link('Print', `#/print/${encodeURIComponent(row.id)}`),
    button('Export for other solvers (webpbn)', () => exportXml(row.id)),
    del,
  );
  menu.append(panel);
  return menu;
}

function rowNode(row) {
  const item = el('li', 'nng-lib-row');
  const info = el('div', 'nng-lib-info');
  const heading = el('strong', 'nng-lib-title', row.name);
  info.append(heading);
  // D15: the stored title keeps its prefix; the row shows the name plus a badge.
  if (row.ai) info.append(' ', el('span', 'nng-badge nng-badge-ai', 'AI test sample'));
  const meta = el('div', 'nng-lib-meta');
  // One fairness label per row: the difficulty label, flagged when it is a warning.
  const fairness = el(
    'span',
    row.badge ? `nng-badge nng-badge-${row.badge.replace(' ', '-')}` : 'nng-lib-label',
    row.label,
  );
  meta.append(el('span', null, row.size), fairness);
  const progress = row.progress === 'solved' ? '✓ solved' : row.progress;
  meta.append(el('span', `nng-progress nng-progress-${row.progress.replace(' ', '-')}`, progress));
  // D20: shown only below 600px wide (css/library.css).
  if (row.large) meta.append(el('span', 'nng-badge nng-badge-large', 'Best on a big screen'));
  info.append(meta);

  const actions = el('div', 'nng-lib-actions');
  const play = link('Play', `#/play/${encodeURIComponent(row.id)}`);
  play.classList.add('nng-btn-primary');
  actions.append(play, moreMenu(row));
  item.append(info, actions);
  return item;
}

function render() {
  const model = libraryModel(store);
  listEl.replaceChildren();
  if (model.skipped > 0) {
    listEl.append(el('p', 'nng-warn', `${model.skipped} corrupt records skipped`));
  }
  if (model.rows.length === 0 && model.sets.length === 0) {
    listEl.append(
      el('p', 'nng-empty', 'No puzzles yet. Create one, import a backup, or load the samples.'),
    );
  }
  if (model.rows.length > 0) {
    const ul = el('ul', 'nng-lib-list');
    for (const row of model.rows) ul.append(rowNode(row));
    listEl.append(ul);
  }
  if (model.sets.length > 0) {
    const wrap = el('div', 'nng-sets');
    wrap.append(el('h2', null, 'Sets'));
    for (const set of model.sets) wrap.append(setNode(set));
    listEl.append(wrap);
  }
}

/** Draw a solved tile's solution as small cells on a canvas. */
function solutionCanvas(puzzle) {
  const scale = Math.max(1, Math.floor(96 / Math.max(puzzle.width, puzzle.height)));
  const canvas = document.createElement('canvas');
  canvas.width = puzzle.width * scale;
  canvas.height = puzzle.height * scale;
  const ctx = canvas.getContext('2d');
  puzzle.solution.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v < 1) return;
      ctx.fillStyle = puzzle.palette[v - 1].hex;
      ctx.fillRect(c * scale, r * scale, scale, scale);
    }),
  );
  return canvas;
}

function tileNode(set, index) {
  const id = set.tileIds[index];
  const row = Math.floor(index / set.cols);
  const col = index % set.cols;
  const puzzle = id === null ? undefined : set.tiles[id];
  const label = `${row + 1},${col + 1}`;
  if (!puzzle) {
    const missing = el('div', 'nng-tile nng-tile-missing', `${label} missing`);
    return missing;
  }
  const solved = tileSolved(puzzle, set.saves[id]);
  const tile = el('a', `nng-tile ${solved ? 'nng-tile-solved' : 'nng-tile-open'}`);
  tile.href = `#/play/${encodeURIComponent(id)}`;
  tile.title = `${set.title} tile ${label}`;
  // D24: a finished set shows the source photo, each tile its own crop, so
  // together they read as the whole image. A tile without a crop keeps its cells.
  const face = tileFace(puzzle, solved, set.progress.complete);
  if (face === 'art') {
    const img = el('img', 'nng-tile-art');
    img.src = puzzle.art;
    img.alt = '';
    tile.append(img);
  } else if (face === 'cells') tile.append(solutionCanvas(puzzle));
  else tile.textContent = label;
  return tile;
}

/**
 * Tile box size: 96px on the longer side, at the tiles' aspect, so a finished
 * set has no letterboxing. Create slices evenly, so every tile in a set shares
 * the first tile's size.
 */
function tileBox(set) {
  const first = set.tiles[set.tileIds.find((id) => id !== null && set.tiles[id])];
  if (!first) return { w: 96, h: 96 };
  const s = 96 / Math.max(first.width, first.height);
  return { w: Math.round(first.width * s), h: Math.round(first.height * s) };
}

function setNode(set) {
  const box = el('div', 'nng-set');
  const head = el('div', 'nng-set-head');
  head.append(
    el('strong', null, set.title),
    el('span', 'nng-lib-meta', `${set.rows} x ${set.cols}`),
    el(
      'span',
      'nng-set-progress',
      set.progress.complete
        ? '✓ complete'
        : `${set.progress.solved} / ${set.progress.total} solved`,
    ),
  );
  const del = button('Delete set', () => deleteSet(set));
  head.append(del);
  // A finished set drops the gaps between tiles so it reads as one picture.
  const mosaic = el('div', `nng-mosaic${set.progress.complete ? ' nng-mosaic-complete' : ''}`);
  if (set.progress.complete) {
    const { w, h } = tileBox(set);
    mosaic.style.setProperty('--tile-w', `${w}px`);
    mosaic.style.setProperty('--tile-h', `${h}px`);
  }
  mosaic.style.gridTemplateColumns = `repeat(${set.cols}, var(--tile-w, 96px))`;
  for (let i = 0; i < set.tileIds.length; i++) mosaic.append(tileNode(set, i));
  box.append(head, mosaic);
  return box;
}

function deleteSet(set) {
  if (!confirm(`Delete set "${set.title}", all its tiles and their progress?`)) return;
  for (const id of Object.keys(set.tiles)) store.remove('puzzle', id);
  store.remove('set', set.setId);
  render();
}

export function mount(el0) {
  generation += 1;
  ensureCss('css/library.css');
  store = createStore();
  root = el('section', 'nng-library');
  root.append(el('h1', null, 'Library'));

  const toolbar = el('div', 'nng-lib-toolbar');
  const file = el('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.hidden = true;
  file.addEventListener('change', async () => {
    const chosen = file.files[0];
    file.value = '';
    if (chosen) await importLibrary(chosen);
  });
  toolbarButtons = [
    button('Export library', exportLibrary),
    button('Import library', () => file.click()),
    button('Load sample puzzles', addSamples),
  ];
  toolbar.append(...toolbarButtons, file);
  status = el('p', 'nng-lib-status');
  status.setAttribute('role', 'status');
  listEl = el('div', 'nng-lib-content');
  root.append(toolbar, status, listEl);
  el0.append(root);
  render();
}

export function unmount() {
  generation += 1;
  root?.remove();
  root = null;
  store = null;
  status = null;
  listEl = null;
  toolbarButtons = [];
}
