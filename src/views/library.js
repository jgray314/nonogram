// Library view: saved puzzles, backup export/import, sample loader.
import { importLibrary, exportLibrary, exportXml } from './library-backup.js';
import { createStore } from '../store.js';
import { loadSamples } from '../samples.js';
import { libraryModel } from '../library-logic.js';
import { elc } from './dom.js';
import { lib, button, say, forThisMount } from './library-state.js';
import { setNode } from './library-sets.js';

let root = null;
let listEl = null;

function ensureCss(href) {
  if (document.querySelector(`link[data-nng-css="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.nngCss = href;
  document.head.append(link);
}

function link(label, href) {
  const a = elc('a', 'nng-btn', label);
  a.href = href;
  return a;
}

function deletePuzzle(id, name) {
  if (!confirm(`Delete "${name}" and its saved progress? This can't be undone.`)) return;
  lib.store.remove('puzzle', id);
  render();
}

async function addSamples() {
  const ui = forThisMount();
  const { added, skipped } = await loadSamples(lib.store);
  ui(() => {
    render();
    say(
      `Added ${added} sample puzzle${added === 1 ? '' : 's'}${skipped ? `, ${skipped} already present` : ''}.`,
    );
  });
}

/** A script-free "More" menu: Print, export for other solvers, and a tucked-away Delete. */
function moreMenu(row) {
  const menu = elc('details', 'nng-more');
  menu.append(elc('summary', null, 'More'));
  const panel = elc('div', 'nng-more-panel');
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
  const item = elc('li', 'nng-lib-row');
  const info = elc('div', 'nng-lib-info');
  const heading = elc('strong', 'nng-lib-title', row.name);
  info.append(heading);
  // D15: the stored title keeps its prefix; the row shows the name plus a badge.
  if (row.ai) info.append(' ', elc('span', 'nng-badge nng-badge-ai', 'AI test sample'));
  const meta = elc('div', 'nng-lib-meta');
  // One fairness label per row: the difficulty label, flagged when it is a warning.
  const fairness = elc(
    'span',
    row.badge ? `nng-badge nng-badge-${row.badge.replace(' ', '-')}` : 'nng-lib-label',
    row.label,
  );
  meta.append(elc('span', null, row.size), fairness);
  // D27: a color puzzle says so, with one dot per ink in the palette's order.
  if (row.colors) {
    const n = row.colors.length;
    const badge = elc('span', 'nng-badge nng-badge-color', 'Color');
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', `Color puzzle, ${n} ${n === 1 ? 'color' : 'colors'}`);
    for (const hex of row.colors) {
      const dot = elc('span', 'nng-color-dot');
      dot.style.setProperty('--ink', hex);
      badge.append(dot);
    }
    meta.append(badge);
  }
  const progress = row.progress === 'solved' ? '✓ solved' : row.progress;
  meta.append(elc('span', `nng-progress nng-progress-${row.progress.replace(' ', '-')}`, progress));
  // D20: shown only below 600px wide (css/library.css).
  if (row.large) meta.append(elc('span', 'nng-badge nng-badge-large', 'Best on a big screen'));
  info.append(meta);

  const actions = elc('div', 'nng-lib-actions');
  const play = link('Play', `#/play/${encodeURIComponent(row.id)}`);
  play.classList.add('nng-btn-primary');
  actions.append(play, moreMenu(row));
  item.append(info, actions);
  return item;
}

function render() {
  const model = libraryModel(lib.store);
  listEl.replaceChildren();
  if (model.skipped > 0) {
    listEl.append(elc('p', 'nng-warn', `${model.skipped} corrupt records skipped`));
  }
  if (model.rows.length === 0 && model.sets.length === 0) {
    listEl.append(
      elc('p', 'nng-empty', 'No puzzles yet. Create one, import a backup, or load the samples.'),
    );
  }
  if (model.rows.length > 0) {
    const ul = elc('ul', 'nng-lib-list');
    for (const row of model.rows) ul.append(rowNode(row));
    listEl.append(ul);
  }
  if (model.sets.length > 0) {
    const wrap = elc('div', 'nng-sets');
    wrap.append(elc('h2', null, 'Sets'));
    for (const set of model.sets) wrap.append(setNode(set));
    listEl.append(wrap);
  }
}

export function mount(el0) {
  lib.generation += 1;
  ensureCss('css/library.css');
  lib.store = createStore();
  root = elc('section', 'nng-library');
  root.append(elc('h1', null, 'Library'));

  const toolbar = elc('div', 'nng-lib-toolbar');
  const file = elc('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.hidden = true;
  file.addEventListener('change', async () => {
    const chosen = file.files[0];
    file.value = '';
    if (chosen) await importLibrary(chosen);
  });
  lib.toolbarButtons = [
    button('Export library', exportLibrary),
    button('Import library', () => file.click()),
    button('Load sample puzzles', addSamples),
  ];
  toolbar.append(...lib.toolbarButtons, file);
  lib.status = elc('p', 'nng-lib-status');
  lib.status.setAttribute('role', 'status');
  listEl = elc('div', 'nng-lib-content');
  root.append(toolbar, lib.status, listEl);
  el0.append(root);
  lib.render = render;
  render();
}

export function unmount() {
  lib.generation += 1;
  root?.remove();
  root = null;
  lib.store = null;
  lib.status = null;
  listEl = null;
  lib.toolbarButtons = [];
}
