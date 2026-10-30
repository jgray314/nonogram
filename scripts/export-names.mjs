// Compares the export names of every module under src/ at a baseline git ref
// and now: `node scripts/export-names.mjs <baseline-ref> [--now <dir>]`.
// Names are read by importing each module, so names that arrive through
// `export *` chains count. Exits 1 on any difference or any baseline module
// that no longer exists; modules new since the baseline are listed, not failed.
// `--now <dir>` compares a different tree than the working one (used to prove
// the tool catches a rename in a scratch copy). `--lost-only` fails only on a
// name that disappeared (and a missing module), so a baseline gate stays usable
// after a module legitimately gains an export; the strict form is the proof for
// a refactor round, run once at its end.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const lostOnlyFlag = args.indexOf('--lost-only');
const lostOnly = lostOnlyFlag >= 0;
if (lostOnly) args.splice(lostOnlyFlag, 1);
const nowFlag = args.indexOf('--now');
const nowRoot = nowFlag >= 0 ? resolve(args.splice(nowFlag, 2)[1]) : repo;
const ref = args[0];
if (!ref) {
  console.error('usage: node scripts/export-names.mjs <baseline-ref> [--now <dir>]');
  process.exit(2);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );
}

async function exportsOf(root) {
  const src = join(root, 'src');
  const out = new Map();
  for (const file of walk(src).sort()) {
    const id = relative(src, file).replaceAll('\\', '/');
    try {
      const mod = await import(pathToFileURL(file).href);
      out.set(id, Object.keys(mod).sort());
    } catch (err) {
      out.set(id, `import failed: ${err.message.split('\n')[0]}`);
    }
  }
  return out;
}

const tmp = mkdtempSync(join(tmpdir(), 'export-names-'));
let failed = false;
try {
  const tarFile = join(tmp, 'baseline.tar');
  execFileSync('git', ['-C', repo, 'archive', '--format=tar', '-o', tarFile, ref, 'src']);
  const baseDir = join(tmp, 'base');
  execFileSync('git', ['-C', repo, 'rev-parse', '--verify', ref]);
  mkdirSync(baseDir);
  // cwd + a bare file name: GNU tar reads a "C:" prefix as a remote host.
  execFileSync('tar', ['-xf', 'baseline.tar', '-C', 'base'], { cwd: tmp });

  const before = await exportsOf(baseDir);
  const after = await exportsOf(nowRoot);
  let compared = 0;
  for (const [id, was] of before) {
    const now = after.get(id);
    if (now === undefined) {
      console.log(`MISSING  ${id}: module no longer exists`);
      failed = true;
    } else if (typeof was === 'string' || typeof now === 'string') {
      // A browser-only module that cannot load in node: compare the message only.
      if (was !== now) {
        console.log(`DIFFERS  ${id}: baseline ${JSON.stringify(was)} now ${JSON.stringify(now)}`);
        failed = true;
      }
      compared++;
    } else {
      const lost = was.filter((n) => !now.includes(n));
      const gained = now.filter((n) => !was.includes(n));
      if (lost.length || gained.length) {
        console.log(`DIFFERS  ${id}: removed [${lost.join(', ')}] added [${gained.join(', ')}]`);
        if (lost.length || !lostOnly) failed = true;
      }
      compared++;
    }
  }
  const added = [...after.keys()].filter((id) => !before.has(id));
  if (added.length) console.log(`new modules (not compared): ${added.join(', ')}`);
  const unloadable = [...before].filter(([, v]) => typeof v === 'string').map(([id]) => id);
  if (unloadable.length)
    console.log(`not loadable in node (error text compared): ${unloadable.join(', ')}`);
  console.log(
    failed
      ? `export-names: FAIL against ${ref}`
      : lostOnly
        ? `export-names: OK, no export lost from ${compared} modules since ${ref}`
        : `export-names: OK, ${compared} modules have identical export names against ${ref}`,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
