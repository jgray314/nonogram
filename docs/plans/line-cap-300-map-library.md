# Map: src/views/library.js (417 lines, baseline ca93716)

Read-only map for lane 0b-library of [line-cap-300.md](line-cap-300.md). Line numbers are for `src/views/library.js` at `ca93716`. Nothing in `src/` was edited.

## 1. Functions and line ranges

| Function | Lines | Notes |
|---|---|---|
| imports | 2-8 | `idMatches`, `createStore`, `toWebpbn`, `buildBackup/parseBackup/planImport/ratePlan/droppedArtCount`, `createSolverClient/ratePuzzleWith`, `loadSamples`, `libraryModel/safeFilename/tileSolved/tileFace` |
| module `let`s | 10-17 | root, store, status, listEl, toolbarButtons (comment 14), generation (comment 16) |
| `ensureCss` | 19-26 | writes `<link>` into `document.head` (outlives the mount) |
| `el` | 28-33 | identical signature and behavior to `elc` in `src/views/dom.js` |
| `button` | 35-40 | |
| `link` | 42-46 | |
| `download` | 48-57 | |
| `say` | 59-61 | |
| `exportXml` | 63-67 | |
| `deletePuzzle` | 69-73 | |
| `exportLibrary` | 75-89 | |
| `forThisMount` | 91-101 (doc 91-95) | |
| `importLibrary` | 103-118 (doc 103-107) | |
| `runImport` | 120-191 | |
| `addSamples` | 193-202 | |
| `moreMenu` | 204-218 (doc 204) | |
| `rowNode` | 220-260 | |
| `render` | 262-284 | |
| `solutionCanvas` | 286-301 (doc 286) | |
| `tileNode` | 303-328 | |
| `tileBox` | 330-340 (doc 330-334) | |
| `setNode` | 342-369 | |
| `deleteSet` | 371-376 | |
| `mount` (exported) | 378-407 | |
| `unmount` (exported) | 409-417 | |

The file has exactly two exports, `mount` and `unmount`. No default export.

## 2. Module-level state

| Variable | Written | Read | Cleared in `unmount` |
|---|---|---|---|
| `root` | `mount` 382 | `mount` 383, 404, 405 (append); `unmount` 411 (`root?.remove()`) | 412 `= null` |
| `store` | `mount` 381 | `exportXml` 64, `deletePuzzle` 71, `exportLibrary` 76-78, `runImport` 122 (snapshot into local `store0`), `addSamples` 195 (passed to `loadSamples`), `render` 263 (`libraryModel(store)`), `deleteSet` 373-374 | 413 |
| `status` | `mount` 401 | `say` 60 only | 414 |
| `listEl` | `mount` 403 | `render` 264, 266, 270, 275, 277, 282 only | 415 |
| `toolbarButtons` | `mount` 395 (reassigned to a fresh array), `unmount` 416 | `importLibrary` 110 and 115 (115 inside `ui(...)`), `mount` 400 | 416 `= []` |
| `generation` | `mount` 379 (`+= 1`), `unmount` 410 (`+= 1`) | `forThisMount` 97 and 99 | never cleared; only ever incremented |

Observations that affect the split:

- `root` is read only in `mount`/`unmount`; `listEl` only in `render`. Both stay in `library.js` after the split, so they could remain plain module `let`s there. Moving them into `lib` (decision 4) is harmless but not required; the backup and sets files never touch them. Fields the other files actually need: `store`, `status`, `generation`, `toolbarButtons`, and `render`.
- `lib.toolbarButtons` must be assigned (not mutated) in `mount` and reset with `= []` in `unmount`, as today. `importLibrary` line 110 iterates the array that existed at start; line 115 reads the live field but only inside `ui`, which is a no-op after unmount or remount, so a later mount's buttons are never touched.
- `generation` must keep incrementing in `unmount`; do not replace `lib` with a new object or reset the counter (an in-flight task from an earlier mount holds `gen` and would then match a later mount).
- `runImport` line 122 `const store0 = store` stays a snapshot of `lib.store`. Every other `store` read is synchronous and runs while mounted.

## 3. `forThisMount`

Returns `(fn) => { if (gen === generation) fn(); }` where `gen` is captured at call time. Called by `importLibrary` (109) and `addSamples` (194). The returned `ui` is passed into `runImport` and wraps every post-await touch of `say`, `render`, and `toolbarButtons`. It reads `generation` live in the closure body (line 99), so after the split it must read `lib.generation` at call time and compare to the captured copy. Not-gated calls after an await: `runImport` writes to `store0` (the snapshot) and `ratePlan`/solver work; neither touches the page.

## 4. Who calls `render`

| Call site | Line | Context | Gated by `ui`? |
|---|---|---|---|
| `deletePuzzle` | 72 | sync click handler | no (mounted) |
| `runImport` | 166 | write-failure path, inside `ui(...)` | yes |
| `runImport` | 188 | success path, inside `ui(...)` | yes |
| `addSamples` | 197 | inside `ui(...)` | yes |
| `deleteSet` | 375 | sync click handler | no (mounted) |
| `mount` | 406 | last statement, after `el0.append(root)` | n/a |

`render` itself calls `setNode` (281) and `rowNode` (275). After the split, the callers in `library-backup.js` (166, 188) and `library-sets.js` (375) use `lib.render()`; `deletePuzzle` and `addSamples` and `mount` stay in `library.js` and may call `render` directly. `lib.render = render` must be assigned in `mount` before the first `render()`; since the ungated callers only run while mounted and the gated ones check the generation, `unmount` does not need to clear `lib.render` (clearing it is also safe).

## 5. Order

`mount` (378-407): `generation += 1` -> `ensureCss('css/library.css')` -> `store = createStore()` -> create `root` and append h1 -> create toolbar, hidden file input, `change` handler (closure; reads `file.files[0]`, clears `file.value`, awaits `importLibrary`) -> `toolbarButtons = [button(Export), button(Import -> file.click()), button(Load sample puzzles -> addSamples)]` -> `toolbar.append(...toolbarButtons, file)` -> `status` created with `role=status` -> `listEl` created -> `root.append(toolbar, status, listEl)` -> `el0.append(root)` -> `render()`. After the split add `lib.render = render` before the first `render()`; set `lib.store`, `lib.status`, `lib.toolbarButtons`, `lib.generation` at the same points as today. `status` must exist before the first `render()` (nothing in `render` reads it, but `say` after it does).

`unmount` (409-417): `generation += 1` -> `root?.remove()` -> `root = null` -> `store = null` -> `status = null` -> `listEl = null` -> `toolbarButtons = []`. No listeners are registered on `window`/`document`; all listeners are on nodes that `root.remove()` drops. There is no "mount twice without unmount" guard (app.js always unmounts first, `src/app.js:43`).

## 6. State that outlives a mount

- `generation` (monotonic, never reset).
- The `<link data-nng-css="css/library.css">` in `document.head` (`ensureCss` is idempotent).
- In-flight promises: `importLibrary`/`runImport` (reads `file`, solver worker, store writes via `store0`) and `addSamples` (`loadSamples(store)` writes) keep running after unmount; they finish their writes but never touch the page (`ui`). The solver worker is terminated in `finally` (155).
- `lib` itself (after the split) outlives mounts; its fields are all reset by `unmount` except `generation`.

## 7. Importers of library.js

- `src/app.js:3`: `import * as library from './views/library.js'`; used as `{ view: library }` in the route table; the router calls `current.mount(main, route.params)` and `current.unmount()` (app.js 43, 46).
- `test/lint_size_cap.test.js:20`: the path string `'src/views/library.js'` as a lint probe filename only (no import).
- `src/`, `test/`, `research/`, `scripts/`: no other import. No test imports library.js (confirmed by grep). `test/ux/checks.js` exercises it through the DOM (`.nng-lib-row`, `#/library`, the Color badge check `color-library-badge`, `library-empty-guidance`, etc.). PLAN.md mentions the path in tables only.
- Consequence: `mount` and `unmount` are the only names that must remain exported from `src/views/library.js`.

## 8. Helpers and users

| Helper | Defined | Used by |
|---|---|---|
| `el` | 28 | `button` 36, `link` 43, `moreMenu` (6 calls), `rowNode` (13), `render` (4), `tileNode` (3), `setNode` (7), `mount` (6). 37 call sites. Same signature as `elc(tag, className, text)`; no shadowing (`el0` is the mount parameter). Not used by the backup code. |
| `button` | 35 | `moreMenu` 209, 213; `setNode` 356 (the sets code); `mount` 396-398 |
| `link` | 42 | `moreMenu` 212; `rowNode` 255. library.js only |
| `say` | 59 | `exportXml` 65, `exportLibrary` 84, `runImport` 124, 143, 152, 167, 189, `addSamples` 198 |
| `ensureCss` | 19 | `mount` 380 only |
| `download` | 48 | `exportXml` 66, `exportLibrary` 81 only |

## 9. Hypothesis table: confirmed and corrected

### Corrections to the plan

1. **`button` is shared between library.js and library-sets.js** (`setNode` line 356 uses it for "Delete set"), but the plan puts `button` in `library.js`. A sets file cannot import it (cycle). Move `button` to the leaf `library-state.js` (it only needs `elc`), or inline `elc('button', ...)` in sets (a behavior-identical but larger change; not recommended). Recommendation: `button` lives in `library-state.js`. `link` stays in `library.js` (library.js only).
2. **`library.js` must not use `export * from` for the new files.** The plan's Decision 1 and the "split test" template assume a re-export barrel, but `library.js` exports only `mount` and `unmount`. `export * from './library-backup.js'` would add `exportXml`, `exportLibrary`, `importLibrary` (and `setNode`) to the old path's export set and make `scripts/export-names.mjs` fail. Use plain `import { ... }` lines; the split test for library should assert the functions are defined in the new files and absent from `library.js`, and that `library.js` imports them (not re-exports). The brief for 2a should say so.
3. **Region 2b is "48 to 195" in the plan; the true boundaries are different.** 48-191 holds `download`, `say`, `exportXml`, `deletePuzzle`, `exportLibrary`, `forThisMount`, `importLibrary`, `runImport`. `say` and `forThisMount` move to the leaf in 2a (not 2b). `deletePuzzle` (69-73) stays in `library.js` and sits in the middle of the 2b region (between `exportXml` and `exportLibrary`); 2b must leave it. `addSamples` is at 193-202, outside the 48-195 span except its first lines 193-195, so the plan's "minus addSamples" understates the overlap. Corrected 2b region after 2a (original numbers): 48-57 (`download`), 63-67 (`exportXml`), 75-89 (`exportLibrary`), 103-191 (`importLibrary`, `runImport`). Not 2b: 59-61, 69-73, 91-101, 193-202.
4. **Imports on lines 2-8 are a conflict hot spot** for 2b and 2c, which the plan does not name (plan says 2a "pre-registers the three import lines" but removing the now-unused old imports is also a header edit). 2b stops using `idMatches`, `toWebpbn`, `buildBackup`, `parseBackup`, `planImport`, `ratePlan`, `droppedArtCount`, `createSolverClient`, `ratePuzzleWith`, `safeFilename`; 2c stops using `tileSolved`, `tileFace`. `libraryModel` and `loadSamples`, `createStore` stay. `library-logic.js` import (line 8) is shared by both lanes, so it conflicts. 2a should split the header into one import statement per lane group: format (2b), webpbn (2b), backup.js (2b), solver-client (2b), `safeFilename` (2b, own line), `libraryModel` (stays), `tileSolved, tileFace` (2c, own line). Then each lane deletes only its own lines. Alternatively 2a leaves the unused imports and the lanes remove them at the end, but lint's no-unused-vars would fail the intermediate commits.
5. **Minor:** the plan says `forThisMount` and "backup code both use it"; actually `addSamples` (library.js) and `importLibrary` (backup) use it, which agrees. `say` is also used by `exportXml`, `exportLibrary`, `runImport`, `addSamples`, so the leaf holding `say` is right.

### Files (all confirmed with the above corrections)

| File | Contents (original lines) | Est. lines | Imports |
|---|---|---|---|
| `library-state.js` (leaf) | `lib` object (6-7 fields + `render`) with the field comments (10-17), `say` (59-61), `forThisMount` with doc (91-101), `button` (35-40) | about 45 | `./dom.js` (`elc`) |
| `library-backup.js` | `download` 48-57 (private), `exportXml` 63-67 (export), `exportLibrary` 75-89 (export), `importLibrary` 103-118 (export), `runImport` 120-191 (private) | about 135 | `./library-state.js` (`lib`, `say`, `forThisMount`), `../format.js` (`idMatches`), `../webpbn.js`, `../backup.js`, `../solver-client.js`, `../library-logic.js` (`safeFilename`) |
| `library-sets.js` | `solutionCanvas` 286-301, `tileNode` 303-328, `tileBox` 330-340, `setNode` 342-369 (export), `deleteSet` 371-376 | about 100 | `./library-state.js` (`lib`, `button`), `./dom.js` (`elc`), `../library-logic.js` (`tileSolved`, `tileFace`) |
| `library.js` | imports, `ensureCss`, `link`, `deletePuzzle`, `addSamples`, `moreMenu`, `rowNode`, `render`, `mount`, `unmount`; `el` calls become `elc` | about 175 | all three new files, `./dom.js`, `../store.js`, `../samples.js`, `../library-logic.js` (`libraryModel`) |

All four are well under 300. Import edges: `library-state -> dom`; `library-backup -> library-state`; `library-sets -> library-state`; `library -> {state, backup, sets, dom}`. Acyclic, and no new file imports `library.js`. `render` is reached as `lib.render()` from backup (166, 188) and sets (375), per Decision 4.

Elc rename: replace the 37 `el(` call sites (list: lines 28 definition, 36, 43, 206-208, 221-223, 226-227, 229, 234, 238, 242, 249, 251, 254, 266, 270, 274, 279-280, 310, 314, 321, 343-344, 346-348, 359, 382-383, 385-386, 401, 403) and delete the local definition (28-33). Behavior is identical.

## 10. Regions for the later lanes

- **2a (foundation):** header (lines 1-17), `el` (28-33), `button` (35-40), `say` (59-61), `forThisMount` (91-101), every `store`/`status`/`generation`/`toolbarButtons` reference becoming `lib.<field>`, `mount` and `unmount` bodies, `lib.render = render`. Creates both stub files and the per-lane import lines.
- **2b owns:** `download` 48-57, `exportXml` 63-67, `exportLibrary` 75-89, `importLibrary` and `runImport` 103-191, plus its own import lines. Call sites it must keep working but need not edit: `moreMenu` 213 (`exportXml`), `mount` 396-397 (`exportLibrary`), 393 (`importLibrary`).
- **2c owns:** `solutionCanvas` through `deleteSet` 286-376 and its import line (`tileSolved`, `tileFace`). Call site `render` 281 (`setNode`) keeps its name.
- **Hot spots outside both regions:** `deletePuzzle` 69-73 (between 2b functions; calls `render` and `lib.store`; stays), `moreMenu` 204-218 (references `exportXml`), the import header 2-8 (conflict unless split as in correction 4), `forThisMount` 91-101 (leaf move by 2a, sits between `exportLibrary` and `importLibrary`), and the `mount` toolbar array 395-399. A conflict anywhere else is a plan defect.
- Adjacent in the baseline: `say`, `deletePuzzle`, `forThisMount` are interleaved between 2b functions, so 2a should move `say` and `forThisMount` first; otherwise 2b's diff splits into four separated hunks.

## 11. Mutation and test notes

No unit test imports `library.js`. Mutation candidates for the 2b/2c briefs (from this read): drop `idMatches` filter (126-133), drop the `parsed.saves` filter (130), remove `solver?.terminate()` (155), swap `gen === generation` in `forThisMount`, drop `toolbarButtons` re-enable (115), drop `ui` wrapper at 151/165/187, remove `render()` in `deleteSet` (375) or `deletePuzzle` (72), replace `store0` with live `lib.store` in `runImport` (the unmount-clears-store trap), reorder `generation += 1` in `unmount`, and in sets: drop `face === 'art'` branch (320-324), `mosaic-complete` class (359), `--tile-w` property (362-363), `set.progress.complete` label (352).
