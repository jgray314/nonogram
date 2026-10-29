# Plan: split the view files and enforce the storage rule

Goal: make `src/views/create.js` (922 lines) and `src/views/play.js` (778 lines) smaller and easier to change, enforce the "only `store.js` touches localStorage" contract with a lint rule, and keep the views from growing back with a size cap. Behavior must not change (AGENTS rule 9).

Independent of the end-to-end checks plan (`e2e-pipeline-checks.md`), which has been gated and pushed on its own. The existing safety net is `create.test.js`, `game.test.js`, `play-state.test.js`, the UX checks, lint and typecheck; all must pass after every move.

## Decision: pure move

Both views are one `mount()` closure over shared mutable state (create: `st`, `image`, `history`, `savedSig`, the solver client and timers; play: `cells`, `hearts`, `elapsedMs`, `drag`, `brush` and more). Functions move to new modules and receive a context object (state, DOM refs and callbacks). Two mechanical steps make that possible and neither changes behavior: the DOM-building block moves out (Wave 1a), and the closure's `let` variables become fields of one state object so a moved function can assign them (Wave 1b). State is not otherwise redesigned or reduced in this plan.

## Target layout

- `src/views/dom.js`: the shared `el()` helpers. The two views define `el` with different signatures (create: `el(tag, props, ...children)`, 57 call sites; play: `el(tag, className, text)`, 48 call sites). They are not merged: `dom.js` exports `el` (create's form) and `elc` (play's form), and play's call sites are renamed to `elc`. Lint (`no-undef`) and typecheck prove no site was missed.
- `src/views/create/`: `index.js` (mount, wiring), `build.js` (DOM construction), plus the Wave 2 modules below.
- `src/views/play/`: `index.js`, `build.js`, plus the Wave 2 modules below.
- `eslint.config.js`: three additions.
  - `no-restricted-globals` for `localStorage` and `sessionStorage`, and `no-restricted-properties` for `globalThis.localStorage` (which `store.js` uses as a default argument), on `src/**`, with an override for `src/store.js`. Grep shows no violations today.
  - `linterOptions.noInlineConfig: true`, so a `/* eslint-disable */` comment cannot switch a rule off. No inline directives exist in the repo today, so this costs nothing.
  - `max-lines` at 500 on `src/**` (Wave 4). 500 passes every current file except the two views (the next largest is `color.js` at 457). It counts raw lines, with no blank-line or comment exemptions, so it cannot be argued around. 500 is a ratchet against growth, not the target: bringing every file down to 300 is the follow-up plan, [line-cap-300.md](line-cap-300.md), which starts only after this one is gated.

### Provisional module cut (from the current function list; Wave 0b replaces this with measured ranges)

Create (922 lines, `mount` spans 119 to 916):

| Module | Functions today | About lines |
|---|---|---|
| `image-source` | `decodeFile`, `currentCrop`, `regenerate`, `onFile`, `onSize`, `onSlider`, `onReset`, `onColors`, `onInvert` | 200 |
| `crop-preview` | `drawPreview`, `onPreviewDown`, `onPreviewMove`, `onPreviewUp` | 100 |
| `grid-view` | `fitCells`, `renderGridNow`, `markTileBoundaries`, `artFor`, `onGridPointer`, `syncBrushes`, the history functions, `onKeydown` | 190 |
| `report` | `showReport`, `scheduleReport` | 110 |
| `save` | `showSaveMessage`, `onSave`, `saveSingle`, `saveSet`, `okToDiscard`, the draft handoff | 130 |

Play (778 lines, `mount` spans 82 to 766; the first 165 lines are DOM construction):

| Module | Functions today | About lines |
|---|---|---|
| `hud` | `refresh`, `showStrip`, `clearReveal`, `syncReveal`, `startClock`, `tick`, `onVisibility` | 150 |
| `input` | `onPointer`, `onKey`, the drag preview | 90 |
| `actions` | `commit`, `step`, `restart`, the hint/reveal path | 150 |
| `persist` | `snapshot`, `persist`, export and import save (location confirmed by the map) | 80 |
| `rules-layout` | `rememberRule`, `sizeGrid`, `syncMode`, `syncCoarse`, the swatch picker | 120 |

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
| 2 extraction lanes (each of the ten above) | 2 to 3.5 |
| Wave 3 merge and verify (per lane) | 0.5 |
| 4 size cap, docs, restamp | 1.5 |

If the 0b map shows more than about 25 mutable bindings in play, split 1b by region (state loading and persistence, then the interaction state) rather than run it as one lane. If `image-source` measures over 250 lines, split `regenerate` and the control handlers into two modules.

## Steps and parallelism

Before any lane starts, the orchestrator pre-registers the feature rows (`storage-lint-rule`, `split-create-view`, `split-play-view`, `view-size-cap`) with verify commands that fail, so lanes never edit `FEATURES.json` (the e2e round's conflicts were all there). Layout tests are one per view (`test/views_layout_create.test.js`, `test/views_layout_play.test.js`) so each row's verify command fails if only its own view's modules go missing (AGENTS rule 10).

**Wave 0: four lanes at the same time (disjoint files).**

- 0a. Lint rules (`eslint.config.js`, new `test/lint_rules.test.js`). The test uses ESLint's `lintText` against the repo config and asserts: `localStorage` in `src/views/x.js` is an error; the same text in `src/store.js` is not; `globalThis.localStorage` is an error elsewhere; a file that starts with an eslint-disable comment still errors (proves `noInlineConfig`). No probe file is left in the tree.
- 0b. Read-only maps of both closures, two lanes (create, play). For each: every inner function with its current line range, the state it reads and writes, the proposed module, every `let` binding, and a count of module-crossing writes. Output is a doc in `docs/plans/`, no code.
- 0c. `views/dom.js`, touching only the `el` definitions, their call sites in play (rename to `elc`), and the import lines.

0b feeds Wave 1. 0c must merge before Wave 1 starts (not Wave 2 as first drafted): Wave 1a moves the DOM block, and the new `build.js` files import from `dom.js`. 0a depends on nothing and nothing depends on it; it can finish at any point before Wave 4.

**Wave 1: per view, three steps in order; the two views run side by side.**

Sequential inside a view because all three edit the same file; the order puts the stateless move first so the state conversion has fewer references to touch.

- 1a. Move the DOM-construction block into `build.js`. It takes the initial values it needs (create: `st`, the restored draft title; play: the puzzle, store prefs) and returns one refs object. Event listeners that call closure functions stay in `mount` and attach to the returned refs. Behavior and DOM are identical.
- 1b. In place, turn the closure's `let` variables into fields of one `state` object and update every reference. No file moves; the diff is mechanical and the full check plus UX checks prove nothing changed.
- 1c. `git mv` the view into its folder as `index.js` and update the import in `app.js`. Define the context shape (state, refs, callbacks) as a JSDoc typedef so typecheck enforces it. Create every Wave 2 module as an empty factory (`createReport(ctx)` returning `{}`), call each factory once in `index.js` in one pre-registered block, and add the view's layout test pinning the module paths and export names. Nothing has moved yet, so everything stays green. Wave 2 lanes then edit only their own module and delete from `index.js`.

**Wave 2: extraction lanes, in rounds.**

One lane per module. Each lane moves its functions into its module's factory, deletes them from `index.js`, and changes callers elsewhere in `index.js` to `module.fn(...)`. Those one-line caller edits are the expected merge conflicts; the orchestrator resolves them at merge. Lanes touch only their own module, `index.js`, and nothing else. A shared helper goes to the earlier merged module.

Cap: at most 3 live lanes per view and 4 in flight in total (the e2e round ran four cleanly). Each round is cut from the merged result of the previous one, so rounds are also the merge points.

- Round 2.1: create `report`, create `save`, play `hud`, play `input`.
- Round 2.2: create `crop-preview`, create `grid-view`, play `actions`, play `rules-layout`.
- Round 2.3: create `image-source` (last, because `regenerate` touches state used by most other modules), play `persist`.

The rounds follow the 0b map; if it shows a different cut, the rounds are re-planned from it before Wave 2 starts, not during it.

**Wave 3: sequential, after every merge.** `npm test && npm run lint && npm run format:check && npm run typecheck` and `npm run test:ux`. The orchestrator drives the manual checks in the browser pane after each round (Create with a photo; play a puzzle at a narrow and a wide width), one at a time, since the pane is shared.

**Wave 4: close.** Turn on `max-lines` 500 for `src/**` and add `test/lint_size_cap.test.js` (written first, so it fails until the rule is on) to assert it: a 501-line text at `src/views/create/x.js`, at `src/views/play/x.js` and at `src/color.js` errors (including with a disable comment at the top); a 500-line text passes. Every file must already be at or under 500 when this lands; the provisional cut puts the largest new module at about 200, so a module that measures over 500 after its lane is split further rather than exempted, and no lane adds an override. Update the AGENTS "Where things are" line and the README file map. Restamp the feature rows at a clean commit (`python scripts/features.py restamp`), regenerate `PROGRESS.md`, then the gate.

Feature rows: `storage-lint-rule` (verify: `node --test test/lint_rules.test.js`), `split-create-view` and `split-play-view` (verify: their layout test, the view's logic tests, and `npm run test:ux`), `view-size-cap` (verify: `node --test test/lint_size_cap.test.js` plus `npm run lint`; the file does not exist until Wave 4, so the row cannot pass early; it fails if the rule is removed, if its scope narrows, or if any file under `src/` passes 500 lines).

## Open item for Step 0b

Whether `play.js` splits cleanly depends on how much of its closure is shared state. If the map shows more than a few module-crossing writes after the state object (1b) is in place, narrow that view's split rather than force it, and note what was left out.

## Gate

This plan gets its own gate: a `/gate-review` scoped to this round, run once every lane is done and merged, before anything from this plan is pushed. It is not combined with the end-to-end checks round, which was gated (pass 7) and pushed separately. Nothing in this plan pushes. Lanes merge to local `main` only.
