# Plan: bring every source file to 300 lines

Goal: lower the `max-lines` cap on `src/**` from 500 to ESLint's default of 300, so no source file is longer than 300 lines. Behavior must not change (AGENTS rule 9).

Follow-up to [view-split.md](view-split.md). That plan sets the cap at 500 as a ratchet against growth and splits the two views. This plan starts only after that one is merged and gated: it relies on `src/views/dom.js` and on the size-cap test (`test/lint_size_cap.test.js`) that plan creates, and it must re-measure after the view split, not assume.

Scope: `src/**` only, which is what the lint rule covers. Test files, `test/ux/checks.js` (883 lines), `research/` and `scripts/` are not capped and are not touched.

## Starting point (measured 2026-10-29, before the view split)

| File | Lines | Shape |
|---|---|---|
| `src/color.js` | 457 | color-space conversions, an older cell-averaging path, and the newer pixel-histogram path |
| `src/views/library.js` | 417 | row rendering, export and import flow, tile-set rendering |
| `src/format.js` | 354 | key allow-lists, JPEG size parsing, validators, id hashing |
| `src/views/grid.js` | 347 | one function, `renderGrid`, about 280 lines |
| `src/samples.js` | 338 | about 270 lines are the sample-art data arrays |
| `src/create-logic.js` | 334 | sizing, editor state, report text, save records, tile sets |

After the view split, the new view modules are expected to be under 300 already (largest about 200). Wave 0 re-measures every file and replaces this table with the real list; any new file the split leaves between 301 and 500 joins it.

## Decision: move to new files, keep the old path

Each split moves a coherent group of functions to a new file and re-exports it from the original path, so importers, tests and research scripts keep working unchanged. This is the lowest-risk shape (no importer edits, tests untouched, so they still prove behavior). The re-exports can be removed later, one importer at a time, and are not part of this plan.

Nothing is deleted. In particular `color.js` keeps the older cell-averaging method (the D25 path: `cellColors`, `kmeans`, `quantizeColors`, `cellColorGrid`), which production no longer uses but `test/color.test.js` and `research/color/` import. `colorGrid`, the function Create calls, is a one-line wrapper over `pixelColorGrid` and stays with the pixel path. Removing the old method would be a behavior and research decision, not a size fix.

## Proposed cuts (provisional; Wave 0 confirms line ranges)

| File | New files | Stays |
|---|---|---|
| `samples.js` | `samples-art.js` (the `ART` and `COLOR_ART` arrays, data only) | loaders and `sampleRecord`, about 70 lines |
| `format.js` | `format-keys.js` (limits, key lists, `pickKnown`, about 90); `format-art.js` (`jpegSize`, `boundArt`, about 70) | validators, id hashing, JSON, about 200 |
| `create-logic.js` | `create-save-logic.js` (art sizing, `buildPuzzleRecord`, `canSave`, tile-set slicing, writes and rollback, about 170) | editor state, sizing, crop, report text, about 160 |
| `color.js` | `color-space.js` (Lab and hex conversions, `deltaE`, `inkColors`, `inkText`, about 90); `color-cells.js` (the D25 cell-averaging path: `cellColors`, `kmeans`, `quantizeColors`, `clusterOf`, `cellColorGrid`, about 140) | the pixel-histogram path, `pixelColorGrid` and `colorGrid`, about 210 |
| `views/library.js` | `library-backup.js` (export, import and `runImport`, about 120); `library-sets.js` (set and tile rendering, about 90) | mount, render, rows; its own `el` becomes the `elc` from `dom.js`; about 200 |
| `views/grid.js` | cut decided by the Wave 0 map | |

`grid.js` is the hard one. `renderGrid` is a single function, so there is nothing to move until it is broken up. The map lists its inner pieces (clue rendering, pointer and drag handling, update and diff, sizing) and the state they share, and the lanes below follow it.

## Effort check

Estimates are rough agent-lane hours including verification. No chunk is above 4.

| Chunk | Est. hours |
|---|---|
| 0a re-measure plus pre-register rows | 0.5 |
| 0b `renderGrid` map (read-only) | 1.5 |
| 1a `samples.js` | 1 |
| 1b `format.js` (plus mutation proofs) | 3 |
| 1c `create-logic.js` | 2.5 |
| 1d `color.js` | 2.5 |
| 2a `library.js` backup | 2 |
| 2b `library.js` sets | 2 |
| 2c `grid.js` step 1: state object in place | 3 (risk) |
| 2d `grid.js` step 2: extract clue rendering | 3 |
| 2e `grid.js` step 3: extract pointer handling | 3 |
| 3 lower the cap, docs, restamp | 1 |

If the map shows `renderGrid` shares more than about 15 mutable bindings across its pieces, 2c is split by region (clue state, then pointer state) instead of one lane. If `grid.js` still measures over 300 after 2e, the remaining update path becomes its own step 2f; it is not exempted.

## Steps and parallelism

Before any lane starts, the orchestrator pre-registers the feature row `line-cap-300` with a failing verify command (`node --test test/lint_size_cap.test.js`, which asserts the 300 cap and fails while the config says 500), so lanes never edit `FEATURES.json`.

**Wave 0: two lanes at the same time (read-only or measurement).**

- 0a. Re-measure every file under `src/` (`npx eslint . --rule '{"max-lines":["error",300]}'` as a dry run, then `wc -l`) and replace the starting-point table with the result. Records the baseline for the gate.
- 0b. Read-only map of `renderGrid`: every inner function and handler with its line range, the state each reads and writes, and a proposed cut. Output is a doc in `docs/plans/`, no code.

**Wave 1: four lanes at the same time.** Disjoint files: `samples.js`, `format.js`, `create-logic.js`, `color.js` (and their new files). None of them is imported by another lane's file in a way that edits it, because every old path re-exports. Needs 0a only.

- Each lane moves its group, re-exports from the old path, and changes nothing else.
- `format.js` is the import boundary (AGENTS rule 6). Its lane proves the moved allow-lists still bite: for each of `PUZZLE_KEYS`, `SAVE_KEYS` and `SET_KEYS`, remove one key in the new file, confirm `test/import_bounds.test.js` fails, then restore it (one mutation per list, results recorded in the plan's Results section).
- The `color.js` lane runs `test/color.test.js` and `node research/color/cluster.mjs` before and after and checks the printed palettes are identical, since seeded k-means must not shift.

**Wave 2: two groups at the same time.** Needs Wave 1 merged only for the shared full-check baseline; the files are disjoint from Wave 1.

- Library: 2a and 2b in parallel. Their regions of `library.js` do not overlap (backup is lines 75 to 195, sets are 287 to 377); shared helpers (`say`, `button`, `el`) stay in `library.js` and are passed in through a small context object, the same pure-move shape as the view split. Needs `dom.js` from the view split.
- Grid: 2c, 2d, 2e in order (all edit `renderGrid`), needs 0b. Grid is shared by Play and Create, so it is verified by `grid.test.js`, the UX checks and the manual checks below.

**Wave 3: sequential, after every merge.** `npm test && npm run lint && npm run format:check && npm run typecheck` and `npm run test:ux`. After the grid lanes the orchestrator drives the manual checks in the browser pane (play a puzzle at a narrow and a wide width, paint in Create), one at a time, since the pane is shared.

**Wave 4: close.** Change `max-lines` from 500 to 300 in `eslint.config.js` and update `test/lint_size_cap.test.js` (created by the view split) to match: a 301-line text at `src/color.js`, at a view path and at a root `src/` path errors (including with a disable comment at the top); a 300-line text passes. `npm run lint` must be clean with the new cap and no override added. Update the stale numbers in the README file map and AGENTS, restamp the feature rows at a clean commit (`python scripts/features.py restamp`), regenerate `PROGRESS.md`, then the gate.

Feature row: `line-cap-300` (verify: `node --test test/lint_size_cap.test.js` plus `npm run lint`; fails if the cap goes back above 300, the rule is removed, or any `src/` file passes 300 lines).

## Gate

This plan gets its own gate: a `/gate-review` scoped to this round, run once every lane is merged and before anything is pushed. It is not combined with the view split or the end-to-end checks round. Nothing in this plan pushes. Lanes merge to local `main` only.
