// Hash router. Each route maps to a view module exporting mount(el, params)
// and unmount(). Routes: #/library (default), #/create, #/play/<id>, #/print/<id>.
import * as library from './views/library.js';
import * as create from './views/create.js';
import * as play from './views/play.js';
import * as print from './views/print.js';
import { createStore } from './store.js';
import { initTheme } from './theme.js';
import { applyFeatureParam, hashPath } from './features.js';

const ROUTES = {
  library: { view: library, nav: 'library' },
  create: { view: create, nav: 'create' },
  play: { view: play, nav: null },
  print: { view: print, nav: null },
};
const DEFAULT = '#/library';

const store = createStore();
const main = document.getElementById('view');
let current = null;

function parse(hash) {
  const [, name, ...rest] = hashPath(hash).split('/');
  if (!Object.hasOwn(ROUTES, name)) return null;
  let id;
  try {
    id = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  } catch {
    return null; // a malformed escape falls back to the default route
  }
  if ((name === 'play' || name === 'print') && !id) return null;
  return { name, params: id === undefined ? {} : { id } };
}

function render() {
  applyFeatureParam(store, location.hash);
  const route = parse(location.hash);
  if (!route) {
    location.hash = DEFAULT; // fires hashchange, which renders
    return;
  }
  if (current) current.unmount();
  main.replaceChildren();
  current = ROUTES[route.name].view;
  current.mount(main, route.params);
  for (const a of document.querySelectorAll('.nng-nav a')) {
    a.classList.toggle('active', a.dataset.route === ROUTES[route.name].nav);
  }
}

initTheme(store, document.getElementById('theme-toggle'));
window.addEventListener('hashchange', render);
render();
