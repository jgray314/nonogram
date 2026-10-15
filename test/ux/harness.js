// Helpers for the browser UX checks (ux-checks.html). They drive the real app
// in an iframe, the way the UX reviewer did by hand: navigate, press, drag,
// and read what is on screen. Browser only; not part of `npm test`.

/** Wait until `fn()` returns something truthy, or throw after `ms`. */
export async function waitFor(fn, what, ms = 2000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export function createApp(frame) {
  const win = () => frame.contentWindow;
  const doc = () => frame.contentDocument;
  const $ = (sel) => doc().querySelector(sel);
  const $$ = (sel) => [...doc().querySelectorAll(sel)];

  /** Load the app fresh at `hash`, so every check starts from a clean mount. */
  async function open(hash, width = 1024) {
    frame.style.width = `${width}px`;
    frame.src = `index.html?ux=${Date.now()}${hash}`;
    await new Promise((r) => frame.addEventListener('load', r, { once: true }));
    // Behave like a tab the player is looking at. A hidden browser pane reports
    // document.hidden, which stops the play timer, so a timing check would pass
    // whatever the app did (a restart check once passed with its fix removed).
    Object.defineProperty(doc(), 'hidden', { configurable: true, get: () => false });
    await waitFor(() => $('#view')?.firstElementChild, `view for ${hash}`);
  }

  async function go(hash) {
    win().location.hash = hash;
    await pause(80);
  }

  const cell = (r, c, scope = '') => $(`${scope} .nng-cell[data-r="${r}"][data-c="${c}"]`);

  /** A stroke along `path` ([[r, c], ...]); button 0 fills, 2 crosses. */
  function stroke(path, button = 0, scope = '') {
    const fire = (node, type) =>
      node.dispatchEvent(new (win().PointerEvent)(type, { bubbles: true, button }));
    const nodes = path.map(([r, c]) => cell(r, c, scope));
    fire(nodes[0], 'pointerdown');
    for (const n of nodes.slice(1)) fire(n, 'pointerover');
    fire(nodes[nodes.length - 1], 'pointerup');
  }

  const buttonByText = (text, scope = '') =>
    $$(`${scope} button`).find((b) => b.textContent.trim() === text);

  const toggleByLabel = (text) =>
    $$('.nng-rules label')
      .find((l) => l.textContent.trim() === text)
      ?.querySelector('input');

  /** Run `fn` with the app's confirm() answering `answer`; returns how often it was asked. */
  async function withConfirm(answer, fn) {
    const real = win().confirm;
    let asked = 0;
    win().confirm = () => {
      asked += 1;
      return answer;
    };
    try {
      await fn();
    } finally {
      win().confirm = real;
    }
    return asked;
  }

  return { win, doc, $, $$, open, go, cell, stroke, buttonByText, toggleByLabel, withConfirm };
}
