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

/** Set `blob` as a File named `name` on the frame's input `sel`, then fire a bubbling change. */
function setFile(app, sel, blob, name) {
  const input = app.$(sel);
  if (!input) throw new Error(`no input matches ${sel}`);
  const win = app.win();
  const file = new win.File([blob], name, { type: blob.type });
  const dt = new win.DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
}

/**
 * Fetch `url` (relative to the app origin) and set it on the Create view's file
 * input, which must already be mounted (#/create). Resolves once the crop
 * preview and the grid have rendered.
 */
export async function uploadImage(app, url) {
  const res = await app.win().fetch(url);
  if (!res.ok) throw new Error(`could not fetch ${url}: ${res.status}`);
  const blob = await res.blob();
  setFile(app, 'input[type=file]', blob, url.split('/').pop());
  await waitFor(
    () => app.$('.nng-create-preview-wrap') && !app.$('.nng-create-preview-wrap').hidden,
    `preview for ${url}`,
    5000,
  );
  await waitFor(() => app.$('.nng-create .nng-cell'), `grid for ${url}`, 5000);
}

/**
 * Open #/create, upload `url`, wait for the live solver report to show a verdict
 * from the real worker, press Save to library, and return the saved puzzle id.
 * The id is read from the "Play it" link the save message renders
 * (href #/play/<id>), which only appears after a successful store write.
 * Create defaults to two-tone: pass `opts.colors` (3 to 5, the total including
 * the blank) to make a color puzzle.
 * @param {ReturnType<typeof createApp>} app
 * @param {string} url
 * @param {{ colors?: number }} [opts]
 */
export async function createAndSave(app, url, opts = {}) {
  await app.open('#/create');
  await uploadImage(app, url);
  if (opts.colors) {
    const select = [...app.$$('.nng-create select')].find((s) =>
      [...s.options].some((o) => o.text === 'Two-tone'),
    );
    if (!select) throw new Error('no Colors select in Create');
    select.value = String(opts.colors);
    select.dispatchEvent(new (app.win().Event)('change', { bubbles: true }));
    await waitFor(() => app.$('.nng-create .nng-cell'), 'color grid', 5000);
  }
  const save = await waitFor(
    () => {
      const b = app.buttonByText('Save to library');
      return b && !b.disabled ? b : null;
    },
    'solver verdict (Save enabled)',
    15000,
  );
  save.click();
  const link = await waitFor(
    () => app.$('.nng-create-save-msg a[href^="#/play/"]'),
    'saved message with Play link',
    5000,
  );
  return decodeURIComponent(link.getAttribute('href').slice('#/play/'.length));
}

/**
 * Run `fn` with the frame's downloads captured instead of performed: stubs
 * URL.createObjectURL (to remember the Blob) and HTMLAnchorElement.click (so the
 * anchor's download attribute is read and nothing is saved), restoring both
 * afterwards. Resolves { name, blob, text() } for the last download `fn` made.
 */
export async function captureDownload(app, fn) {
  const win = app.win();
  const realCreate = win.URL.createObjectURL;
  const realClick = win.HTMLAnchorElement.prototype.click;
  const blobs = new Map();
  /** @type {{ name: string, blob: Blob, text: () => Promise<string> } | null} */
  let captured = null;
  win.URL.createObjectURL = (obj) => {
    const url = realCreate.call(win.URL, obj);
    blobs.set(url, obj);
    return url;
  };
  win.HTMLAnchorElement.prototype.click = function click() {
    if (this.hasAttribute('download')) {
      const blob = blobs.get(this.href);
      captured = { name: this.getAttribute('download'), blob, text: () => blob.text() };
      return;
    }
    return realClick.call(this);
  };
  try {
    await fn();
    await pause(50);
  } finally {
    win.URL.createObjectURL = realCreate;
    win.HTMLAnchorElement.prototype.click = realClick;
  }
  if (!captured) throw new Error('no download was triggered');
  return captured;
}

/** Set a File built from `blob` (named `name`) on the frame's input `inputSelector` and fire change. */
export function pickFile(app, inputSelector, blob, name) {
  setFile(app, inputSelector, blob, name);
}

/** Remove every localStorage key starting with `nng:` in the frame. */
export function resetStore(app) {
  const ls = app.win().localStorage;
  for (const key of Object.keys(ls)) if (key.startsWith('nng:')) ls.removeItem(key);
}

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
