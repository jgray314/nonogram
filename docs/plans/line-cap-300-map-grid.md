# Map: `renderGrid` in `src/views/grid.js` (lane 0b-grid)

Read-only map at commit `ca93716`. `src/views/grid.js` is 347 lines; `renderGrid` is lines 67 to 347. Line numbers below are for that commit. Input to the Wave 0 freeze point (decision 5 of `line-cap-300.md`).

## 1. Module level

| Item | Lines | Notes |
|---|---|---|
| imports `inkColors`, `inkText` from `../color.js` | 5 | only imports in the file |
| `gutterSize(clues, {zeroClues})` | 11-15 | pure; exported; used by `renderGrid`, Create `grid-view.js`, `test/grid.test.js` |
| `BUTTONS = {0:'left', 2:'right'}` | 17 | read only by `onDown` |
| `export { inkColors }` | 19 | Play `index.js` imports `inkColors` from here |
| `blankStyle(hex)` | 29-32 | pure; exported; `renderGrid` and `test/blank_color.test.js` |
| `div(className, text)` | 34-39 | module-private helper; used by `renderGrid` only |
| JSDoc for `renderGrid` | 41-66 | 26 lines, documents the whole API |

Module-level mutable state: none. Every piece of state is closure state inside one `renderGrid` call, so two grids on one page (Print) are independent.

## 2. Inner functions and handlers (all inside `renderGrid`)

| Name | Lines | Kind |
|---|---|---|
| options destructure (defaults for `onPointer`, `zeroClues`, `touchButton`, `palette`, `blank`) | 67-80 | signature |
| `place(node, row, col)` | 94-98 | sets gridRow/gridColumn, appends to `root` |
| gutter backing bands and corner (inline, no function) | 103-117 | appends 0-3 divs to `root` |
| `zero(row, col, slot, axis)` | 122-126 | builds a "0" clue, calls `place` |
| `paintClue(node, color)` | 127-134 | reads `inks`, `inkText` |
| column clue loop | 135-144 | fills `colClues[c]`, calls `zero`, `paintClue`, `place` |
| row clue loop | 145-154 | fills `rowClues[r]`, same |
| cell node loop | 156-169 | fills `nodes`, calls `place` |
| `update(next)` | 172-195 | returned API; reads/writes `painted`; reads `nodes`, `inks`, `width`, `height` |
| `setClueDone({rows, cols})` | 197-204 | returned API; reads `rowClues`, `colClues` |
| `setOverlay(node)` | 209-217 | returned API; reads/writes `overlay`; reads `top`, `left`, `width`, `height`, `root` |
| `setWrong(list)` | 219-222 | returned API; reads `nodes` |
| `setHighlight(list)` | 225-228 | returned API; reads `nodes` (class `nng-hl`, independent of `hot`) |
| `sweep(list)` | 231-243 | returned API; reads `nodes`; forces layout with `getBoundingClientRect` between remove and add of `nng-sweep` |
| `highlight(pos)` | 247-257 | hover row/column; reads/writes `hot`; reads `nodes`, `width`, `height` |
| `cellOf(target)` | 259-266 | reads `root`; returns a NEW `{r, c}` object each call or null |
| `emit(type, pos)` | 269 | reads `onPointer` and `button` (live) |
| `isTouch(e)`, `cellAtPoint(e)` | 273-274 | `cellAtPoint` uses `document.elementFromPoint` |
| `onDown` | 276-293 | reads/writes `button`; reads `touchButton`, `BUTTONS`; may call `releasePointerCapture` in try/catch |
| `enterCell(pos)` | 294-298 | reads `hot`; calls `highlight`, `emit` |
| `onOver`, `onMove`, `onLeave` | 299-312 | `onOver` skips touch; `onMove` needs `button !== null` and touch; `onLeave` needs `hot` |
| `onUp(e)` | 313-319 | reads/writes `button`; calls `highlight(null)` only for `pointerType === 'touch'` (not pen) |
| `onContext` | 320 | `preventDefault` |
| listener registration | 322-329 | 5 on `root`, 2 on `window` |
| initial `update(cells)`, `container.append(root)` | 331-332 | see order |
| return object, `destroy()` | 334-346 | `destroy` is 341-345 |

## 3. Closure state: who reads and writes

Constants (assigned once, never reassigned): `top`, `left`, `inks`, `root`, `blankVars`, `rowClues`, `colClues`, `nodes` (the arrays are filled during setup and never replaced or resized afterwards), `place`.

| Name | Declared | Written by | Read by |
|---|---|---|---|
| `painted` (`let`, false) | 171 | `update` (set true at the end, 194) | `update` only |
| `overlay` (`let`, null) | 208 | `setOverlay` only | `setOverlay` only |
| `hot` (`let`, null) | 246 | `highlight` only | `highlight`, `enterCell`, `onLeave` |
| `button` (`let`, null) | 268 | `onDown` (set), `onUp` (cleared) | `emit`, `onDown`, `onMove`, `onUp` |
| `nodes` | 156 | setup loop (169) | `update`, `setWrong`, `setHighlight`, `sweep`, `highlight` |
| `rowClues`, `colClues` | 120-121 | clue loops (141-153) | `setClueDone` only |
| `root` | 85 | never | `place`, bands/corner, `setOverlay`, `cellOf`, listeners, `destroy` |
| `inks` | 84 | never | `paintClue`, `update` |
| `onPointer`, `touchButton` | option defaults | never | `emit` (`onPointer`), `onDown` (`touchButton`) |

Key finding: `painted` and `overlay` are touched by exactly one function each, and `hot` and `button` only by the pointer code (`highlight`, `enterCell`, `onLeave`, `emit`, `onDown`, `onMove`, `onUp`). `update`, `setClueDone`, `setOverlay`, `setWrong`, `setHighlight` and `sweep` never read `hot` or `button`. So no state is shared between the "paint" half and the "pointer" half. The shared structures are only `root`, `nodes`, `width`, `height` (all constants). A shared state object is NOT needed for the cut below (see section 9, deviation from step 2d).

## 4. Setup order (must be kept)

1. `gutterSize` gives `top`, `left`; `inks = inkColors(palette)`.
2. `root = div('nng-grid')`; `blankStyle(blank)`: class `nng-grid-blank` and CSS vars on `root`.
3. `gridTemplateColumns/Rows` on `root`.
4. `place` defined (needs `root`).
5. Gutter bands (cols, then rows) and corner appended to `root`. DOM order matters (stacking, `dom-compare` hashes the order): bands, then corner, then column clues, then row clues, then cells.
6. `rowClues`, `colClues` created, `zero` and `paintClue` defined, column clue loop, then row clue loop. Within a loop the zero clue for an empty line is placed before that line's own clues.
7. `nodes` loop: cells appended after all clues.
8. Function declarations and `let` state (`painted`, `overlay`, `hot`, `button`).
9. Handlers defined, then listeners registered: `root` pointerdown, pointerover, pointermove, pointerleave, contextmenu; then `window` pointerup, pointercancel.
10. `update(cells)` runs here, BEFORE `container.append(root)`. Because `painted` is false the first call adds no `nng-pop` and no animationend listeners. If the first update ran after the append, or `painted` started true, every filled cell would pop on mount.
11. `container.append(root)` last. Then the API object is returned.

Calls made before shared structures exist:
- `place` is called (clues, cells) only after `root` and the grid template are set. It would be a TDZ error if the `const place` moved below the clue loops.
- `update(cells)` is called at 331 after `nodes` is full and after `painted` is declared (171, a `let`, so calling `update` earlier would throw a TDZ error). `inks` is also read in `update`.
- `zero` is called from inside the clue loops before `rowClues`/`colClues` are used by anything else; `zero` does not push into them (so the "0" clue is not in the progress flags; comment at 136).
- Handlers close over `hot` and `button` declared before them; they only run after the function returns, so the order of `let hot` (246) and `let button` (268) relative to `update` does not matter at runtime, but both must be declared before the first listener fires.
- The `window` listeners are registered before `container.append`; a pointerup that fires between registration and append (not possible synchronously) would find `button === null` and return.

## 5. Teardown order (`destroy`, 341-345)

1. `window.removeEventListener('pointerup', onUp)`
2. `window.removeEventListener('pointercancel', onUp)`
3. `root.remove()`

The five `root` listeners are not removed; they go with the detached node. Not cleaned up and not currently needed: `hot`, `button`, `painted`, `overlay` stay as they were; pending `animationend` once-listeners die with the nodes. `destroy` does not end a stroke in progress. Idempotent: calling it twice is harmless. The window listeners must be removed with the SAME function reference (`onUp`); any extraction that wraps `onUp` must return the same reference to remove (trap named in the plan: "window listeners and their removal order in destroy").

Create's `onGridPointer` 'up' branch calls `renderGridNow()` which calls `destroy()` on the old grid from inside that grid's own window `pointerup` dispatch. That works today because removal during dispatch is safe; keep `destroy` synchronous.

## 6. Values read live at call time

- `button` is reassigned (null / 'left' / 'right') and read by `emit` at emit time. A copy in a closure created at setup would freeze it as null.
- `hot` is reassigned in `highlight`; `enterCell` and `onLeave` read it live. `hot` is the `{r, c}` object from `cellOf` (a new object each time), so `enterCell` compares by `r` and `c`, never by identity. Trap: when both `pos` and `hot` are null, `pos?.r === hot?.r` is `undefined === undefined` and returns early; that is intended and an extraction must keep it.
- `overlay` is replaced on each `setOverlay`; the previous node is removed first.
- `painted` flips once on the first `update`.
- `touchButton()` is called at each pointerdown for touch/pen (the caller's `state.touchMode` is read at stroke start); `onPointer` is captured once at construction (destructured option, not live).
- `document.elementFromPoint` and `e.pointerType` are read per event.
- `nodes` is read live by every function, but its contents are never replaced. `BUTTONS` is a module constant.
- `update(next)` reads the new cells argument each call; the original `cells` is used only for the first call.

## 7. Returned API and callers

Returned: `{ update, setClueDone, setOverlay, setWrong, setHighlight, sweep, destroy }`. Module exports: `gutterSize`, `inkColors`, `blankStyle`, `renderGrid`.

| Caller | Uses |
|---|---|
| Create `views/create/grid-view.js` 25-44 | `renderGrid(gridHost, {width, height, clues, cells, onPointer, palette, blank})` (no `zeroClues`, no `touchButton`); `gutterSize(clues).left`; stores result in `state.gridView`; calls `.update` (77), `.destroy` (26) |
| Create `views/create/index.js` 68, 276-277 | `state.gridView?.destroy()`, then null (twice: reset and unmount) |
| Create `views/create/report.js` 31, 75 | `state.gridView?.setHighlight` |
| Create `grid-view.js` 59 | queries `.nng-cell` and `data-r`/`data-c` in the rendered DOM (adds `nng-tile-right/bottom`); depends on class names and dataset |
| Play `views/play/index.js` 166-176, 212 | `renderGrid(holder, {..., onPointer: ctx.session.onPointer, touchButton, zeroClues: true, palette, blank})`; `inkColors` import; `grid?.destroy()` in `unmount` |
| Play `play/hud.js` 37, 58, 64, 87, 108, 112 | `ctx.grid().setWrong`, `.update`, `.setClueDone`, `.setOverlay(null | img)` |
| Play `play/session.js` 40, 82 | `ctx.grid().update(applyStroke(...))`, `.sweep(swept)` |
| Print `views/print.js` 62-69 | `renderGrid(page, {...dims, cells: empty})` and `renderGrid(key, {...dims, cells: solution})` (two grids at once; no onPointer, so the default no-op is used); `g.destroy()` for each |
| Tests | `test/grid.test.js` (`gutterSize` only), `test/blank_color.test.js` (`blankStyle`), `test/views_layout_create.test.js` (names only), `test/ux/*` through the DOM |

No module imports `renderGrid` other than the three views above; `src/` has no other `grid.js` importer.

## 8. Test coverage today

`test/grid.test.js` covers `gutterSize` (4 tests); `test/blank_color.test.js` covers `blankStyle`. `renderGrid` itself has no unit test. UX checks reach it only through the DOM:

- `test/ux/harness.js` `stroke()` (168-175) dispatches `pointerdown` on the first cell, `pointerover` on each next cell, and `pointerup` on the last cell, with `button` 0 or 2 and no `pointerType` (so always the mouse path).
- Covered through that: fill/cross by left and right strokes (`onDown` mouse branch, `enterCell`, `onOver`, `onUp` mouse branch), `update` classes, wrong mark (`nng-wrong`, checks 125 and 469), clue done (241, 446), blank color (506), sweep (checks 312-331 asserts `nng-sweep` is on a cell), zero clue (446), overlay via the reveal check (`.nng-art`), `setHighlight` via the Create report.

Not covered (no test dispatches or asserts any of these; mutations here will survive):
- **Drag, touch/pen:** `isTouch` branch of `onDown` (`touchButton()` call, `releasePointerCapture` try/catch), `onMove`, `cellAtPoint`, `onOver`'s touch skip, `onUp`'s `highlight(null)` after a touch.
- **Pointer lifecycle:** `onLeave` (pointerleave), `pointercancel`, a release outside the grid (window listener fires for a target that is not a cell), `button !== null` guard against a second press, `!(e.button in BUTTONS)` (middle button ignored), `onContext` preventDefault.
- **Hover:** `highlight` / `nng-hot` (no assertion on `nng-hot` anywhere under `test/`); `enterCell`'s duplicate-cell short circuit.
- **Sweep:** only the class is checked, not `--sweep-i` or the restart (`getBoundingClientRect` line) or the `animationend` removal.
- **Pop:** `nng-pop` and its `animationend` removal, and the `painted` guard (no pop on first update).
- **Thick lines:** `nng-thick-right/bottom` every 5th cell (only indirectly).
- **Keyboard:** `grid.js` has NO keyboard handling; arrows/keys are `ctx.session.onKey` (Play) and `onKeydown` in Create `grid-view.js`. Out of scope for this file, so nothing here to cover; `test/ux` keyboard checks are not affected by the cut.
- **Destroy:** that the window listeners are really removed (no test checks that a pointerup after `destroy` is ignored); `destroy` idempotency.
- **Overlay replacement:** `overlay?.remove()` when replacing one overlay with another (hud only ever passes `null` or one `img`).
- **Zero clues from `zeroClues`, gutter bands, corner:** presence of `nng-gutter-*`/`nng-grid-corner` is not asserted.

`dom-compare` (Wave 0d-1) will cover the static DOM, the fill/cross/undo interactions and class sets; it will not cover touch, leave, cancel or outside release unless 0e adds synthetic events with `pointerType`.

## 9. Proposed cut

Measured sizes: header+imports 5, helpers (`gutterSize`, `BUTTONS`, `blankStyle`, `div`) about 30, JSDoc 26, setup (scaffold) about 90 (81-169), paint/API functions 73 (171-243), pointer block about 85 (245-329), glue and return about 25.

The file reaches <= 300 after either extraction alone; two extractions give a comfortable margin and make each file one concern. No state object is needed (section 3), so I propose DROPPING step 2d as a separate state-object step: with it, the plan's three steps shrink to two. Deviation from the plan: report to the orchestrator and decide at the freeze point. If the orchestrator still wants three steps, 2d can be "move `hot`/`button` into the pointer function's own scope, in place", but that is the same work as step 2 below.

### Files (dependency order, no cycles)

| File | Contents | Lines (est.) | Imports |
|---|---|---|---|
| `src/views/grid-layout.js` (leaf) | `gutterSize`, `blankStyle`, `div`, and `buildGrid({width, height, clues, zeroClues, inks, blank})` = lines 81-169 returning `{ root, top, left, nodes, rowClues, colClues }` | 125-140 | `../color.js` (`inkText`) |
| `src/views/grid-pointer.js` | `BUTTONS`, `attachPointer(root, nodes, {width, height, onPointer, touchButton})` = lines 245-329 (`highlight`, `cellOf`, `emit`, handlers, listeners), returning `detach()` that removes the two window listeners | 90-105 | none |
| `src/views/grid.js` | JSDoc, `export { inkColors }`, `export { gutterSize, blankStyle } from './grid-layout.js'` (or `export *`), `renderGrid`: options destructure, `buildGrid`, `painted`/`overlay`, `update`, `setClueDone`, `setOverlay`, `setWrong`, `setHighlight`, `sweep`, `attachPointer`, initial `update`, append, return with `destroy` that calls `detach()` then `root.remove()` | 150-165 | `grid-layout.js`, `grid-pointer.js`, `../color.js` |

Dependencies: `grid-layout.js` and `grid-pointer.js` import nothing from this family and not each other; `grid.js` imports both. No cycle, and neither new file imports the old path (decision 2). Keep `inkColors` re-exported from `grid.js` (Play imports it there).

### Steps

**Step A (plan 2e), `grid-layout.js`, about 2 hours, mechanical.** Move the pure helpers and the whole setup block (81-169). `buildGrid` returns the six values; `renderGrid` destructures them. Keep the exports `gutterSize` and `blankStyle` available from `grid.js` (re-export lines) with `export-names`.
Risks: (1) DOM append order (bands, corner, column clues, row clues, cells), which `dom-compare` catches; (2) `place` must capture `root` and be used by `zero`/clues/cells in one function, so these stay together in `buildGrid`, not split across calls; (3) `inks` is computed once in `renderGrid` and passed in, since `update` also needs it (do not call `inkColors` twice, it may allocate); (4) the `zero` slots (`top - 1`, `left - 1`) and `--clue-i` values are easy to alter by accident; (5) `gutterSize`/`blankStyle` still exported from `grid.js` for `test/grid.test.js` and `test/blank_color.test.js`. Low risk overall; covered by `dom-compare` on every sample (play pages use `zeroClues`, Create uses empty clues, Print both).

**Step B (plan 2f), `grid-pointer.js`, about 3 hours, design + mechanical.** Move 245-329 into `attachPointer`. `hot` and `button` become locals of `attachPointer`; `emit` and every handler read them live (never copied). `onUp` must be the same function reference passed to `addEventListener` and `removeEventListener` (inside `detach`). `renderGrid`'s `destroy()` calls `detach()` first, then `root.remove()` (keeps the order: window listeners, then root).
Risks: (1) none of the touch/pen, leave, cancel, outside-release, `nng-hot` paths has a test (section 8), so a broken port can pass the whole suite: the lane must add the missing checks BEFORE moving (Wave 0e), at least synthetic `PointerEvent`s with `pointerType: 'touch'`, a `pointerleave`, a `pointercancel`, a window `pointerup` on a non-cell target, and an assertion on `nng-hot`; (2) `hot`/`button` copied or shadowed; (3) `undefined === undefined` early return in `enterCell`; (4) destroy ordering and idempotency; (5) the Create `up` -> `renderGridNow` -> `destroy` re-entrance; (6) `document.elementFromPoint` and `window` are globals, so `attachPointer` must not take them as arguments at construction time in a way that is evaluated early (just reference the globals inside the handlers).

Total: two steps of about 2 and 3 hours, both under 3.5. If the orchestrator keeps the plan's "state object" step it adds about 1 hour and no safety, because nothing is shared.

### Order of work

1. 0e closes the pointer-path gaps (section 8) so Step B has a net.
2. Step A (also lands the module-level helpers).
3. Step B.
Both are required to be run through `dom-compare`, `export-names`, and a `test/split_grid.test.js` that checks `buildGrid`, `gutterSize`, `blankStyle` are defined in `grid-layout.js` and `attachPointer` in `grid-pointer.js` and not in `grid.js` (comments stripped), and that `grid.js` re-exports `gutterSize`/`blankStyle`.

## 10. Items to flag to the orchestrator

- The plan's 2d (grid state object) is unnecessary; see section 3. Without it, the grid work is two lanes. "If the plan looks wrong, report" applies; I did not work around it.
- `inkColors` is re-exported from `grid.js` and also imported by Play from there: the `export { inkColors }` line must survive.
- The existing note in the plan that `renderGrid` is "about 280 lines" is right (67-347); the extra 67 lines of the file are the helpers and JSDoc.
