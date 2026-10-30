// Fails when a file named in a feature's verify command does not exist:
// `node scripts/verify-files.mjs <feature-id>`.
// `node --test <path>` silently ignores a path that matches nothing, so deleting
// a test file named in a verify command would leave the command passing (AGENTS
// rule 10). Chain this first in the verify; if this script itself is deleted,
// `node` fails on the missing entry file, so the chain still breaks.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
// `--ledger <file> --root <dir>` point the check at another ledger and tree (used by its test).
const flag = (name) => {
  const at = args.indexOf(name);
  return at < 0 ? null : args.splice(at, 2)[1];
};
const rootArg = flag('--root');
const root = rootArg ? resolve(rootArg) : repo;
const ledgerFile = flag('--ledger') ?? resolve(repo, 'FEATURES.json');
const id = args[0];
if (!id) {
  console.error('usage: node scripts/verify-files.mjs <feature-id> [--ledger <file> --root <dir>]');
  process.exit(2);
}

const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'));
const feature = ledger.features.find((f) => f.id === id);
if (!feature) {
  console.error(`verify-files: no feature "${id}" in FEATURES.json`);
  process.exit(2);
}

// Repo-relative paths ending in .js or .mjs under test/ or scripts/.
const paths = [...new Set(feature.verify.match(/\b(?:test|scripts)\/[\w./-]+\.m?js\b/g) ?? [])];
const missing = paths.filter((p) => !existsSync(resolve(root, p)));
if (missing.length) {
  console.error(`verify-files: ${id} names files that do not exist: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`verify-files: OK, ${paths.length} files named by the ${id} verify exist`);
