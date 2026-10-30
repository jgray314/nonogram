// Pins decision 2 of docs/plans/line-cap-300.md: the files split out of a
// module never import it back, and src/ has no import cycles. Also tests the
// source-text helpers in test/helpers/split.js with positive and negative cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  definesFunction,
  importsFrom,
  namedReExports,
  reExports,
  stripComments,
} from './helpers/split.js';

const srcDir = fileURLToPath(new URL('../src/', import.meta.url));

/** Each barrel (the old path, which re-exports) and the files split out of it. */
export const FAMILIES = {
  'color.js': ['color-space.js', 'color-cells.js'],
  'create-logic.js': ['create-verdict.js', 'create-save-logic.js'],
  'format.js': ['format-keys.js', 'format-art.js'],
  'samples.js': ['samples-art.js'],
  'views/library.js': [
    'views/library-state.js',
    'views/library-backup.js',
    'views/library-sets.js',
  ],
  'views/grid.js': ['views/grid-layout.js'],
};

// A leaf of a family may not import another file of the same family's barrel,
// but may import its siblings; the order within a family is not pinned here.

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );
}

const IMPORT_RE =
  /(?:^|[\s;}])(?:import|export)\s*(?:[^'";]*?\bfrom\s*)?(['"])(\.{1,2}\/[^'"]*)\1|\bimport\s*\(\s*(['"])(\.{1,2}\/[^'"]*)\3\s*\)/g;

/**
 * Relative imports of one source text, as specifiers. Static imports and
 * re-exports only: a dynamic import() is lazy and cannot create an
 * initialisation-order cycle.
 * @param {string} src
 */
export function importsOf(src) {
  const out = [];
  for (const m of stripComments(src).matchAll(IMPORT_RE)) if (m[2]) out.push(m[2]);
  return out;
}

/** Map of src-relative path (forward slashes) to the src-relative files it imports. */
function buildGraph() {
  const graph = new Map();
  for (const file of walk(srcDir)) {
    const id = relative(srcDir, file).replaceAll('\\', '/');
    const deps = importsOf(readFileSync(file, 'utf8')).map((spec) =>
      relative(srcDir, resolve(dirname(file), spec)).replaceAll('\\', '/'),
    );
    graph.set(id, deps);
  }
  return graph;
}

/**
 * One cycle in the graph as a path of nodes (first == last), or null.
 * @param {Map<string, string[]>} graph
 */
export function findCycle(graph) {
  const state = new Map(); // 1 = on the stack, 2 = done
  const stack = [];
  const visit = (node) => {
    state.set(node, 1);
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      if (state.get(dep) === 1) return [...stack.slice(stack.indexOf(dep)), dep];
      if (!state.has(dep)) {
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(node, 2);
    return null;
  };
  for (const node of graph.keys()) {
    if (!state.has(node)) {
      const found = visit(node);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Leaves that import their own barrel. Leaves absent from the graph (not
 * written yet) are skipped.
 * @param {Map<string, string[]>} graph
 * @param {Record<string, string[]>} families
 */
export function barrelViolations(graph, families) {
  const bad = [];
  for (const [barrel, leaves] of Object.entries(families)) {
    for (const leaf of leaves) {
      if (graph.has(leaf) && graph.get(leaf).includes(barrel))
        bad.push(`${leaf} imports ${barrel}`);
    }
  }
  return bad;
}

test('src/ has no import cycles', () => {
  assert.equal(findCycle(buildGraph()), null);
});

test('no split-out file imports its barrel', () => {
  assert.deepEqual(barrelViolations(buildGraph(), FAMILIES), []);
});

test('every listed barrel exists', () => {
  for (const barrel of Object.keys(FAMILIES)) assert.ok(existsSync(srcDir + barrel), barrel);
});

test('the graph sees real imports (guards a regex that matches nothing)', () => {
  const graph = buildGraph();
  assert.ok(graph.get('color.js').includes('image.js'));
  assert.ok(graph.get('views/library.js').includes('views/library-backup.js'));
  assert.ok(graph.size > 30);
});

// ---- mutation-style tests on synthetic graphs ----

test('findCycle finds a cycle in a synthetic graph and passes an acyclic one', () => {
  const cyclic = new Map([
    ['a.js', ['b.js']],
    ['b.js', ['c.js']],
    ['c.js', ['a.js']],
  ]);
  assert.deepEqual(findCycle(cyclic), ['a.js', 'b.js', 'c.js', 'a.js']);
  assert.deepEqual(findCycle(new Map([['a.js', ['a.js']]])), ['a.js', 'a.js']);
  const acyclic = new Map([
    ['a.js', ['b.js', 'c.js']],
    ['b.js', ['c.js']],
    ['c.js', []],
  ]);
  assert.equal(findCycle(acyclic), null);
});

test('barrelViolations fails when a leaf imports its barrel, skips leaves not written yet', () => {
  const families = { 'x.js': ['x-leaf.js', 'x-other.js'] };
  const ok = new Map([
    ['x.js', ['x-leaf.js']],
    ['x-leaf.js', []],
  ]);
  assert.deepEqual(barrelViolations(ok, families), []); // x-other.js missing: skipped
  const bad = new Map([
    ['x.js', ['x-leaf.js']],
    ['x-leaf.js', ['x.js']],
  ]);
  assert.deepEqual(barrelViolations(bad, families), ['x-leaf.js imports x.js']);
  assert.ok(findCycle(bad), 'the same mutation is also a cycle');
});

test('importsOf reads static imports and re-exports, not comments or import()', () => {
  const src = [
    "import { a } from './a.js';",
    "export * from './b.js';",
    "export { c } from '../c.js';",
    "import './side.js';",
    "// import { z } from './commented.js';",
    "/* export * from './block.js'; */",
    "const lazy = () => import('./lazy.js');",
    "import fs from 'node:fs';",
  ].join('\n');
  assert.deepEqual(importsOf(src), ['./a.js', './b.js', '../c.js', './side.js']);
});

// ---- test/helpers/split.js ----

test('definesFunction: real definitions count', () => {
  assert.ok(definesFunction('export function foo(a) {\n return a;\n}', 'foo'));
  assert.ok(definesFunction('async function foo() { await 1; }', 'foo'));
  assert.ok(definesFunction('const foo = (a) => a + 1;', 'foo'));
  assert.ok(definesFunction('export const foo = async (a, b) => {\n return a;\n};', 'foo'));
  assert.ok(definesFunction('const foo = x => x;', 'foo'));
  assert.ok(definesFunction('export class Foo { m() { return 1; } }', 'Foo'));
  assert.ok(definesFunction('export const LIMIT = 5;', 'LIMIT'));
  assert.ok(definesFunction('const foo = function () { return 1; };', 'foo'));
});

test('definesFunction: comments do not count', () => {
  assert.ok(!definesFunction('// function foo() { return 1; }', 'foo'));
  assert.ok(!definesFunction('/* const foo = () => 1; */', 'foo'));
  assert.ok(!definesFunction('/**\n * function foo(a) { return a; }\n */\nconst bar = 1;', 'foo'));
});

test('definesFunction: strings do not count, and // inside a string is not a comment', () => {
  assert.ok(!definesFunction("const s = 'function foo() { return 1; }';", 'foo'));
  assert.ok(definesFunction("const url = 'http://x';\nfunction foo() { return 1; }", 'foo'));
});

test('definesFunction: empty stubs do not count', () => {
  assert.ok(!definesFunction('function foo() {}', 'foo'));
  assert.ok(!definesFunction('export function foo(a, b) {\n  \n}', 'foo'));
  assert.ok(!definesFunction('const foo = () => {};', 'foo'));
  assert.ok(!definesFunction('const foo = () => null;', 'foo'));
  assert.ok(!definesFunction('const foo = null;', 'foo'));
  assert.ok(!definesFunction('const foo = undefined;', 'foo'));
  assert.ok(!definesFunction('class Foo {}', 'Foo'));
});

test('definesFunction: names must match whole, and a member call is not a definition', () => {
  assert.ok(!definesFunction('function foobar() { return 1; }', 'foo'));
  assert.ok(!definesFunction('function foo2() { return 1; }', 'foo'));
  assert.ok(!definesFunction('obj.function foo() { return 1; }', 'foo'));
  assert.ok(!definesFunction('const other = foo();', 'foo'));
});

test('reExports: a real line counts; comments, strings, other specifiers do not', () => {
  assert.ok(reExports("export * from './color-space.js';", './color-space.js'));
  assert.ok(reExports('import { a } from "./a.js";\nexport * from "./b.js"\n', './b.js'));
  assert.ok(!reExports("// export * from './color-space.js';", './color-space.js'));
  assert.ok(!reExports("/* export * from './color-space.js'; */", './color-space.js'));
  assert.ok(!reExports('const s = "export * from \'./color-space.js\';";', './color-space.js'));
  assert.ok(!reExports("export * from './color-space.js';", './color-cells.js'));
  assert.ok(!reExports("export { x } from './color-space.js';", './color-space.js'));
  assert.ok(!reExports("export * from './color-space.jsx';", './color-space.js'));
});

test('stripComments keeps strings and regexes, drops both comment kinds', () => {
  const src =
    "const a = '// not'; // gone\n/* gone */ const r = /\\/\\/x/; const b = `/* kept */`;";
  const out = stripComments(src);
  assert.ok(out.includes("'// not'") && out.includes('`/* kept */`') && out.includes('/\\/\\/x/'));
  assert.ok(!out.includes('gone'));
});

test('namedReExports: a real named line counts; comments, strings, other specifiers do not', () => {
  const line = "export { b, a } from './color-space.js';";
  assert.deepEqual(namedReExports(line, './color-space.js'), ['a', 'b']);
  assert.deepEqual(
    namedReExports("export {\n  x,\n  y,\n} from './a.js';\nconst z = 1;\n", './a.js'),
    ['x', 'y'],
  );
  assert.equal(namedReExports(`// ${line}`, './color-space.js'), null);
  assert.equal(namedReExports(`/* ${line} */`, './color-space.js'), null);
  assert.equal(namedReExports(`const s = "${line}";`, './color-space.js'), null);
  assert.equal(namedReExports(line, './color-cells.js'), null);
  assert.equal(namedReExports("export * from './color-space.js';", './color-space.js'), null);
  assert.equal(namedReExports("export { } from './color-space.js';", './color-space.js'), null);
});

test('importsFrom: a real import line counts; comments, strings, re-exports do not', () => {
  assert.ok(importsFrom("import { a } from './samples-art.js';", './samples-art.js'));
  assert.ok(importsFrom("import a, { b } from './x.js';\n", './x.js'));
  assert.ok(!importsFrom("// import { a } from './samples-art.js';", './samples-art.js'));
  assert.ok(!importsFrom('const s = "import { a } from \'./x.js\';";', './x.js'));
  assert.ok(!importsFrom("import { a } from './other.js';", './samples-art.js'));
  assert.ok(!importsFrom("export { a } from './samples-art.js';", './samples-art.js'));
});
