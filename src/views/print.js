// Placeholder. The library lane replaces this with the print view.
let root = null;

export function mount(el, params = {}) {
  root = document.createElement('h1');
  root.textContent = `Print ${params.id ?? ''}`;
  el.append(root);
}

export function unmount() {
  root = null;
}
