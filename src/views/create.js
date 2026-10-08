// Placeholder. The creator lane replaces this.
let heading = null;

export function mount(el) {
  heading = document.createElement('h1');
  heading.textContent = 'Create';
  el.append(heading);
}

export function unmount() {
  heading?.remove();
  heading = null;
}
