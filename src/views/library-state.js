// Library view state shared by library.js and the files split from it (a leaf: imports only dom.js).
import { elc } from './dom.js';

// Every field is read at call time, never copied. unmount clears the fields
// but must not replace this object; `generation` is only ever incremented.
export const lib = {
  store: null,
  status: null,
  // The toolbar's Export, Import and Load sample buttons; disabled while an import runs.
  toolbarButtons: [],
  // Bumped by mount and unmount; async work checks it before touching the page.
  generation: 0,
  // Set by mount before the first render, so files that cannot import library.js can redraw.
  render: null,
};

export function button(label, onClick) {
  const b = elc('button', 'nng-btn', label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function say(message) {
  lib.status.textContent = message;
}

/**
 * Runs `fn` only while the mount that started an async task is still live, so a
 * task that outlives the view (the player navigated away mid-import) still
 * finishes its writes but never touches a torn-down page.
 */
export function forThisMount() {
  const gen = lib.generation;
  return (fn) => {
    if (gen === lib.generation) fn();
  };
}
