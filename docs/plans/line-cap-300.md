# Plan: bring every source file to 300 lines

Goal: lower the `max-lines` cap on `src/**` from 500 to ESLint's default of 300, so no source file is longer than 300 lines. Behavior must not change (AGENTS rule 9).

Follow-up to [view-split.md](view-split.md), which is merged, gated (gate pass 8) and pushed. That plan set the cap at 500 as a ratchet and split the two views; this one finishes the job. This version was reworked after a `/plan-review` (see `docs/reviews/nonogram-plan-review.md`, "Plan review: line-cap-300", 2026-10-29) and from the view split's own problems, which are listed under "What the view split taught" below.

Scope: `src/**` only, which is what the lint rule covers. Test files, `test/ux/checks.js` (883 lines), `research/` and `scripts/` are not capped. `scripts/` and `test/` gain new files in Wave 0 (the equivalence tools and split tests); nothing existing outside `src/` changes except the numbers named in Wave 4.

## Starting point (measured 2026-10-29, after the view split; checked again before Wave 0)

| File | Lines | Shape |
|---|---|---|
| `src/color.js` | 457 | color-space conversions, an older cell-averaging path (D25), and the pixel-histogram path (D28) |
| `src/views/library.js` | 417 | module state, row rendering, export and import flow, tile-set rendering, `addSamples` |
| `src/format.js` | 354 | limits and key allow-lists, JPEG size parsing, validators, id hashing |
| `src/views/grid.js` | 347 | one function, `renderGrid`, about 280 lines |
| `src/samples.js` | 338 | about 270 lines are the sample-art data arrays |
| `src/create-logic.js` | 334 | sizing, editor state, report text, save records, tile sets |

No other `src/` file is over 300 (the next largest is `src/views/create/index.js` at 289), so nothing unlisted breaks the cap. Every new file below must also end at or under 300; lint enforces it only in Wave 4, so each lane reports `wc -l` of its new files.

## What the view split taught, and what this plan does about it

| Problem last round | Change here |
|---|---|
| About 20 mutations survived; the safety net was found thin lane by lane | Wave 0 audits the six files with mutations first and closes the survivors that matter before any code moves |
| "No behavior change" was shown by a full check plus UX checks, and by hand-run browser comparisons that lived in a scratchpad | Wave 0 builds two repo tools: `scripts/dom-compare.mjs` (rendered pages against a baseline commit, in headless Chrome) and `scripts/export-names.mjs` (a module's export names against the baseline); every merge runs both |
| Every Wave 2 merge conflicted in the shared `index.js` | Every file edited by more than one lane has its regions named below, and library gets a foundation step so its lanes only fill their own regions |
| Briefs carried ordering errors (calls before the context existed, no-op replaced by `null`) | The maps must list order (grid, library), and the lane brief template at the end is part of the plan |
| Layout tests passed on empty stubs and on commented-out wiring | Each split gets a test that the functions are defined in the new file and not in the old one, with comments stripped |
| Guesses (the module cut) were treated as plan | Cuts for the four pure-logic files are frozen below with owners for every shared helper; grid's cut is a decision resolved by the map and frozen before its lanes start |
| README timings contradicted each other; tolerance bands hid it | Nothing in this plan changes a documented time; a new docs test already pins one number per suite |
| Worktree folders broke lint, format and the private-path scan | Fixed in `999eb79`; no longer an issue |

## Decisions

1. **Move to new files, keep the old path.** Each split moves a group of functions to new files; the old file ends with `export * from './<new>.js';` lines so importers, tests and research scripts keep working unchanged. Named exports only (these files have no default export), and `scripts/export-names.mjs` proves the export set of the old path is identical before and after. Removing the re-exports later is a separate change.
2. **Leaves first, no cycles.** A new file never imports the old path. Anything two new files both need lives in a leaf file that imports nothing from this family. `test/module_graph.test.js` (Wave 0) pins this: it fails if a listed new file imports its barrel. Reason: `create-logic.js` would otherwise re-export a file that imports `verdictOf` back from it, an import cycle whose initialisation order depends on who loads first.
3. **Nothing is deleted.** The D25 cell-averaging path in `color.js` stays (`test/color.test.js` and `research/color/` import it); dead code stays dead. Removing it is a research decision, not a size fix.
4. **Library shares one state object.** `library.js` today has six module-level `let`s (`root`, `store`, `status`, `listEl`, `toolbarButtons`, `generation`) that `unmount` clears. They become fields of one exported object `lib` in `src/views/library-state.js`; every library file reads `lib.<field>` at call time (never a copy: `runImport` deliberately snapshots `lib.store` into a local because `unmount` clears it, and that stays). `render` is reached as `lib.render()`, assigned in `mount`, so the backup and set files do not import `library.js` (decision 2).
5. **Grid is cut by its map.** `renderGrid` is one function with closure state. The Wave 0 map (`line-cap-300-map-grid.md`) shows the paint half and the pointer half share no state, so no state object is needed: the old step 2d is dropped, and the cut is two extractions (frozen below, "Grid cut (frozen)"). The map's setup and teardown order are invariants in the grid lane briefs.
6. **One feature row, one activation.** The plan gate is on. The row `line-cap-300` names this plan (`"plan": "docs/plans/line-cap-300.md"`). The orchestrator records the review (`plan-reviewed`), activates the row once at the start of Wave 0, and verifies it once at the end. Lanes never edit `FEATURES.json` (Wave 4's restamp is the orchestrator's). Parallel worktrees do not conflict with the single-active rule because only the orchestrator activates.

## Frozen cuts (pure-logic files)

Directed acyclic: leaf, then siblings, then the old file re-exporting.

**`color.js` (457)**

| File | Contents | About lines |
|---|---|---|
| `color-space.js` (leaf) | `SEED`, `ITERATIONS`, `MERGE_DE` (exported as before), `lin`, `f`, `rgbToLab`, `deltaE`, `hexOf`, `rgbOfHex`, `labToRgb`, `mean`, `mulberry32`, `inkColors`, `inkText`, `COLOR_COUNTS` | 150 |
| `color-cells.js` (imports `color-space.js`, `image.js`) | the D25 path: `cellColors`, `kmeans`, `quantizeColors`, `clusterOf`, `cellColorGrid` | 130 |
| `color.js` (imports both, re-exports both) | the pixel path: `pixelAt`, `binKey`, `histogram`, `seeds`, `weightedKmeans`, `nearest`, `pixelColorGrid`, `colorGrid` | 180 |

Shared helpers have one owner (`color-space.js`); `labToRgb`, used only by the pixel path, sits there because it is a conversion.

**`create-logic.js` (334)**

| File | Contents | About lines |
|---|---|---|
| `create-verdict.js` (leaf, imports `difficulty.js`) | `STATUS_TEXT`, `verdictOf`, `reportView`, `DEFAULT_PALETTE` | 50 |
| `create-save-logic.js` (imports `create-verdict.js`, `format.js`) | art constants and `artSize`, `tileCropRect`, `pickArt`, `withArts`, `buildPuzzleRecord`, `canSave`, `TILE_COUNTS`, `fullSize`, `sliceTiles`, `tileStatusLine`, `canSaveSet`, `withVerdicts`, `setWrites`, `rollbackTargets` | 180 |
| `create-logic.js` (imports `create-verdict.js`, re-exports it and `create-save-logic.js`) | sizing, crop, editor state, `gridSig`, `hasUnsavedWork`, `existingPuzzle`, `blankGrid`, `newEditorState` and the rest | 120 |

Callers of `create-logic.js` (the Create modules, `solver-client.js`, `test/create.test.js`) keep their imports; they see the same export names.

**`format.js` (354)**

| File | Contents | About lines |
|---|---|---|
| `format-keys.js` (leaf) | every `MAX_*` limit, `ART_PREFIX`, `PUZZLE_KEYS`, `SAVE_KEYS`, `SET_KEYS`, `PALETTE_ENTRY_KEYS`, `PUZZLE_SET_KEYS`, `RULES_KEYS`, `pickKeys`, `pickKnown` | 100 |
| `format-art.js` (imports `format-keys.js`) | `jpegSize`, `boundArt` | 70 |
| `format.js` (imports both, re-exports both) | validators, `canonical`, `puzzleId`, `idMatches`, `toJSON`, `fromJSON` | 200 |

`format.js` is the import boundary (AGENTS rule 6); the mutation list for this lane is in Wave 1.

**`samples.js` (338)**: `samples-art.js` (the `ART` and `COLOR_ART` arrays, data only, about 275 plus a header) and `samples.js` (loaders, `sampleRecord`, about 70). If `samples-art.js` ends over 300, `COLOR_ART` moves to `samples-art-color.js`.

**Library (417)**, frozen from the Wave 0 map (`line-cap-300-map-library.md`), which corrected the first draft of this table in four places (`button` placement, no `export *`, the 2b region, the import header). The library files use plain `import` lines, not `export *`: `library.js` exports only `mount` and `unmount`, and re-exporting the new files would change its export set.

| File | Contents | About lines |
|---|---|---|
| `library-state.js` (leaf, imports `../views/dom.js` only) | `lib` (fields `store`, `status`, `generation`, `toolbarButtons`, `render`), `say`, `forThisMount` (it reads `lib.generation`), `button` (`setNode` needs it, so it cannot stay in `library.js`) | 45 |
| `library-backup.js` (imports `library-state.js`) | `download`, `exportXml`, `exportLibrary`, `importLibrary`, `runImport` | 135 |
| `library-sets.js` (imports `library-state.js`) | `solutionCanvas`, `tileNode`, `tileBox`, `setNode`, `deleteSet` | 100 |
| `library.js` (imports all three) | `ensureCss`, `link`, `deletePuzzle`, `addSamples`, `moreMenu`, `rowNode`, `render`, `mount`, `unmount`; its local `el` becomes `elc` from `dom.js` | 175 |

`root` and `listEl` are touched only by `mount`, `unmount` and `render`, so they stay local to `library.js`. `generation` is only ever incremented, so `unmount` must not replace `lib`. `toolbarButtons` is reassigned in `mount`, never mutated. `lib.render` is assigned in `mount` before the first `render()` call and needs no clearing. The import-edge graph is `state -> dom`, `backup -> state`, `sets -> state`, `library -> all`, acyclic, and no new file imports `library.js`. `test/module_graph.test.js` already lists these files.

**Grid cut (frozen)** from the Wave 0 map (`line-cap-300-map-grid.md`). `renderGrid` is lines 67 to 347 of `src/views/grid.js`; `painted` is read and written only by `update`, `overlay` only by `setOverlay`, `hot` and `button` only by the pointer code.

| File | Contents | About lines |
|---|---|---|
| `grid-layout.js` (leaf, imports `../color.js` only) | `gutterSize`, `blankStyle`, `div`, `buildGrid` (today's setup block 81 to 169, returning `{root, top, left, nodes, rowClues, colClues}`) | 125 to 140 |
| `grid-pointer.js` (imports nothing) | `attachPointer(root, nodes, {width, height, onPointer, touchButton})` (today's 245 to 329, with `hot` and `button` as locals), returning `detach()` which removes the window listeners | 90 to 105 |
| `grid.js` (imports both) | the JSDoc, `export { inkColors }`, re-exports of `gutterSize` and `blankStyle`, `update`, `setClueDone`, `setOverlay`, `setWrong`, `setHighlight`, `sweep`, and the returned object with `destroy` | 150 to 165 |

Invariants the grid briefs state: the first `update(cells)` runs before `container.append(root)` (otherwise every filled cell pops on mount); DOM append order is bands, corner, column clues, row clues, cells; `destroy` removes the window `pointerup`, then `pointercancel` (the same `onUp` reference), then calls `root.remove()`; `inks` is computed once. Callers (Create `grid-view.js`, `index.js` and `report.js`; Play `index.js`, `hud.js`, `session.js`; Print `print.js` with two grids at once) keep the same returned API. Tests import only `gutterSize` and `blankStyle`.

## Safety net and equivalence proof

"Behavior unchanged" is shown by these, in this order, and each is built or audited in Wave 0 before any file moves:

1. **Mutation audit of the code about to move.** For each of the six files, a read-only lane applies simple mutations (delete an assignment, drop a call, change a constant, swap a branch) in scratch copies and records which survive `npm test` plus `npm run test:ux`. Output: `docs/plans/line-cap-300-audit-<file>.md`. Known weak spots from earlier rounds to include: `grid.js` drag and sweep paths, `library.js` backup and import (`runImport` holds the forged-id filter `idMatches`, the re-solve through `ratePlan`, and the write-failure path), `format.js` nested allow-lists and every `MAX_*` bound. Test coverage today: `renderGrid` has no unit test (`test/grid.test.js` covers `gutterSize` and a few helpers), and no test imports `library.js`; both rely on UX checks.
2. **Close the survivors that matter** (Wave 0e). A survivor is closed with a check or accepted in writing in the Results section; the rule of thumb is that anything on a trust boundary (`format.js` bounds and allow-lists, `runImport`) and anything with user-visible output (`grid.js`, `library.js` rows) is closed.
3. **`scripts/dom-compare.mjs <baseline-ref>`**: serves the baseline commit (`git archive` into a temp directory, never a worktree in the repo) and the working tree, loads the samples, walks the library page, a play page for each sample, the Create page after an upload, and the print page, applies a fixed set of interactions (fill, cross, undo, a library export), and compares hashes of the rendered DOM step by step. It runs in the headless Chrome the UX checks already use (a real viewport), prints the first differing step, and exits non-zero on any difference.
4. **`scripts/export-names.mjs <baseline-ref>`**: for each source module, the sorted export names at the baseline and now must be identical (the "nothing is deleted, old path unchanged" claim).
5. **`test/module_graph.test.js`**: pins decision 2 (no new file imports its barrel, no cycles among the listed files).
6. **One split test per split** (`test/split_<name>.test.js`, using `test/helpers/split.js` from Wave 0): every listed function is defined in its new file and not in the old one, comments stripped; the old file contains the `export * from` lines. A stub file or a commented-out line fails it.
7. **The existing suites**: `npm test`, lint, format, typecheck, `npm run test:ux`.
8. **A pure-logic output probe for `color.js`**: a small script (kept in `scripts/`, run before and after) prints a hash of `pixelColorGrid` and `cellColorGrid` results on fixed synthetic images and the samples. `research/color/cluster.mjs` is not used for this: it prints timings.

Every lane also runs its own mutations (listed in its brief) and pastes the results.

## Pricing

Estimates are rough agent-lane hours including verification. Every step is at most 4. "Type" separates mechanical moves from design work.

| Step | Type | Hours |
|---|---|---|
| 0a Orchestrator: re-check sizes, add the `line-cap-300` row with `plan`, record the review, activate, note the baseline commit | bookkeeping | 0.5 |
| 0b-grid map of `renderGrid` (read-only) | design input | 2 |
| 0b-library map (read-only) | design input | 1.5 |
| 0c-1 Mutation audit: `color.js`, `samples.js`, `create-logic.js` (read-only) | audit | 3 |
| 0c-2 Mutation audit: `format.js`, `grid.js`, `library.js` (read-only) | audit | 3.5 |
| 0d-1 `scripts/dom-compare.mjs` | tool | 3.5 |
| 0d-2 `scripts/export-names.mjs`, `test/helpers/split.js`, `test/module_graph.test.js`, the color probe | tool | 3 |
| 0e Close survivors, in up to two lanes (sized from the audit; if one exceeds 3.5 it is split) | tests | 3.5 each |
| Freeze point: orchestrator reads the maps and audit, freezes grid's cut and the library files, updates this plan | decision | 1 |
| 1a `samples.js` | mechanical | 1 |
| 1b `format.js` (cut 1, mutations 2) | mechanical | 3 |
| 1c `create-logic.js` | mechanical | 2.5 |
| 1d `color.js` | mechanical | 2.5 |
| 2a `library.js` foundation: `lib` state object in place, stub files and header | design + mechanical | 3 |
| 2b `library-backup.js` | mechanical | 2 |
| 2c `library-sets.js` | mechanical | 2 |
| 2d `grid.js` state object | dropped at the freeze: the map shows nothing is shared between the halves | 0 |
| 2e `grid.js` extraction 1: `grid-layout.js` | mechanical | 2 (from the map) |
| 2f `grid.js` extraction 2: `grid-pointer.js` | design + mechanical | 3 (from the map; the pointer paths now have 13 UX checks) |
| 3 Merge and verify, per lane | verification | 0.5 |
| 4 Cap to 300, test, docs, verify and restamp | bookkeeping | 1.5 |

If the map shows `renderGrid` needs more than three extraction steps, or any step over 3.5 hours, the step is split before starting, and the plan is re-reviewed on that section.

## Steps and parallelism

**Wave 0: safety net and maps. Lanes at the same time unless noted; disjoint files.**

- 0a orchestrator (above), first.
- 0b-grid, 0b-library: read-only maps. Each lists every inner function and handler with its line range; state read and written; **setup order, teardown order, the calls made before shared structures exist, values read live, the returned API and its callers**; and a proposed cut with line estimates. For grid: `painted`, `overlay`, `hot`, `button`, `nodes`, the clue arrays, the window listeners and their removal in `destroy`, the order `update` runs before the root is appended, and the callers in Create, Play and Print. For library: every module-level `let`, who writes it, `forThisMount`, and which functions call `render`. Output: `docs/plans/line-cap-300-map-grid.md`, `docs/plans/line-cap-300-map-library.md`.
- 0c-1, 0c-2: the mutation audits. Read-only on `src/`: mutations are made in copies under the scratchpad directory, never in the repo.
- 0d-1, 0d-2: the tools and helpers. 0d-1 owns `scripts/dom-compare.mjs` only; 0d-2 owns the other new files. No lane edits `package.json`: the orchestrator adds the `scripts` entries for the new tools in 0a.
- 0e: after 0c merges, lanes that add checks for survivors, one lane per file group; each owns only new test files (`test/ux/` additions go in a new file `test/ux/pipeline-linecap.js` registered once by the orchestrator in 0a with an empty array, so no lane edits a shared registry).

**Freeze point (orchestrator). Reached 2026-10-30.** Waves 0a to 0e are merged; this plan now holds grid's frozen cut, the library file list, sized steps and the accepted survivors (see "Results"). The updated sections (Decisions 4 and 5, Frozen cuts, Grid cut, Pricing, Wave 2, Results) are reviewed again (`/plan-review` pass recorded) before Wave 1.

**Wave 1: four pure-logic lanes at the same time.** Disjoint files, one lane per file group (samples, format, create-logic, color). Each lane owns the old file, its new files and `test/split_<name>.test.js`; it may not touch anything else, including other lanes' split tests.

**Wave 2: library and grid groups at the same time.**

- Library: 2a first (sequential), then 2b and 2c in parallel. 2a converts `store`, `status`, `generation`, `toolbarButtons` and the render hook to `lib.<field>` in place (`root` and `listEl` stay local), adds `library-state.js` (with `say`, `forThisMount` and `button` moved into it), creates the two stub files, and rewrites the import header of `library.js` so that each of 2b and 2c has its own import lines (`safeFilename` on one line, `tileSolved, tileFace` on another; the shared `library-logic` import is split), so that neither touches the header. Regions in today's line numbers: **2b owns** `download` 48 to 57, `exportXml` 63 to 67, `exportLibrary` 75 to 89, `importLibrary` and `runImport` 103 to 191, and their call sites in `mount`; **2c owns** `solutionCanvas` through `deleteSet`, 286 to 376, whose only call site is `render` line 281. `deletePuzzle` (69 to 73, between 2b functions), `addSamples` (193 to 202), `render`, `rowNode`, `moreMenu`, `mount` and `unmount` stay in `library.js` and in neither lane's region. Merge order: 2b, then 2c; the orchestrator resolves any conflict, and a conflict outside those regions is a plan defect to report. The library split test checks that each listed function is defined in its new file and absent from `library.js`, not an `export *` line.
- Grid: 2e (`grid-layout.js`), then 2f (`grid-pointer.js`), in order (both edit `renderGrid`). 2d is dropped. Each is verified with `dom-compare`, `npm run test:ux` (the 13 `linecap-grid-*` checks cover the pointer, paint and `destroy` paths) and the grid mutations from `line-cap-300-audit-grid.md`, which the lane re-runs and reports.

**Wave 3: after every merge, by the orchestrator.** `npm test && npm run lint && npm run format:check && npm run typecheck`, `npm run test:ux`, `node scripts/dom-compare.mjs <baseline>` and `node scripts/export-names.mjs <baseline>`. A red merge is reverted, not fixed on `main`. The manual browser checks are replaced by `dom-compare` plus, for pointer and drag paths in the grid, the closed audit survivors.

**Wave 4: close.** Change `max-lines` from 500 to 300 in `eslint.config.js` (and its comment) in one commit with `test/lint_size_cap.test.js`, written first so it fails: `MAX = 300` (titles use it); the 301-line probes at `src/views/create/x.js`, `src/views/play/x.js`, `src/color.js`, `src/views/library.js`, `src/views/x.mjs` and a bare `src/x.js`; the 300-line case passes; the disable-comment, scoped-to-`src/` and blank-line tests stay. `npm run lint` is what enforces "no `src/` file over 300"; the test pins the rule, its glob and its scope. Update `AGENTS.md` ("500 lines" to "300"), the `view-split.md` mention, and the README if it quotes the number. Then, by the orchestrator: `python scripts/features.py verify line-cap-300`, `restamp`, `progress`, commit.

Feature row: `line-cap-300`, `"plan": "docs/plans/line-cap-300.md"`, verify: `node --test test/lint_size_cap.test.js test/module_graph.test.js test/split_samples.test.js test/split_format.test.js test/split_create_logic.test.js test/split_color.test.js test/split_library.test.js test/split_grid.test.js && npm run lint && npm run test:ux`. The files are named one by one so deleting any of them fails the command (AGENTS rule 10); the command cannot pass before all of them exist and the cap is 300 (rule 3).

## Lane brief template

Every lane brief is this template filled in; the orchestrator does not improvise one.

```
LANE <id>: <one line>.
READ FIRST: docs/plans/line-cap-300.md (this lane's step, "Frozen cuts" and "Decisions"), the map for this file if any.
SETUP: git reset --hard main; node_modules junction to the main checkout; scratch copies only under scratchpad/<lane-id>/ (never the scratchpad root: lanes overwrote each other's scripts in Wave 0); baseline must pass:
  npm test && npm run lint && npm run format:check && npm run typecheck && npm run test:ux
YOU OWN (may edit): <exact files, including new files and your split test>.
MAY NOT TOUCH: FEATURES.json, PLAN.md, package.json, eslint.config.js, any plan doc, any other lane's files, anything not listed above.
INVARIANTS: <order and live-read rules for this file; new files never import the old path; shared helpers in the leaf; reads of shared state at call time; no destructuring of another module at construction>.
DO: <the move, the re-export lines, the split test (written first, watch it fail)>.
VERIFY (paste real output): the baseline commands again, plus node scripts/export-names.mjs <baseline> and wc -l of every new file (each <= 300).
MUTATIONS (run each, restore, report caught or not): <list from the audit and the file notes>.
STOP: two failed attempts at the same thing means stop and report what you tried. If the plan or a map looks wrong, stop and report instead of working around it.
COMMIT: subject says what, body says why; no Co-Authored-By trailer or AI attribution; do not push; do not touch the main checkout.
REPORT: check output, moved-lines numbers (git diff -w --stat and what changed outside the move), mutation results, commit hash.
```

Known traps, to put in every brief that applies: a name defined in the first part of a file and used in the second (`verdictOf`); a barrel that imports its own leaf and is imported back; `export *` hiding a name collision; `lib` fields copied instead of read live; a local variable that shadows the context or the state object; `window` listeners and their removal order in `destroy`.

## Results

Written as the round goes; finished when it is done: the baseline commit, each survivor and its disposition, `dom-compare` and `export-names` output per merge, line counts of every new file, and what moved from the plan.

### Wave 0 (done 2026-10-30)

- **Baseline:** `ca93716` (feature row active, review recorded). `dom-compare` baseline run: all 47 steps identical in about 15s, and `--self-check` detects a mutation. `export-names`: 43 modules identical. Color probe digest `318c8b99` (360 cases).
- **Tools built (lanes 0d-1, 0d-2):** `scripts/dom-compare.mjs`, `scripts/export-names.mjs`, `scripts/color-probe.mjs`, `test/helpers/split.js`, `test/module_graph.test.js` (14 tests). `npm run compare:dom` and `compare:exports` run the first two.
- **Mutation audits (0c):** `format.js` 30 mutations, 9 survived; `create-logic.js` 100, 37 survived (8 equivalent); `samples.js` 46, 17 survived (2 equivalent); `color.js` 46 of 79 planned (10 survived, 5 inconclusive), with the rest swept in 0e-2 as C48 to C98 (23 survivors, 15 closed); `grid.js` 25, 23 survived; `library.js` 25, 20 survived. Docs: `line-cap-300-audit-*.md`.
- **Survivors closed (0e):** unit tests `test/linecap_format.test.js`, `test/linecap_create_logic.test.js` (50 tests), `test/linecap_color.test.js`, `test/linecap_samples.test.js` (35 tests); UX checks `linecap-grid-*` (13) and `linecap-library-*` (9), pinned by id in `test/ux_registry.test.js`. Every closed survivor was re-run in a scratch copy and caught. Test totals now: 619 unit tests, 73 UX checks (`test:ux` about 15s, timed twice; README requoted).
- **Accepted survivors (equivalent mutants or unobservable, reasons in the test headers):** `format.js` `length < 2` guard in `jpegSize` (a length of 0 or 1 returns null either way); `create-logic.js` `Math.max(5, …)` in `defaultSize`, the leading trim in `titleFromFile`, `>=` in `centerCrop`, the `Math.min(imgH, …)` in `centerCrop`, `>` in `loadScale`, `<` in `artSize`; `color.js` C17 (no letters in `#000000`), C65, C67, C68, C75, C76, C87, C97, C98 (no difference on thousands of random inputs, or a stable sort); `samples.js` S34 (all samples are square), S35; `library.js` `store = null` in `unmount` (every later path uses the `store` captured at import start; closing it needs a `src/` change, out of scope).
- **Not covered (stated, not hidden):** the `color.js` mutations C06 and C42 were audit-inconclusive; C06 is equivalent and C42 was caught by 0e-2. `dom-compare` does not hash computed styles or layout, and its pointer steps are the fixed strokes. The `gridError` bounds, the `validateSave` hearts and hints bounds, the hex regex, `STATUSES` and the blank check in `format.js` were not mutated (cap reached); they sit in the file that keeps the validators and are tested by the existing suite, and nothing in the split edits them.
- **Moved from the plan:** library files use plain imports, not `export *`; `button` is in `library-state.js`; the 2b region is smaller than first written; the old step 2d (grid state object) is dropped (the map shows no shared state); `test/ux/pipeline-linecap.js` stays empty and unused (grid and library checks have their own files). Duplicate `tileIds` in `validateSet`: `format.js` has no duplicate-id refusal (it lives in `src/backup.js`, not touched here); whether `validateSet` should refuse repeated tile ids is a design question for AGENTS rule 6, left for a later change (AGENTS rule 9: not in this one).
- **Process notes:** two lanes shared one scratchpad and overwrote each other's scripts (cost a retry each); lane briefs for the next waves name a lane-specific scratch folder. One `test:ux` run crashed once on a Windows `EPERM` while deleting its Chrome profile folder, before reporting any check; reruns passed. Not fixed (outside this round).

## Gate

This plan gets its own gate: a `/gate-review` scoped to this round, run once every lane is merged and before anything is pushed. It is not combined with earlier rounds. Nothing in this plan pushes. Lanes merge to local `main` only.
