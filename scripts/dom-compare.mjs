// Rendered-DOM equivalence check: drives the same fixed script of steps in
// headless Chrome against a baseline commit and the working tree, hashes the
// page after every step, and exits non-zero on the first difference.
//   node scripts/dom-compare.mjs <baseline-ref>   # baseline vs the working tree
//   node scripts/dom-compare.mjs --self-check     # proves it can fail (HEAD vs a mutated copy)
// CHROME=<path> overrides Chrome discovery (same list as ux-checks-headless.mjs).
//
// The baseline is extracted with `git archive` into an OS temp directory (never
// a worktree in the repo). Both trees are served on 127.0.0.1 with no-cache
// headers and a fresh Chrome profile each, so storage never leaks between them.
//
// What is hashed: the whole DOM after each step (FNV-1a, 64-bit), plus a hash of
// every canvas's pixels (canvas content is not in the DOM text). Volatile things
// are normalized so the same code yields the same hash on every run:
//   - the play timer text (.nng-timer) is elapsed wall-clock time;
//   - the library export's file text has its ISO dates and epoch-millisecond
//     numbers replaced (file name stamp, savedAt-style fields).
// Not covered: computed styles and layout, pointer-drag paths beyond the fixed
// strokes, and anything off the fixed steps below.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** FNV-1a, 64-bit, over the UTF-16 code units of `s`; hex string. */
function fnv(s) {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/** Static server for `dir` on a free 127.0.0.1 port, never cached. */
async function serve(dir) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = join(dir, path === sep || path === '/' ? 'index.html' : path);
    if (!file.startsWith(dir)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store, no-cache, must-revalidate',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

/** Page-side helpers, installed once per load. Plain strings: runs in the app's page. */
const PAGE_HELPERS = `
window.__dc = (() => {
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, what, ms = 5000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) throw new Error('timed out waiting for ' + what);
      await pause(25);
    }
  };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const button = (text) => $$('button').find((b) => b.textContent.trim() === text);
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  const snap = async () => {
    // Let running animations finish: a class that an animationend handler removes
    // (the auto-cross sweep) would otherwise be caught mid-run or not, by timing.
    await waitFor(() => document.getAnimations().length === 0, 'animations', 3000).catch(() => {});
    const clone = document.documentElement.cloneNode(true);
    for (const n of clone.querySelectorAll('.nng-timer')) n.textContent = '<time>';
    const live = [...document.querySelectorAll('canvas')];
    const copies = [...clone.querySelectorAll('canvas')];
    live.forEach((c, i) => {
      try { const u = c.toDataURL(); copies[i].setAttribute('data-canvas', u.length + ':' + hash(u)); }
      catch { copies[i].setAttribute('data-canvas', 'unreadable'); }
    });
    return clone.outerHTML;
  };
  const go = async (hashPath, ready) => {
    location.hash = hashPath;
    await waitFor(ready, 'view for ' + hashPath);
    // A view appends its stylesheet link on mount; sizes measured before it
    // loads differ run to run, so wait for every sheet before snapshotting.
    await waitFor(() => $$('link[rel=stylesheet]').every((l) => l.sheet), 'stylesheets');
    await pause(250);
  };
  const stroke = (path, btn) => {
    const cell = (r, c) => $('.nng-cell[data-r="' + r + '"][data-c="' + c + '"]');
    const fire = (node, type) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, button: btn }));
    const nodes = path.map(([r, c]) => cell(r, c));
    fire(nodes[0], 'pointerdown');
    for (const n of nodes.slice(1)) fire(n, 'pointerover');
    fire(nodes[nodes.length - 1], 'pointerup');
  };
  return { pause, waitFor, $, $$, button, snap, go, stroke };
})();
`;

/** Drives one served tree through every step; returns [{ name, html }] in order. */
async function drive(chrome, port) {
  const profile = mkdtempSync(join(tmpdir(), 'nng-dom-'));
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  try {
    const browserWs = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('Chrome did not start in 30s')), 30000);
      child.stderr.on('data', (d) => {
        buf += d;
        const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
        if (m) {
          clearTimeout(t);
          res(m[1]);
        }
      });
      child.on('exit', (c) => rej(new Error(`Chrome exited early (${c})`)));
    });
    const debugPort = new URL(browserWs).port;
    let target;
    for (let i = 0; i < 100 && !target; i++) {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      target = list.find((t) => t.type === 'page');
      if (!target) await sleep(100);
    }
    if (!target) throw new Error('no page target');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        p(msg);
      }
    });
    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const mine = ++id;
        pending.set(mine, (msg) =>
          msg.error ? rej(new Error(msg.error.message)) : res(msg.result),
        );
        ws.send(JSON.stringify({ id: mine, method, params }));
      });
    /** Evaluate an async expression in the page and return its JSON value. */
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      }
      return r.result.value;
    };

    // A real, fixed viewport so layout-dependent branches (window width) match.
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Page.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html#/library` });
    await sleep(500);
    await evaluate(
      `new Promise((r) => document.readyState === 'complete' ? r() : addEventListener('load', r))`,
    );
    await evaluate(PAGE_HELPERS);
    // A tab the player is looking at: a hidden pane would stop the play timer.
    await evaluate(
      `Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })`,
    );
    await evaluate(
      `(async () => { localStorage.clear(); const d = window.__dc; location.hash = '#/library'; await d.pause(100); })()`,
    );
    await evaluate(
      `window.__dc.waitFor(() => window.__dc.$('.nng-lib-toolbar'), 'library toolbar')`,
    );

    const steps = [];
    /** @param {string} name @param {string} [code] page code to run before the snapshot */
    const step = async (name, code) => {
      if (code) await evaluate(`(async () => { const d = window.__dc; ${code} })()`);
      steps.push({ name, html: await evaluate('window.__dc.snap()') });
    };
    /** A step whose value is a file's text, not the DOM. */
    const fileStep = async (name, code) => {
      steps.push({
        name,
        html: String(await evaluate(`(async () => { const d = window.__dc; ${code} })()`)),
      });
    };
    const captureExport = (click) => `
      const realCreate = URL.createObjectURL;
      const realClick = HTMLAnchorElement.prototype.click;
      const blobs = new Map();
      let got = null;
      URL.createObjectURL = (o) => { const u = realCreate.call(URL, o); blobs.set(u, o); return u; };
      HTMLAnchorElement.prototype.click = function () {
        if (this.hasAttribute('download')) { got = { name: this.getAttribute('download'), blob: blobs.get(this.href) }; return; }
        return realClick.call(this);
      };
      try { ${click}; await d.pause(150); }
      finally { URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick; }
      if (!got) throw new Error('no download was triggered');
      const text = await got.blob.text();
      return got.name.replace(/\\d{4}-\\d\\d-\\d\\d/, '<date>') + '\\n' + text
        .replace(/\\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z/g, '<iso>')
        .replace(/\\b1[5-9]\\d{11}\\b/g, '<ms>')
        .replace(/"elapsedMs":\\d+/g, '"elapsedMs":<n>');`;

    await step('library: empty');
    await step(
      'library: load samples',
      `d.button('Load sample puzzles').click();
       await d.waitFor(() => /^Added/.test(d.$('.nng-lib-status').textContent), 'samples added', 20000);
       await d.pause(250);`,
    );
    const links = await evaluate(
      `window.__dc.$$('a[href^="#/play/"]').map((a) => a.getAttribute('href').slice(2))`,
    );
    const titles = await evaluate(
      `window.__dc.$$('.nng-lib-row').map((r) => r.querySelector('.nng-lib-title').textContent)`,
    );
    if (!links.length) throw new Error('the library listed no sample after loading samples');
    // Warm-up, not hashed: the first mount of the play view races its stylesheet
    // (sizes measured before it loads differ run to run), so mount it once first.
    await evaluate(
      `(async () => { const d = window.__dc; await d.go('#/${links[0]}', () => d.$('.nng-cell')); await d.go('#/library', () => d.$('.nng-lib-toolbar')); })()`,
    );

    for (const [i, path] of links.entries()) {
      await step(
        `play ${i + 1}/${links.length}: ${titles[i] ?? path}`,
        `await d.go('#/${path}', () => d.$('.nng-cell'));`,
      );
    }

    // Interactions on the first two-tone 5x5 (the "Plus" sample, else the first).
    const plus = Math.max(
      0,
      titles.findIndex((t) => /Plus/.test(t)),
    );
    const playPath = links[plus];
    await step('interact: open', `await d.go('#/${playPath}', () => d.$('.nng-cell'));`);
    await step('interact: fill', `d.stroke([[0, 2], [1, 2], [2, 2]], 0); await d.pause(250);`);
    await step('interact: cross', `d.stroke([[0, 0], [0, 1]], 2); await d.pause(250);`);
    await step('interact: undo', `d.button('Undo').click(); await d.pause(250);`);
    await step('interact: redo', `d.button('Redo').click(); await d.pause(250);`);
    await step(
      'interact: second stroke',
      `d.stroke([[4, 0], [4, 1], [4, 2]], 0); await d.pause(250);`,
    );
    await step(
      'interact: undo twice',
      `d.button('Undo').click(); d.button('Undo').click(); await d.pause(250);`,
    );

    // Library exports (the file text is a step of its own).
    await step('library: after play', `await d.go('#/library', () => d.$('.nng-lib-toolbar'));`);
    await fileStep(
      'library: export file (json)',
      captureExport(`d.button('Export library').click()`),
    );
    await step('library: after export');
    await fileStep(
      'library: export file (webpbn)',
      captureExport(
        `d.$('.nng-lib-row summary').click(); d.button('Export for other solvers (webpbn)').click()`,
      ),
    );

    // Create: upload a sample image, wait for the real solver verdict, save.
    await step('create: open', `await d.go('#/create', () => d.$('input[type=file]'));`);
    await step(
      'create: preview after upload',
      `const res = await fetch('sample-images/cat-10x10.png');
       const blob = await res.blob();
       const file = new File([blob], 'cat-10x10.png', { type: blob.type });
       const dt = new DataTransfer();
       dt.items.add(file);
       const input = d.$('input[type=file]');
       input.files = dt.files;
       input.dispatchEvent(new Event('change', { bubbles: true }));
       await d.waitFor(() => d.$('.nng-create-preview-wrap') && !d.$('.nng-create-preview-wrap').hidden, 'crop preview', 8000);
       await d.pause(300);`,
    );
    await step(
      'create: verdict',
      `await d.waitFor(() => { const b = d.button('Save to library'); return b && !b.disabled; }, 'solver verdict', 30000);
       await d.pause(300);`,
    );
    await step(
      'create: saved',
      `d.button('Save to library').click();
       await d.waitFor(() => d.$('.nng-create-save-msg')?.textContent.trim(), 'save message', 8000);
       await d.pause(250);`,
    );

    // Library and print pages, now including the created puzzle.
    await step('library: after create', `await d.go('#/library', () => d.$('.nng-lib-toolbar'));`);
    const printIds = await evaluate(
      `window.__dc.$$('a[href^="#/print/"]').map((a) => a.getAttribute('href').slice(2))`,
    );
    for (const [i, p] of printIds.entries()) {
      await step(
        `print ${i + 1}/${printIds.length}`,
        `await d.go('#/${p}', () => d.$('.nng-print-page'));`,
      );
    }
    ws.close();
    return steps;
  } finally {
    child.kill();
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      // Chrome can hold a file for a moment on Windows; a leftover profile is harmless.
    }
  }
}

/** Extract `ref` from this repo into a fresh temp directory with git archive. */
function extract(ref, dir) {
  const tar = execFileSync('git', ['archive', '--format=tar', ref], {
    cwd: ROOT,
    maxBuffer: 1 << 30,
  });
  const r = spawnSync('tar', ['-xf', '-'], { input: tar, cwd: dir });
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
}

/** Print the first differing step with a little context; returns true when all steps match. */
function report(baseSteps, curSteps) {
  let firstDiff = null;
  const count = Math.max(baseSteps.length, curSteps.length);
  for (let i = 0; i < count; i++) {
    const a = baseSteps[i];
    const b = curSteps[i];
    const name = (a ?? b).name;
    const same = a && b && a.name === b.name && fnv(a.html) === fnv(b.html);
    process.stdout.write(
      `${same ? 'PASS' : 'DIFF'}  ${String(i + 1).padStart(2)}. ${name}  ${a ? fnv(a.html) : '-'}\n`,
    );
    if (!same && !firstDiff) firstDiff = { i, a, b };
  }
  if (!firstDiff) {
    process.stdout.write(`dom-compare: all ${count} steps identical\n`);
    return true;
  }
  const { i, a, b } = firstDiff;
  process.stdout.write(`\ndom-compare: first difference at step ${i + 1}\n`);
  if (!a || !b || a.name !== b.name) {
    process.stdout.write(
      `  baseline step: ${a?.name ?? '(none)'}\n  current step:  ${b?.name ?? '(none)'}\n`,
    );
  } else {
    let k = 0;
    while (k < a.html.length && k < b.html.length && a.html[k] === b.html[k]) k++;
    const ctx = (s) => JSON.stringify(s.slice(Math.max(0, k - 100), k + 100));
    process.stdout.write(
      `  first differing character: ${k}\n  baseline: ${ctx(a.html)}\n  current:  ${ctx(b.html)}\n`,
    );
  }
  return false;
}

/** Run both trees (dirs) through the steps and report. */
async function compare(chrome, baseDir, curDir) {
  const base = await serve(baseDir);
  const cur = await serve(curDir);
  try {
    const t0 = Date.now();
    const [baseSteps, curSteps] = await Promise.all([
      drive(chrome, base.port),
      drive(chrome, cur.port),
    ]);
    const ok = report(baseSteps, curSteps);
    process.stdout.write(`dom-compare: ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    return ok;
  } finally {
    base.server.close();
    cur.server.close();
  }
}

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node scripts/dom-compare.mjs <baseline-ref> | --self-check');
  process.exit(2);
}
const chrome = CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) {
  console.error('dom-compare: no Chrome or Edge found; set CHROME=<path>');
  process.exit(2);
}
const temps = [];
const tempDir = (label) => {
  const dir = mkdtempSync(join(tmpdir(), `nng-dom-${label}-`));
  temps.push(dir);
  return dir;
};
let code = 1;
try {
  if (arg === '--self-check') {
    // HEAD against a copy of HEAD with one class renamed: this must report a DIFF.
    const clean = tempDir('head');
    const mutated = tempDir('mut');
    extract('HEAD', clean);
    cpSync(clean, mutated, { recursive: true });
    const file = join(mutated, 'src', 'views', 'library.js');
    const src = readFileSync(file, 'utf8');
    const out = src.replace(
      "el('span', 'nng-badge nng-badge-ai', 'AI test sample')",
      "el('span', 'nng-badge nng-badge-aix', 'AI test sample')",
    );
    if (out === src) throw new Error('self-check: the mutation did not apply');
    writeFileSync(file, out);
    const ok = await compare(chrome, clean, mutated);
    if (ok) console.error('dom-compare --self-check: FAILED, the mutated copy compared equal');
    else process.stdout.write('dom-compare --self-check: OK, the mutation was detected\n');
    code = ok ? 1 : 0;
  } else {
    const baseline = tempDir('base');
    extract(arg, baseline);
    code = (await compare(chrome, baseline, ROOT)) ? 0 : 1;
  }
} catch (err) {
  console.error(`dom-compare: ${err.message}`);
  code = 2;
} finally {
  for (const d of temps)
    rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exit(code);
