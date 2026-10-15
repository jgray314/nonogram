// Runs ux-checks.html in headless Chrome and exits non-zero if any check fails.
// No dependencies: a static server on 127.0.0.1 (the page refuses other hosts)
// plus the Chrome already on CI runners and dev machines.
//   node scripts/ux-checks-headless.mjs            # CHROME=<path> overrides discovery
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
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
const chrome = CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) {
  console.error('ux-checks: no Chrome or Edge found; set CHROME=<path>');
  process.exit(2);
}

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(ROOT, path === sep || path === '/' ? 'index.html' : path);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const profile = mkdtempSync(join(tmpdir(), 'nng-ux-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const child = spawn(
  chrome,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    `http://127.0.0.1:${port}/ux-checks.html`,
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

// Chrome prints "DevTools listening on ws://..." to stderr once it is up.
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

let dom = '';
try {
  const debugPort = new URL(browserWs).port;
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    const list = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
    page = list.find((t) => t.type === 'page' && t.url.includes('ux-checks.html'));
    if (!page) await sleep(100);
  }
  if (!page) throw new Error('no ux-checks page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const evaluate = (expression) =>
    new Promise((res) => {
      const mine = ++id;
      const on = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id !== mine) return;
        ws.removeEventListener('message', on);
        res(msg.result?.result?.value ?? '');
      };
      ws.addEventListener('message', on);
      ws.send(JSON.stringify({ id: mine, method: 'Runtime.evaluate', params: { expression } }));
    });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (/^UX checks: /.test(await evaluate('document.title'))) break;
    await sleep(500);
  }
  dom = await evaluate('document.documentElement.outerHTML');
  ws.close();
} finally {
  child.kill();
  server.close();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

const text = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'");
const summary = text(/id="summary"[^>]*>(.*?)<\/p>/s.exec(dom)?.[1] ?? '');
const lines = [...dom.matchAll(/<li><span class="(fail|known)">(.*?)<\/span>/gs)].map((m) =>
  text(m[2]),
);
const out = (line) =>
  process.stdout.write(`${line}
`);
out(summary || 'ux-checks: no summary in the page (did it finish?)');
for (const l of lines) out(`  ${l}`);
const m = /(\d+) pass, (\d+) fail/.exec(summary);
if (!m || Number(m[2]) > 0 || Number(m[1]) === 0) process.exit(1);
