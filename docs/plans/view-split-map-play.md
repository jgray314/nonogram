# Play view closure map (step 0b, play)

Read-only map of `src/views/play.js` (778 lines) for the view split in [view-split.md](view-split.md). Every line number below was read from the file at commit `03134e1`. Step 0c renames `el` call sites to `elc` and edits the import lines, so lines drift by a few after it merges; the names are the stable key.

Verdict in one paragraph: the closure has 17 `let` bindings in `mount` (16 mutable once `store` becomes a `const`), under the plan's limit of about 25, so step 1b stays one lane. The provisional five-module cut has 12 module-crossing write sites, 10 of them in `restart`, the Zen switch handler, the out-of-hearts rescue handler and the solve in `commit`, which all reach into state owned by another module. That is more than a few. Recommendation: narrow the split. Cut out `build`, `hud`, `persist` and `rules-layout` (one crossing write between them), keep the write-heavy core (actions, input and the clock) together as one `session` module, and say plainly that it is left unsplit.

## 1. Module-scope state (outside `mount`)

| Binding | Line | Written by | Read by |
|---|---|---|---|
| `root` | 59 | `mount` 93 (the not-found box), 97 (the play section); `unmount` 777 (null) | `unmount` 775 |
| `grid` | 60 | `mount` 494 (`renderGrid`); `unmount` 776 (null) | `preview`, `refresh`, `clearReveal`, `syncReveal` (via closure), `unmount` 774 |
| `cleanup` | 61 | `unmount` 771 (reset to `[]`); `mount` pushes at 240, 550, 611, 765 | `unmount` 770 |
| `persistNow` | 62 | `mount` 326 (set to `persist`); import handler 728 (cleared so unmount does not overwrite the imported save); `unmount` 773 (cleared) | `unmount` 772 |
| `generation` | 64 | `mount` 83 (+1); `unmount` 769 (+1) | import handler 680-681 (captures it, `live()` compares) |
| `pendingNotes` | 68 | import handler 731 (`set`); `mount` 149 (`delete`) | `mount` 146 |

Constants: `CSS_HREF` 31, `PREF_KEYS` 32 (read by `mount` 279, 281 and `rememberRule` 553, 556). Module helpers: `ensureCss` 34-41, `el` 43-48, `loadPuzzle` 50-53, `reveal` 56, `sameGrid` 57, `showMissing` 70-80.

Cross-mount facts that matter for the split:

- `persistNow` is a global hook, not per-mount state. `unmount` runs `cleanup` first (which banks the final timer tick), then `persistNow()`, so the saved `elapsedMs` includes the last interval. Any new `unmount` must keep that order.
- `generation` is bumped by both `mount` and `unmount`, so the import handler's `live()` is false after either.
- `pendingNotes` is written in the import handler (in the persist region) and consumed in the DOM block (146-150). It has to move with the import handler (see section 2).
- The not-found path (`mount` 92-95) returns before `cleanup`, `persistNow` or `grid` are touched; it only assigns `root`.

## 2. The DOM block

Lines 97 to 261 (165 lines) are the construction region. It is almost all pure construction, but 7 spans in it are behavior. The block ends with `root.append(...)` at 260 and `container.append(root)` at 261; `sizeGrid` and `renderGrid` need `root` attached, so `mount` must keep the attach step immediately after the builder returns.

**Closure values the block reads:** `puzzle` (`title`, `palette`, `id`, plus `puzzleMeta(puzzle)`), `container` (attach at 261), `pendingNotes` (146, 149), the imports `MAX_HEARTS`, `sampleLabel`, `puzzleMeta`, `inkColors`, `inkText` and `el`, and the module `root` (assigned at 97).

**Element refs created** (those read again after line 261 are the ones the builder must return): `solvedMsg`, `count`, `timerEl`, `heartsEl`, `heartNodes`, `outPanel`, `outRestartBtn`, `outZenBtn`, `sizeNote`, `holder`, `exportBtn`, `importBtn`, `fileInput`, `message`, `toggles` (an object keyed `zen`, `autoCross`), `hintBtn`, `hintCount`, `restartBtn`, `ruleNote`, `undoBtn`, `redoBtn`, `swatches` (array), `legend`, `modeBar`, `modeBtns` (object keyed `fill`, `cross`), `strip`, `stripText`, `belowRow`, and `root`. Created and never read again (the builder keeps them local): `title`, `status`, `toolbar`, `rulesBar`, `swatchBar`, `stripLink`, `ruleDefault`. `swatchBar` is only referenced inside the block (183-194, 259).

**Spans that are not pure construction:**

| Lines | What | Stays in `mount`? | What the builder takes or returns |
|---|---|---|---|
| 146-150 | Reads and deletes the pending note, sets `message.textContent` | The `pendingNotes` read and delete stay out of the builder | Builder takes `pendingNote` (a string or undefined) and sets the text. `mount` (or `persist.takePendingNote(id)`) does the `get` and `delete` just before calling the builder, so the order is unchanged |
| 180-181 | `inks` and `multi`, computed from `puzzle.palette` | Computed in `mount` | Used after the block by `onKey` (748: `multi`, `inks.length`), so `mount` computes them and passes both in |
| 182 | `let brush = 1` | State; stays (becomes a field in 1b) | none |
| 187-196 | Swatch buttons; line 193 attaches a click handler that calls `pickBrush` | The handler stays | Builder creates the buttons without the listener and returns `swatches`; `mount` attaches `click` to each |
| 197-201 | `pickBrush` (writes `brush`, sets `aria-pressed`) and the call `pickBrush(1)` | Stays | Needs `swatches` from the builder. The initial `pickBrush(1)` must run after the builder returns and before the first `onKey`; order against the rest of the block is not observable |
| 202-205 | `colorHint`, `MOUSE_LEGEND`, `TOUCH_LEGEND`, `legend` | The two legend strings are read later by `syncCoarse` (236) | Builder returns `legendText = { mouse, touch }` along with `legend` |
| 207 | `let touchMode = 'fill'` | State; stays | none |
| 219-222 | Mode button click: writes `touchMode`, calls `syncMode` | Stays | Builder creates the buttons and appends them without the listener, returns `modeBtns`; `mount` attaches the listeners |
| 225-231 | `syncMode` and its first call | Stays (reads `touchMode`, `modeBtns`) | Needs `modeBtns` |
| 232-240 | `coarse` media query, `syncCoarse`, first call, `change` listener, and `cleanup.push` | Stays, because it registers a listener and a cleanup | Needs `modeBar`, `legend`, `legendText`. Builder must not call `matchMedia` |

The construction order of the DOM (what `rulesBar.append(undoBtn, redoBtn, modeBar, ...)` does at 241 and `heartsEl.after(swatchBar)` at 259) must stay identical; the tests that walk the DOM (`test/ux/checks.js`) select by class and position.

## 3. Every `let` binding in `mount`

Total: **17** (`store`, `brush`, `touchMode`, `cells`, `elapsedMs`, `solvedAt`, `hearts`, `hints`, `wrongMark`, `dirty`, `started`, `history`, `drag`, `revealed`, `animateReveal`, `revealTimer`, `lastTick`). That is under the plan's threshold of about 25, so step 1b is one lane and does not need to be split by region. `store` is assigned once in a try/catch (87, 89) and can become a `const` (via a small helper) instead of a state field, leaving 16 mutable fields. `rules` (265) is a `const` object whose fields are mutated, so it joins the state object as-is.

Write sites outside the declaration (the declaration line is in the second column):

| Binding | Declared | Write sites |
|---|---|---|
| `store` | 85 | 87, 89 |
| `brush` | 182 | 198 (`pickBrush`) |
| `touchMode` | 207 | 220 (mode click handler) |
| `cells` | 266 | 284 (load), 295 (cross empty lines), 297 (fill full puzzle), 452 (`commit`), 621 (`step`), 628 (`restart`) |
| `elapsedMs` | 267 | 285 (load), 603 (`tick`, `+=`), 630 (`restart`) |
| `solvedAt` | 268 | 286 (load), 305 (solved on open), 462 (`commit`), 637 (`restart`) |
| `hearts` | 269 | 287 (load), 458 (`commit`, `-= 1`), 632 (`restart`) |
| `hints` | 270 | 288 (load), 594 (hint handler), 633 (`restart`) |
| `wrongMark` | 271 | 454 (`commit`), 620 (`step`), 634 (`restart`) |
| `dirty` | 272 | 306 (solved on open), 465 (`commit`), 577 (rule toggle handler), 622 (`step`), 638 (`restart`), 653 (out-of-hearts Zen handler) |
| `started` | 300 | 434 (`startClock`), 631 (`restart`) |
| `history` | 301 | 629 (`restart`) |
| `drag` | 327 | 475, 483 (`onPointer`), 635 (`restart`); its `path` array is also mutated at 478 and 481 |
| `revealed` | 380 | 391 (`clearReveal`), 402 (`syncReveal`) |
| `animateReveal` | 381 | 404 (`syncReveal`), 463 (`commit`) |
| `revealTimer` | 382 | 429 (`syncReveal`) |
| `lastTick` | 599 | 435 (`startClock`), 605 (`tick`), 636 (`restart`), 652 (out-of-hearts Zen handler) |

Plus the `rules` object: 279 and 281 (preferences when no save), 289 (load), 570 (`rules.zen = false` in the toggle handler), 575 (`rules[key]`), 651 (`rules.zen = true`).

That is 45 write sites to the `let` fields outside their declarations (counted from the table, excluding `store`), and 6 to `rules`.

Notes for 1b:

- `lastTick` is declared at 599, textually after `startClock` (432) and `commit` (439) which use it. That is safe today only because neither runs until after `mount` returns. Putting it in the state object removes that ordering dependency; the initial value `Date.now()` should still be taken at the point the clock starts (the end of setup), not earlier than the load block.
- `history` and `drag` are reassigned (`restart`), and `onKey` and the undo/redo buttons read `history.undo` and `history.redo` at call time (`step(history.undo)`). After 1b they must read `state.history` at call time, not capture it once.
- `step(fn)` guards on `drag`; the hint handler guards on `drag` (583). Both read it live.

## 4. Inner functions and helpers

State columns name the fields read and written. "DOM" lists the refs from section 2 the function touches. Proposed module is from the provisional cut or the recommended one in section 6.

| Name | Lines | Reads | Writes | DOM | Calls | Called by | Module |
|---|---|---|---|---|---|---|---|
| `pickBrush` | 197-200 | `brush`, `swatches` | `brush` | swatches | none | swatch click (193), line 201, `onKey` (751) | rules-layout |
| mode click handler | 219-222 | `touchMode` | `touchMode` | none | `syncMode` | `modeBtns` | index (wiring) |
| `syncMode` | 225-230 | `touchMode` | none | `modeBtns` | none | 231, mode click | rules-layout |
| `syncCoarse` | 233-237 | `coarse` | none | `modeBar`, `legend` | none | 238, media change listener (239) | rules-layout |
| `snapshot` | 309-317 | `puzzle`, `cells`, `elapsedMs`, `rules`, `solvedAt`, `hearts`, `hints` | none | none | none | `persist`, export (659) | persist |
| `persist` | 318-325 | `store`, `dirty`, `loaded`, via `snapshot` | none (`store.put`) | none | `snapshot` | `commit`, `step`, `restart`, toggle handler, out-of-hearts Zen handler; assigned to `persistNow` (326) | persist |
| `preview` | 329-333 | `drag`, `cells`, `brush` | none | `count`, `grid` | none | `onPointer` | input |
| `zen` | 338 | `rules.zen`, `heartsOk` | none | none | none | `outOfHearts`, `refresh`, `commit` (456), restart click (643) | actions (shared predicate) |
| `outOfHearts` | 339 | `hearts`, `solvedAt`, `zen()` | none | none | `zen` | `refresh`, `onPointer`, hint handler, `tick`, `step` | actions (shared predicate) |
| `refresh` | 341-376 | `wrongMark`, `solvedAt`, `rules`, `hearts`, `hints`, `history`, `cells`, `elapsedMs`, `helpers`, `heartsOk` | none directly (calls `syncReveal`) | `toggles`, `heartsEl`, `heartNodes`, `outPanel`, `restartBtn`, `holder`, `hintBtn`, `undoBtn`, `redoBtn`, `hintCount`, `ruleNote`, `timerEl`, `solvedMsg`, `count`, `grid` | `outOfHearts`, `zen`, `syncReveal`, `reveal` | `mount` (505), `commit`, `step`, `restart`, toggle handler, out-of-hearts Zen handler | hud |
| `reduceMotion` | 383 | none | none | none | none | `syncReveal` | hud |
| `showStrip` | 384-388 | `elapsedMs`, `hints`, `revealTimer` | none | `stripText`, `strip` | none | `syncReveal`, img error handler, `transitionend` listener | hud |
| `clearReveal` | 389-395 | `revealTimer` | `revealed` | `grid`, `holder`, `strip` | none | `syncReveal` | hud |
| `syncReveal` | 396-430 | `solvedAt`, `revealed`, `animateReveal`, `puzzle.art` | `revealed`, `animateReveal`, `revealTimer` | `grid`, `holder`, `strip` | `clearReveal`, `reduceMotion`, `showStrip` | `refresh` | hud |
| img `error` handler | 412-416 | none | none | `grid`, `holder` | `showStrip` | the art `img` | hud |
| `startClock` | 432-436 | `started` | `started`, `lastTick` | none | none | `commit` (443), `onPointer` (474) | session (clock) |
| `commit` | 439-469 | `cells`, `rules`, `clues`, `hearts`, `history`, `wrongMark` | `cells`, `wrongMark`, `hearts`, `solvedAt`, `animateReveal`, `dirty` | `grid` (`sweep`) | `sameGrid`, `startClock`, `autoCross`, `changedCells`, `zen`, `tick`, `isSolved`, `refresh`, `persist` | `onPointer`, hint handler | session (actions) |
| `onPointer` | 471-492 | `solvedAt`, `drag`, `cells`, `brush`, `heartsOk` | `drag` | none | `outOfHearts`, `startClock`, `preview`, `heartsStroke`, `applyStroke`, `commit` | `renderGrid` option (499) | session (input) |
| `touchButton` arrow | 500 | `touchMode` | none | none | none | `renderGrid` | index (wiring) |
| `sizeGrid` | 510-542 | `clues`, `puzzle.width`/`height` | none | `holder`, `outPanel`, `sizeNote`, `belowRow` | `gutterSize` | 543, `settle`, `resize` listener (549) | rules-layout |
| `settle` | 546 | none | none | `holder` | `sizeGrid` | `requestAnimationFrame`, `document.fonts.ready` | rules-layout |
| `rememberRule` | 552-559 | `store` | none | none | none | toggle handler | rules-layout |
| toggle `change` handler | 561-580 | `cells`, `rules`, `clues` | `rules.zen`, `rules[key]`, `dirty` | `toggles` | `sameGrid`, `restartCells`, `confirm`, `rememberRule`, `restart`, `refresh`, `persist` | `toggles[key]` (one per key) | session (actions) |
| hint click handler | 582-596 | `solvedAt`, `drag`, `cells`, `hints`, `helpers` | `hints` | `message` | `outOfHearts`, `hintCell`, `commit` | `hintBtn` | session (actions) |
| `tick` | 600-607 | `started`, `solvedAt`, `elapsedMs`, `lastTick` | `elapsedMs`, `lastTick` | `timerEl` | `outOfHearts`, `formatTime` | interval (608), `onVisibility`, `commit` (457, 461), cleanup (612) | session (clock) |
| `onVisibility` | 609 | none | none | none | `tick` | `visibilitychange` | session (clock) |
| cleanup arrow | 611-616 | `revealTimer` | none | none | `tick` | `unmount` | index (registers) |
| `step` | 618-625 | `solvedAt`, `drag` | `wrongMark`, `cells`, `dirty` | none | `outOfHearts`, `refresh`, `persist` | `onKey`, undo and redo clicks | session (actions) |
| `restart` | 627-641 | `clues`, `puzzle` | `cells`, `history`, `elapsedMs`, `started`, `hearts`, `hints`, `wrongMark`, `drag`, `lastTick`, `solvedAt`, `dirty` | none | `restartCells`, `createHistory`, `isSolved`, `refresh`, `persist` | toggle handler, restart click (642), out-of-hearts restart click (646) | session (actions) |
| restart click | 642-644 | none | none | none | `confirm`, `restartPrompt`, `zen`, `restart` | `restartBtn` | session (actions) |
| out-of-hearts Zen click | 650-656 | none | `rules.zen`, `lastTick`, `dirty` | none | `refresh`, `persist` | `outZenBtn` | session (actions) |
| export click | 658-668 | `puzzle`, via `snapshot` | none | none | `serializeSaveFile`, `snapshot`, `el` | `exportBtn` | persist |
| import click | 669 | none | none | `fileInput` | none | `importBtn` | persist |
| file `change` handler (async) | 670-743 | `store`, `generation`, `container` | `persistNow`, `pendingNotes` | `fileInput`, `message` | `parseSaveFile`, `idMatches`, `importWrites`, `createSolverClient`, `rateImports`, `ratePuzzleWith`, `unmount`, `mount` | `fileInput` | persist |
| `onKey` | 745-761 | `multi`, `inks` | none | none | `pickBrush`, `step` | `keydown` (764) | session (input) |
| undo and redo clicks | 762-763 | `history` (live) | none | none | `step` | `undoBtn`, `redoBtn` | session (actions) |

Module-scope helpers `ensureCss`, `loadPuzzle`, `showMissing`, `mount` and `unmount` stay in `index.js`. `reveal` (56, used at 364 by `refresh`) and `sameGrid` (57, used at 300 by the load block, 441 by `commit` and 565 by the toggle handler) are used in three modules, so they need one shared home (a ten-line `play/util.js`, or exported from the module that owns most callers).

The load block, lines 263-307, builds the initial state (`clues`, `rules`, `cells`, `elapsedMs`, `solvedAt`, `hearts`, `hints`, `dirty`, `started`, `history`). It is setup, not a function. It belongs with `persist` as a `loadState(store, puzzle)` that returns the initial state object; line 300 (`started`) and 301 (`history`) depend on the earlier lines in order.

## 5. Event wiring, timers and cleanup

| Where | What it wires | Calls | Cleanup | Stays in `index.js`? |
|---|---|---|---|---|
| 193 | each swatch `click` | `pickBrush` | none (element is removed with the root) | wiring, attaches to builder refs |
| 219 | each mode button `click` | writes `touchMode`, `syncMode` | none | wiring |
| 239-240 | `coarse` `change` | `syncCoarse` | `cleanup.push` removes the listener | the registration stays in `mount`; the media-query object has to be created there |
| 412, 428 | art `img` `error`, `transitionend` (once) | `showStrip` | none; the image is removed with the grid | with `syncReveal` in hud |
| 429 | `setTimeout(showStrip, 1600)` fallback | `showStrip` | `clearTimeout(revealTimer)` in `showStrip`, `clearReveal` and the cleanup arrow (614) | with hud; the cleanup arrow stays in `index.js` or hud registers its own |
| 547-548 | `requestAnimationFrame(settle)`, `document.fonts.ready.then(settle)` | `sizeGrid` | none; guarded by `holder.isConnected` so it is a no-op after unmount | rules-layout |
| 549-550 | `window` `resize` | `sizeGrid` | `cleanup.push` removes it | registration in `mount` |
| 561 | each rule toggle `change` | see section 4 | none | wiring |
| 582 | `hintBtn` `click` | hint handler | none | wiring |
| 608 | `setInterval(tick, 500)` | `tick` | `clearInterval(timer)` in the cleanup arrow (613) | `index.js` owns `timer` and the arrow |
| 610-616 | `document` `visibilitychange` | `onVisibility` | removed in the same cleanup arrow, after a final `tick()` | same arrow |
| 642, 646, 650 | restart, out-of-hearts restart, out-of-hearts Zen clicks | `restart`, `restart`, handler | none | wiring |
| 658, 669, 670 | export, import, file input | see section 4 | none | wiring (persist exports the handlers) |
| 762-763 | undo and redo `click` | `step` | none | wiring |
| 764-765 | `document` `keydown` | `onKey` | `cleanup.push` removes it | registration in `mount` |
| 499-500 | `renderGrid` options `onPointer`, `touchButton` | `onPointer`, `touchMode` | `grid.destroy()` in `unmount` (774) | wiring |

Order of `cleanup` execution in `unmount` is push order: coarse listener, resize listener, the timer arrow (final `tick`, clear interval, clear reveal timer, remove visibility listener), then keydown. Then `persistNow()`, then `grid.destroy()`, then `root.remove()`. All of it must survive the move unchanged: the final `tick` has to run before `persistNow`.

What must stay in `index.js`: `generation`, `root`, `grid`, `cleanup` and its reset, the `cleanup.push` calls (or modules return a disposer the index registers), `mount` and `unmount` themselves, and the not-found path.

## 6. Module crossing analysis

Ownership below is by the module that declares or mostly writes a field. A crossing write is a write site in one module to a field whose other writers are in another.

**Provisional cut** (hud = refresh, reveal, `startClock`, `tick`, `onVisibility`; input = `onPointer`, `onKey`, `preview`; actions = `commit`, `step`, `restart`, hint and restart buttons; persist; rules-layout = `rememberRule`, `sizeGrid`, `syncMode`, `syncCoarse`, swatches, and the toggle handler):

| Pair | Crossing writes | Count |
|---|---|---|
| actions to hud | `restart`: `elapsedMs` 630, `started` 631, `lastTick` 636; out-of-hearts Zen handler: `lastTick` 652; `commit`: `animateReveal` 463 (hud also writes it at 404) | 5 |
| actions to input | `restart`: `drag` 635 | 1 |
| rules-layout to actions | toggle handler: `rules.zen` 570, `rules[key]` 575, `dirty` 577; and actions write `rules.zen` at 651 | 4 |
| persist to index | import handler: `persistNow` 728, `pendingNotes` 731 | 2 |
| **Total** | | **12** |

Ten of the 12 are in four functions (`restart` has 4, the toggle handler 3, the out-of-hearts Zen handler 2, `commit` 1); the other 2 are in the import handler. `restart` alone writes 11 state fields (cells, history, elapsedMs, started, hearts, hints, wrongMark, drag, lastTick, solvedAt, dirty). It is the hub of the closure, which is why separating clock, input, and actions from each other is where the cuts cross.

**Call on the plan's open item.** 12 crossing writes after the state object exists is more than a few, and every one would need either a new setter function or a field written from two modules. Narrow the split: do not separate `actions`, `input` and the clock. They stay together in one `session` module.

**Recommended final cut:**

| Module | Contents | Estimated lines | Crossing writes |
|---|---|---|---|
| `index.js` | module state (`root`, `grid`, `cleanup`, `generation`), `ensureCss`, `loadPuzzle`, `showMissing`, `mount` shell, `unmount`, listener registration and `cleanup` arrow | about 130 | none |
| `build.js` | lines 97-261 minus the 7 behavior spans in section 2 | about 170 | none |
| `hud.js` | `refresh`, `reduceMotion`, `showStrip`, `clearReveal`, `syncReveal` | about 100 | 1 (`animateReveal`: `commit` sets it, `syncReveal` clears it; acceptable as a state field) |
| `persist.js` | `loadState` (263-307), `snapshot`, `persist`, export, import, `persistNow`, `pendingNotes` | about 190 | 0 (`persistNow` and `pendingNotes` move into this module; the import handler takes a `remount` callback instead of calling `mount`/`unmount` directly, and reads `generation` through a getter) |
| `rules-layout.js` | `pickBrush`, `syncMode`, `syncCoarse`, `sizeGrid`, `settle`, `rememberRule` | about 90 | 0 (`pickBrush` is called from `onKey`, which is a call, not a write) |
| `session.js` | `startClock`, `tick`, `onVisibility`, `commit`, `onPointer`, `preview`, `step`, `restart`, toggle handler, hint handler, restart and Zen buttons, `onKey`, undo and redo, `zen`, `outOfHearts` | about 210 | 0 inside the module |
| `util.js` | `reveal`, `sameGrid` | about 10 | none |

No module is estimated over 250 lines. `session.js` is the largest at about 210; if it measures over 250 after its lane, split `clock` (`startClock`, `tick`, `onVisibility`, interval) from the rest and pass `clock.reset()` and `clock.touch()` so `restart` and the Zen handler call functions instead of assigning `elapsedMs`, `started` and `lastTick`; that adds a call but no behavior change.

Left out by this narrowing: separate `input` and `actions` modules, and a separate clock. The plan's feature row (`split-play-view`) and its layout test currently name `build, hud, input, actions, persist, rules-layout, index`; they need to name `build, hud, persist, rules-layout, session, util, index` instead. Rule 10 in the repo instructions requires the verify command to fail if a module goes missing, so the row and the test change together.

**Wave 2 rounds** (the plan has hud and input in round 2.1, actions and rules-layout in 2.2, persist in 2.3):

- Round 2.1: play `hud`, play `persist`. Both are read-mostly, and `persist` must go first or with `hud` because it takes `pendingNotes` and `persistNow` out of the index.
- Round 2.2: play `rules-layout`, play `session` (after `hud` and `persist` have left `index.js`, so the lane moves what remains).
- No play lane in round 2.3.

Two lanes per round in both play rounds, as the plan allows. Each lane edits `index.js`, so the second lane in a round rebases on the first.

## 7. Tests that import from `src/views/play.js`

None of the files under `test/` or `src/` imports `play.js` except one:

- `src/app.js` line 5: `import * as play from './views/play.js'`. It stores the namespace as the `play` route's `view` and calls `current.unmount()` before each render and `mount(container, params)` after. So the public surface is exactly `mount(container, params)` and `unmount()`, and `src/views/play/index.js` must export those two names.

There is no unit test of the view. The behavior is covered by the logic tests of the pure modules it calls (`test/game.test.js`, `test/play-state.test.js`, `test/clue-progress.test.js`, `test/blank_color.test.js`) and by the UX checks in `test/ux/checks.js`, `test/ux/harness.js` and `test/ux/pipeline-*.js`, which drive the real app and select by class names such as `.nng-play`, `.nng-filled`, `.nng-crossed`, `.nng-cell` and `.nng-clue-row`. The Export and Import save buttons have no UX check at all (the plan-level backlog records that as left out), so the persist region has no automated cover.

## 8. Risks

- **The save round trip is untested.** Export and Import (658-743) are the least covered part of the file and the code most affected by the move (it reads `generation`, writes `persistNow` and `pendingNotes`, and remounts). Moving it with no check means a regression there would pass every gate. The Wave 3 manual check should include a save export, import, and import-over-existing.
- **Hoisting and temporal dead zone.** `restart`, `refresh`, `persist`, `commit`, `step`, `sizeGrid`, `pickBrush`, `syncMode`, `syncCoarse`, `rememberRule`, `syncReveal`, `showStrip`, `clearReveal`, `startClock` and `onPointer` are function declarations and hoist. `snapshot`, `preview`, `zen`, `outOfHearts`, `reduceMotion`, `settle`, `tick`, `onVisibility` and `onKey` are `const` arrows and do not. The toggle handler calls `restart` (572) before its textual definition (627); `commit` calls `tick` (457, 461) before `tick` is declared (600); `startClock` assigns `lastTick` (435) before its `let` (599). All are safe only because nothing runs until `mount` finishes. A pure move must keep "all definitions before the first call" and cannot reorder the first `refresh()` at 505 ahead of the reveal state (380-382), which `syncReveal` reads.
- **A moved function must read state live.** `step(history.undo)` evaluates `history` when the click happens, and `restart` replaces `history`. If any module captures `history`, `cells` or `drag` once into a local, undo breaks after a restart.
- **Timers outliving unmount.** `setInterval` (608) is cleared in the cleanup arrow; `revealTimer` (429) is cleared there too. The `requestAnimationFrame(settle)` and `document.fonts.ready.then(settle)` calls (547-548) are not cancelled but are guarded by `holder.isConnected`. The async import handler (670-743) is guarded by `generation`. A module that adds a new timer must register its own cleanup; a missing one leaves a ticking interval after navigation.
- **`unmount` ordering.** Cleanup (with the final `tick`) must run before `persistNow()`, and `persistNow` must be cleared by the import handler before the remount (728), or unmount overwrites the imported save with the old state.
- **`mount` re-enters itself.** The import handler calls `unmount()` then `mount()` (738-739) when the hash is already the target. A persist module that imports `mount` from `index.js` creates a circular import; the plan avoids it by passing a `remount` callback.
- **Closures over loop variables.** The toggle loop (560), `modeBtns` loop (212) and `swatches.map` (187) use `const` per iteration, so each handler captures its own `key`, `box`, `mode` or `i`. Rewriting them as `var` or a shared index would break the handlers. The loop at 154 destructures a `label` that shadows the outer `label` (99); it is block scoped, but a builder that merges the two scopes would clobber the title.
- **Plan check.** The plan's provisional table puts `startClock`, `tick` and `onVisibility` in `hud`, and `restart` in `actions`. `restart` writes the clock's fields (`elapsedMs`, `started`, `lastTick`), so that cut produces five crossing writes by itself. The plan also lists the swatch picker under `rules-layout`, but `pickBrush` is called from `onKey` (`input`), so there is a call from `input` into `rules-layout`. Neither contradicts the plan's goal; both are why this map recommends the narrower cut. The plan's statement that the DOM block is the first 165 lines holds (97-261), but 7 spans in it are behavior (section 2), so step 1a is a moderate edit rather than a cut and paste.
- **The 0c rename.** Step 0c edits the `el` call sites and imports in this file before 1a; the line numbers in this document will be a few lines off after it, and `el` becomes `elc` (the builder and `persist` export handler, which uses `el('a')`, are affected).
