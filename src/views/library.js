// Library view: saved puzzles, backup export/import, sample loader.
import { createStore } from '../store.js';
import { toWebpbn } from '../webpbn.js';
import { buildBackup, parseBackup, planImport } from '../backup.js';
import { loadSamples } from '../samples.js';
import { libraryModel, safeFilename } from '../library-logic.js';

let root = null;
let store = null;
let status = null;
let listEl = null;

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

function deletePuzzle(id, title) {
  if (!confirm(`Delete "${title}" and its saved progress?`)) return;
  store.remove('puzzle', id);
  render();
}

function exportLibrary() {
  const text = buildBackup({
    puzzles: store.list('puzzle').records,
    saves: store.list('save').records,
    sets: store.list('set').records,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  download(`nonogram-library-${stamp}.json`, text, 'application/json');
  say('Library exported.');
}

async function importLibrary(file) {
  const parsed = parseBackup(await file.text(), (id) => store.get('puzzle', id));
  if (!parsed.ok) return say(`Import failed: ${parsed.error}.`);
  const plan = planImport(parsed, {
    puzzles: store.list('puzzle').records.map((p) => p.id),
    saves: store.list('save').records.map((s) => s.puzzleId),
    sets: store.list('set').records.map((s) => s.setId),
  });
  for (const { kind, record } of plan) store.put(kind, record);
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
  render();
  say(`${parts.join(', ')}.`);
}

async function addSamples() {
  const { added, skipped } = await loadSamples(store);
  render();
  say(
    `Added ${added} sample puzzle${added === 1 ? '' : 's'}${skipped ? `, ${skipped} already present` : ''}.`,
  );
}

function rowNode(row) {
  const item = el('li', 'nng-lib-row');
  const info = el('div', 'nng-lib-info');
  info.append(el('strong', 'nng-lib-title', row.title));
  const meta = el('div', 'nng-lib-meta');
  meta.append(el('span', null, row.size), el('span', null, row.label));
  if (row.badge)
    meta.append(el('span', `nng-badge nng-badge-${row.badge.replace(' ', '-')}`, row.badge));
  const progress = row.progress === 'solved' ? '✓ solved' : row.progress;
  meta.append(el('span', `nng-progress nng-progress-${row.progress.replace(' ', '-')}`, progress));
  info.append(meta);

  const actions = el('div', 'nng-lib-actions');
  actions.append(
    link('Play', `#/play/${encodeURIComponent(row.id)}`),
    link('Print', `#/print/${encodeURIComponent(row.id)}`),
    button('Export webpbn XML', () => exportXml(row.id)),
    button('Delete', () => deletePuzzle(row.id, row.title)),
  );
  item.append(info, actions);
  return item;
}

function render() {
  const model = libraryModel(store);
  listEl.replaceChildren();
  if (model.skipped > 0) {
    listEl.append(el('p', 'nng-warn', `${model.skipped} corrupt records skipped`));
  }
  if (model.rows.length === 0) {
    listEl.append(
      el('p', 'nng-empty', 'No puzzles yet. Create one, import a backup, or load the samples.'),
    );
  } else {
    const ul = el('ul', 'nng-lib-list');
    for (const row of model.rows) ul.append(rowNode(row));
    listEl.append(ul);
  }
}

export function mount(el0) {
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
  toolbar.append(
    button('Export library', exportLibrary),
    button('Import library', () => file.click()),
    button('Load sample puzzles', addSamples),
    file,
  );
  status = el('p', 'nng-lib-status');
  status.setAttribute('role', 'status');
  listEl = el('div', 'nng-lib-content');
  root.append(toolbar, status, listEl);
  el0.append(root);
  render();
}

export function unmount() {
  root?.remove();
  root = null;
  store = null;
  status = null;
  listEl = null;
}
