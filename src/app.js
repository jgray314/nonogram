// Hash router. Each route maps to a view module exporting mount(el, params)
// and unmount(). Routes: #/library (default), #/create, #/play/<id>, #/print/<id>.
import * as library from './views/library.js';
import * as create from './views/create.js';
import * as play from './views/play.js';
import * as print from './views/print.js';

const ROUTES = {
  library: { view: library, nav: 'library' },
  create: { view: create, nav: 'create' },
  play: { view: play, nav: null },
  print: { view: print, nav: null },
};
const DEFAULT = '#/library';

const main = document.getElementById('view');
let current = null;

function parse(hash) {
  const [, name, ...rest] = hash.split('/');
  if (!Object.hasOwn(ROUTES, name)) return null;
  const id = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  if ((name === 'play' || name === 'print') && !id) return null;
  return { name, params: id === undefined ? {} : { id } };
}

function render() {
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

window.addEventListener('hashchange', render);
render();
