# Plan: split the view files and enforce the storage rule

Goal: make `src/views/create.js` (922 lines) and `src/views/play.js` (778 lines) smaller and easier to change, enforce the "only `store.js` touches localStorage" contract with a lint rule, and keep the views from growing back with a size cap. Behavior must not change (AGENTS rule 9).

Independent of the end-to-end checks plan (`e2e-pipeline-checks.md`), which has been gated and pushed on its own. The existing safety net is `create.test.js`, `game.test.js`, `play-state.test.js`, the UX checks, lint and typecheck; all must pass after every move.

## Decision: pure move

Both views are one `mount()` closure over shared mutable state (create: `st`, `image`, `history`, `savedSig`, the solver client and timers; play: `cells`, `hearts`, `elapsedMs`, `drag`, `brush` and more). Functions move to new modules and receive a context object (state, DOM refs and callbacks). Two mechanical steps make that possible and neither changes behavior: the DOM-building block moves out (Wave 1a), and the closure's `let` variables become fields of one state object so a moved function can assign them (Wave 1b). State is not otherwise redesigned or reduced in this plan.

## Target layout

- `src/views/dom.js`: the shared `el()` helpers. The two views define `el` with different signatures (create: `el(tag, props, ...children)`, 57 call sites; play: `el(tag, className, text)`, 47 call sites). They are not merged: `dom.js` exports `el` (create's form) and `elc` (play's form), and play's call sites are renamed to `elc`. Lint (`no-undef`) and typecheck prove no site was missed.
- `src/views/create/`: `index.js` (mount, wiring), `build.js` (DOM construction), plus the Wave 2 modules below.
- `src/views/play/`: `index.js`, `build.js`, plus the Wave 2 modules below.
- `eslint.config.js`: three additions.
  - `no-restricted-globals` for `localStorage` and `sessionStorage`, and `no-restricted-properties` for `globalThis.localStorage` (which `store.js` uses as a default argument), on `src/**`, with an override for `src/store.js`. Grep shows no violations today.
  - `linterOptions.noInlineConfig: true`, so a `/* eslint-disable */` comment cannot switch a rule off. No inline directives exist in the repo today, so this costs nothing.
  - `max-lines` at 500 on `src/**` (Wave 4). 500 passes every current file except the two views (the next largest is `color.js` at 457). It counts raw lines, with no blank-line or comment exemptions, so it cannot be argued around. 500 is a ratchet against growth, not the target: bringing every file down to 300 is the follow-up plan, [line-cap-300.md](line-cap-300.md), which starts only after this one is gated.

### Module cut (measured in Wave 0b; see [view-split-map-create.md](view-split-map-create.md) and [view-split-map-play.md](view-split-map-play.md))

Create (922 lines, `mount` spans 119 to 916). Five modules, as first proposed, with two corrections: `artFor` moves to `save` (only the save functions call it), and ten functions the first table did not place stay in `index.js` (`showError`, `syncControls`, `dims`, `tiled`, `okToDiscard`, `newBlank`, `onBlank`, `onStartOver`, `onResize`, `teardown`).

| Module | Functions today | Estimated lines |
|---|---|---|
| `build` | the DOM block (lines 142 to 251), `sizeSelect` | 125 |
| `image-source` | `decodeFile`, `currentCrop`, `regenerate`, `onFile`, `onSize`, `onSlider`, `onReset`, `onColors`, `onInvert` | 175 |
| `crop-preview` | `drawPreview`, `onPreviewDown`, `onPreviewMove`, `onPreviewUp` | 70 |
| `grid-view` | `fitCells`, `renderGridNow`, `markTileBoundaries`, `onGridPointer`, `syncBrushes`, the history functions, `onKeydown` | 145 |
| `report` | `showReport`, `scheduleReport` | 125 |
| `save` | `showSaveMessage`, `artFor`, `onSave`, `saveSingle`, `saveSet` | 135 |
| `index` | the shell functions above, wiring, state setup, `unmount`, the draft code | 210 |

Play (778 lines, `mount` spans 82 to 766). The map found 12 module-crossing writes under the first five-module cut, most of them in `restart` (which writes 11 fields), so the plan's own open item applies: the split is narrowed. Actions, input and the clock stay together as one `session` module instead of three.

| Module | Contents | Estimated lines |
|---|---|---|
| `build` | the DOM block (lines 97 to 261) minus seven spans of behavior that stay in `mount` | 170 |
| `hud` | `refresh`, `reduceMotion`, `showStrip`, `clearReveal`, `syncReveal` | 100 |
| `persist` | the load block, `snapshot`, `persist`, export and import save, `persistNow`, `pendingNotes` | 190 |
| `rules-layout` | `pickBrush`, `syncMode`, `syncCoarse`, `sizeGrid`, `settle`, `rememberRule` | 90 |
| `session` | the clock (`startClock`, `tick`, `onVisibility`), `commit`, `onPointer`, `preview`, `step`, `restart`, the rule-toggle, hint, restart and Zen handlers, `onKey`, undo and redo | 210 |
| `util` | `reveal`, `sameGrid` | 10 |
| `index` | module state (`root`, `grid`, `cleanup`, `generation`), `ensureCss`, `loadPuzzle`, `showMissing`, `mount`, `unmount`, listener registration | 130 |

Left out of the play split on purpose: separate `input`, `actions` and clock modules. If `session` measures over 250 lines, the clock splits out and `restart` calls `clock.reset()` instead of assigning its fields.

Constraints the maps found, which every Wave 1 and 2 brief repeats:

- Create: `st` stays a nested object inside the state object (`onStartOver` resets it with `Object.assign(st, ...)` and the saved draft reuses it). The draft saves 7 fields; it must not become the whole state object. Create's modules have one call cycle (`image-source` and `crop-preview` call each other), so modules call each other through the shared context at run time, never by destructuring at construction.
- Play: functions read `history`, `cells` and `drag` live through the state object (undo reads `history` after `restart` replaces it). `unmount` keeps its order: cleanup with the final clock tick, then `persistNow()`. The import handler takes a `remount` callback instead of importing `mount` (no circular import), and reads `generation` through a getter.
- Neither view has a unit test; the UX checks are the only safety net. Play's Export and Import save have no check at all (see lane 1d).

## Effort check

Estimates are rough agent-lane hours including verification. No chunk is above 4. The two that carry risk are marked.

| Chunk | Est. hours |
|---|---|
| 0a lint rules plus rule test | 1.5 |
| 0b map, create | 1.5 |
| 0b map, play | 2 |
| 0c `dom.js` | 1 |
| 1a DOM builder out, create | 2.5 |
| 1a DOM builder out, play (its block interleaves swatch and mode handlers) | 3.5 (risk) |
| 1b state object, create | 2.5 |
| 1b state object, play | 3.5 (risk) |
| 1c context contract, folder move, stubs, layout test (each view) | 2.5 |
| 1d UX check for the save-file export and import round trip, with mutations | 3 |
| 2 extraction lanes (each of the nine below) | 2 to 3.5 |
| Wave 3 merge and verify (per lane) | 0.5 |
| 4 size cap, docs, restamp | 1.5 |

The maps counted 17 mutable bindings in play (45 write sites) and 12 in create, under the limit of about 25, so 1b stays one lane per view. No module is estimated over 250 lines.

## Steps and parallelism

Before any lane starts, the orchestrator pre-registers the feature rows (`storage-lint-rule`, `split-create-view`, `split-play-view`, `view-size-cap`) with verify commands that fail, so lanes never edit `FEATURES.json` (the e2e round's conflicts were all there). Layout tests are one per view (`test/views_layout_create.test.js`, `test/views_layout_play.test.js`) so each row's verify command fails if only its own view's modules go missing (AGENTS rule 10).

**Wave 0: four lanes at the same time (disjoint files).**

- 0a. Lint rules (`eslint.config.js`, new `test/lint_rules.test.js`). The test uses ESLint's `lintText` against the repo config and asserts: `localStorage` in `src/views/x.js` is an error; the same text in `src/store.js` is not; `globalThis.localStorage` is an error elsewhere; a file that starts with an eslint-disable comment still errors (proves `noInlineConfig`). No probe file is left in the tree.
- 0b. Read-only maps of both closures, two lanes (create, play). For each: every inner function with its current line range, the state it reads and writes, the proposed module, every `let` binding, and a count of module-crossing writes. Output is a doc in `docs/plans/`, no code.
- 0c. `views/dom.js`, touching only the `el` definitions, their call sites in play (rename to `elc`), and the import lines.

0b feeds Wave 1. 0c must merge before Wave 1 starts (not Wave 2 as first drafted): Wave 1a moves the DOM block, and the new `build.js` files import from `dom.js`. 0a depends on nothing and nothing depends on it; it can finish at any point before Wave 4.

**Wave 1: per view, three steps in order; the two views run side by side. A fourth lane, 1d, runs alongside.**

Sequential inside a view because all three edit the same file; the order puts the stateless move first so the state conversion has fewer references to touch.

- 1a. Move the DOM-construction block into `build.js`. It takes the initial values it needs (create: `st`, the restored draft title; play: the puzzle, store prefs) and returns one refs object. Event listeners that call closure functions stay in `mount` and attach to the returned refs. Behavior and DOM are identical.
- 1b. In place, turn the closure's `let` variables into fields of one `state` object and update every reference. No file moves; the diff is mechanical and the full check plus UX checks prove nothing changed.
- 1c. `git mv` the view into its folder as `index.js` and update the import in `app.js`. Define the context shape (state, refs, callbacks) as a JSDoc typedef so typecheck enforces it. Create every Wave 2 module as an empty factory (`createReport(ctx)` returning `{}`), call each factory once in `index.js` in one pre-registered block, and add the view's layout test pinning the module paths and export names. Nothing has moved yet, so everything stays green. Wave 2 lanes then edit only their own module and delete from `index.js`.
- 1d. A new UX check for play's Export save and Import save, which have no check today and are the code the `persist` move touches most (the play map's biggest risk). Touches only `test/ux/` files and the registry test. Play a few moves, export (captured download), change the grid, import the exported file, and assert the saved state is back (cells, elapsed time, hearts); then import a file for a different puzzle and assert the app's remount behavior. Proved by mutation: break the import handler's write and the remount path, and the check must fail. It must merge before the Wave 2 `persist` lane. It needs no source change, so it can start immediately and in parallel with 1a.

**Wave 2: extraction lanes, in rounds.**

One lane per module. Each lane moves its functions into its module's factory, deletes them from `index.js`, and changes callers elsewhere in `index.js` to `module.fn(...)`. Those one-line caller edits are the expected merge conflicts; the orchestrator resolves them at merge. Lanes touch only their own module, `index.js`, and nothing else. A shared helper goes to the earlier merged module.

Cap: at most 3 live lanes per view and 4 in flight in total (the e2e round ran four cleanly). Each round is cut from the merged result of the previous one, so rounds are also the merge points.

- Round 2.1: create `report`, create `save`, play `hud`, play `persist` (4 lanes). `persist` goes first or with `hud` because it takes `pendingNotes` and `persistNow` out of the index.
- Round 2.2: create `crop-preview`, create `grid-view`, play `rules-layout`, play `session` (4 lanes; `session` is cut after `hud` and `persist` have left `index.js`).
- Round 2.3: create `image-source` alone (last, because it holds 16 of the 24 crossing writes and calls into both earlier rounds).

These rounds come from the two maps. Play's `util` (ten lines) is created by the `hud` lane, the first to need it.

**Wave 3: sequential, after every merge.** `npm test && npm run lint && npm run format:check && npm run typecheck` and `npm run test:ux`. The orchestrator drives the manual checks in the browser pane after each round (Create with a photo; play a puzzle at a narrow and a wide width), one at a time, since the pane is shared.

**Wave 4: close.** Turn on `max-lines` 500 for `src/**` and add `test/lint_size_cap.test.js` (written first, so it fails until the rule is on) to assert it: a 501-line text at `src/views/create/x.js`, at `src/views/play/x.js` and at `src/color.js` errors (including with a disable comment at the top); a 500-line text passes. Every file must already be at or under 500 when this lands; the provisional cut puts the largest new module at about 200, so a module that measures over 500 after its lane is split further rather than exempted, and no lane adds an override. Update the AGENTS "Where things are" line and the README file map. Restamp the feature rows at a clean commit (`python scripts/features.py restamp`), regenerate `PROGRESS.md`, then the gate.

Feature rows: `storage-lint-rule` (verify: `node --test test/lint_rules.test.js`), `split-create-view` and `split-play-view` (verify: their layout test, the view's logic tests, and `npm run test:ux`; the play layout test pins `build, hud, persist, rules-layout, session, util, index`), `save-file-ux-check` (verify: `node --test test/ux_registry.test.js && npm run test:ux`), `view-size-cap` (verify: `node --test test/lint_size_cap.test.js` plus `npm run lint`; the file does not exist until Wave 4, so the row cannot pass early; it fails if the rule is removed, if its scope narrows, or if any file under `src/` passes 500 lines).

## Open item for Step 0b: resolved

The play map showed 12 module-crossing writes under the first cut, so the play split is narrowed as described above (one `session` module in place of `input`, `actions` and the clock). The create map showed none that needed narrowing.

## Gate

This plan gets its own gate: a `/gate-review` scoped to this round, run once every lane is done and merged, before anything from this plan is pushed. It is not combined with the end-to-end checks round, which was gated (pass 7) and pushed separately. Nothing in this plan pushes. Lanes merge to local `main` only.

## Results

Executed 2026-10-29 on local `main` (not pushed). Every file under `src/` is at or under 500 lines; the largest is `src/color.js` at 457 and the largest view file is `src/views/create/index.js` at 289 (was `create.js` at 922; `play.js` was 778 and `src/views/play/index.js` is now 220). Both views split cleanly; the largest new module is `play/session.js` at 220.

| Piece | Where it landed |
|---|---|
| Storage and inline-disable lint rules, with `test/lint_rules.test.js` | Wave 0a |
| `src/views/dom.js` with `el` and `elc` (play had 47 call sites, not 48: the 48 counted the definition) | Wave 0c |
| Read-only maps of both closures | `view-split-map-create.md`, `view-split-map-play.md` |
| DOM builders, state objects, folders, context contracts, stubs | Wave 1 (1a, 1b, 1c) |
| Save-file export and import UX check (`pipeline-save-file-round-trip`) | Wave 1d |
| Create: `report`, `save`, `crop-preview`, `grid-view`, `image-source` | Rounds 2.1 to 2.3 |
| Play: `hud`, `persist`, `rules-layout`, `session` (`util` landed in 1c) | Rounds 2.1 and 2.2 |
| `max-lines` 500 on `src/**` with `test/lint_size_cap.test.js` | Wave 4 |

### What changed from the plan as written

- Play's split was narrowed (one `session` module in place of `input`, `actions` and the clock), as the open item allowed; see the module table above.
- Wave 1 grew a fourth lane (1d), because the persist move had no automated cover.
- The size-cap test is its own file, so its feature row cannot pass before the rule exists.
- `util.js` was created in 1c (it holds two pure helpers), not by the `hud` lane.
- `rules-layout` could not take over the first calls of `pickBrush`, `syncMode` and `syncCoarse` where they stood (they ran before the context exists). They moved to just after the module is built, with the `coarse` listener registration still the first push into `cleanup`; the rendered play page matched the pre-split page at open and through a 10-step interaction sequence.
- `clearPersistNow` sets `persistNow` to a no-op function, not `null`, because `unmount` calls it unconditionally (the original code assigned a no-op).
- Typing: the lanes' temporary `@ts-expect-error`, `@ts-ignore` and `Record<string, any>` annotations were removed at each merge; the new context fields are typed in the two `context.js` files, and the module slots now use real `ReturnType` types in create.

### Checks run by the orchestrator, beyond each lane's own

- After every merge: `npm test`, lint, format, typecheck and `npm run test:ux` (50 pass at the end; 49 plus the new save-file check).
- Rendered-page comparison in the browser pane against a checkout of the commit before the split (`d670153`): the 14 sample play pages and the Create page are byte-identical at open; a 10-step play sequence (fill, cross, fill, undo, undo, redo, restart, undo, toggle) gives identical DOM hashes at every step; a 15-step Create sequence (upload, threshold, invert, reset to auto, width, colors on and off, edit, undo, redo, start over, second upload, save) gives identical hashes at every step.

### Coverage gaps found (changes that no UX check noticed)

Each was found by a lane's mutation and not fixed, per the brief. Recorded here so the gate and the next round can decide.

- Create: dropping the `image` reset in `newBlank`; dropping the `savedSig` reset in `onStartOver`; dropping the stale-result guard on the report timer's success path; dropping the `clearTimeout` in `scheduleReport`; dropping the `savedSig` write after a successful save; swapping the crop in `artFor` for the whole image; dropping the crop-box drag (`st.offset` write) and the crop overlay drawing; the `onSize` width and height writes are caught by one check only; dropping `scheduleReport` from `renderGridNow` is caught only through solver-wait timeouts in three other checks.
- Play: reading a stale `history` in undo and redo; dropping the `state.history` replacement in `restart`; breaking `elapsedMs` accumulation in `tick`; always drawing a full heart in `refresh`; skipping `clearReveal` on restart; saving before the final clock tick in `unmount`; the gutter calculation in `sizeGrid`; the Redo button's presence.

Not exercised at runtime: dragging the crop box. The browser pane had a zero-size viewport, so synthetic drags changed nothing in either build, and the earlier lane's mutation of the drag code was not caught either. The move of `crop-preview` is verified by reading the diff (the function bodies are identical apart from a local rename of `ctx` to `g` and the shell calls) and by the mutation table, not by a before and after run. A drag on a wide photo in a real browser is the check still owed.
