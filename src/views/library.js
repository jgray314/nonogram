// Placeholder. The library lane replaces this.
let heading = null;

export function mount(el) {
  heading = document.createElement('h1');
  heading.textContent = 'Library';
  el.append(heading);
}

export function unmount() {
  heading?.remove();
  heading = null;
}
