# Map of `src/views/create.js` (Wave 0, lane 0b: create)

Read-only map of the file at commit `03134e1` (922 lines). Every line number below was read from that file. It feeds Waves 1 and 2 of [view-split.md](view-split.md) and replaces the provisional module cut there. No code changed.

Shape of the file: module scope is lines 1 to 117, `mount` is lines 119 to 915, `unmount` is lines 917 to 922.

## 1. Module-scope state (outside `mount`)

| Binding | Line | Written by | Read by |
|---|---|---|---|
| `root` | 50 | `mount` (238, `root = el(...)`), `unmount` (921, set to `null`) | `fitCells` (315, `root.clientWidth`), `mount` (252, `container.append(root)`), `unmount` (920, `root?.remove()`) |
| `teardown` | 51 | `mount` (901, assigns the closure), `unmount` (919, set to `null`) | `unmount` (918, `teardown?.()`) |
| `draft` | 56 | `mount` (128, set to `null` right after it is read), the `teardown` closure (903, set to the saved draft or `null`) | `mount` (127), the `beforeunload` handler (61, `draft !== null`) |
| `liveUnsaved` | 57 | `mount` (896, set to a closure), the `teardown` closure (906, set to `null`) | the `beforeunload` handler (61) |

Constants: `PREVIEW_MAX` (46, read by `drawPreview`), `REPORT_DEBOUNCE_MS` (47, read by `scheduleReport`), `CSS_ID` (48, read by `mount` at 120 and 122).

The `beforeunload` listener (lines 59 to 66) is registered once at import time, guarded by `typeof window`, and is never removed. It reads `liveUnsaved` and `draft`, so both must stay in the same module as `mount` and `unmount`, or move to one shared module that all three import.

The draft object written by `teardown` (903 to 905) has the fields `st`, `image`, `history`, `baseline`, `titleTouched`, `title`, `savedSig`. `mount` restores all of them (129 to 139) except `title`, which is read in the DOM block (223). `reports`, `stroke`, `drag`, `previewScale`, `gridView`, `reportTimer` and `reportRun` are never saved; they start fresh on each mount.

Module-level functions: `el` (68 to 77), `sizeSelect` (79 to 84, DOM construction only, used by the DOM block), `decodeFile` (87 to 117, calls `el` and `loadScale`, touches no closure state).

## 2. The DOM block

Lines 142 to 251 only construct elements. They are the part that moves to `build.js`. Two things sit just outside that range and stay in `mount`:

- Line 252, `container.append(root)`, is a side effect on the page. It stays in `index.js`.
- Line 238, `root = el(...)`, assigns module-scope `root` and so is not pure construction. In `build.js` it becomes a local that is returned as `refs.root`; the assignment of the module-scope `root` moves to `index.js` right after the call (before line 252's equivalent).

There are no listeners, no timers and no state assignments inside 142 to 251. The only non-construction operations are `setAttribute`, `dataset` and `title` assignments on freshly created nodes, which are fine to move.

Values the block reads from closure state:

| Value | Line | Used for |
|---|---|---|
| `st.width` | 145 | initial value of `widthSel` |
| `st.height` | 146 | initial value of `heightSel` |
| `st.tileRows` | 160 | initial value of `tileRowsSel` |
| `st.tileCols` | 161 | initial value of `tileColsSel` |
| `restored?.title` | 223 | initial value of `titleInput` (falls back to `'Untitled'`) |

It also reads module-level `el` and `sizeSelect`, and the imported constants `COLOR_COUNTS`, `TILE_COUNTS` and `SIZES` (the default argument of `sizeSelect`). `container` is read only at 252, outside the block. So the builder signature is `buildCreate({ width, height, tileRows, tileCols, title })` returning refs, and it needs `el`, `sizeSelect` and three imports.

Refs the code after line 252 uses (these are the refs object): `errorBox`, `fileInput`, `widthSel`, `heightSel`, `slider`, `sliderValue`, `resetBtn`, `invertBox`, `colorsSel`, `brushBar`, `tileRowsSel`, `tileColsSel`, `blankBtn`, `startOverBtn`, `previewCanvas`, `previewWrap`, `gridHost`, `emptyNote`, `undoBtn`, `redoBtn`, `reportStatus`, `reportBadge`, `badgeLine`, `tileList`, `titleInput`, `saveBtn`, `saveNote`, `saveMsg`, and `root`. That is 29 refs.

Built but never used after 252, so they stay local to `build.js`: `colorsLabel`, `controls`, `editBar`, `gridWrap`, `reportSlot`, `saveSlot`.

Two refs are created with extra setup inside the block that the builder must keep: `errorBox` gets `role="alert"` (143), and `undoBtn` and `redoBtn` get a `title` and `aria-keyshortcuts` (196 to 200). The UX checks select by the class names in this block (`nng-create`, `nng-create-controls`, `nng-create-preview-wrap`, `nng-create-grid-wrap`, `nng-create-brushes`, `nng-create-report-status`, `nng-create-save-msg`), so class names and nesting must not change.

## 3. Every `let` binding in `mount`

`st` is a `const` (129), but it is reassigned-by-mutation, so it is listed too. All line numbers are write sites; "reads" are in section 4.

| Binding | Declared | Written at | Notes |
|---|---|---|---|
| `image` | 130 | 736 (`onFile`), 800 (`newBlank`), 830 (`onStartOver`) | restored from the draft; saved in the draft |
| `gridView` | 131 | 333 (`renderGridNow`), 913 (`teardown`) | `renderGrid` return value; read with `?.` |
| `previewScale` | 132 | 290 (`drawPreview`) | read only by `onPreviewMove` (855) |
| `reportTimer` | 134 | 563 (`scheduleReport`) | cleared at 556 and 909 |
| `reportRun` | 135 | 557 (`++reportRun` in `scheduleReport`), 910 (`reportRun++` in `teardown`) | the stale-result guard; read at 468, 481, 512, 518, 574, 577 |
| `titleTouched` | 136 | 832 (`onStartOver`), 889 (the `input` listener on `titleInput`) | restored from the draft; saved in the draft |
| `history` | 137 | 641 (`resetHistory`) | the object is also mutated: `push` (606), `undo` and `redo` (649) |
| `baseline` | 138 | 642 (`resetHistory`) | restored from the draft; saved in the draft |
| `savedSig` | 139 | 503 (`saveSingle`), 551 (`saveSet`), 833 (`onStartOver`) | restored from the draft; saved in the draft |
| `reports` | 367 | 559 (reassigned in `scheduleReport`), 575 and 578 (elements replaced inside the timer callback) | declared in the middle of `mount`, after `renderGridNow` is defined |
| `stroke` | 590 | 595 and 604 (`onGridPointer`) | `[r, c][]` while a left stroke is held, else `null`; read at 598, 599, 647, 885 |
| `drag` | 843 | 848 (`onPreviewDown`), 865 (`onPreviewUp`) | declared between function declarations, just above `onPreviewDown` |

That is 12 `let` bindings for Wave 1b to convert (`st` is a `const` and stays an object); nothing here is anywhere near the 25 that would trigger splitting 1b.

`st` fields, by whether the code reassigns the field or mutates inside it. All `st` writes assign fields; none mutates a nested value in place (`st.offset` is always replaced with a new object, `st.grid` is always replaced with a new array):

| Field | Written at |
|---|---|
| `grid` | 609 (`onGridPointer`), 649 (`stepHistory`), 684 and 712 (`regenerate`), 804 (`newBlank`) |
| `manualEdits` | 607 (`onGridPointer`), 651 (`stepHistory`), 687 and 713 (`regenerate`), 808 (`newBlank`) |
| `palette` | 685 and 694 (`regenerate`), 805 (`newBlank`) |
| `blank` | 686 and 695 (`regenerate`), 806 (`newBlank`) |
| `brush` | 617 and 626 (`syncBrushes`), 785 (`onColors`), 807 (`newBlank`) |
| `threshold` | 698 (`regenerate`), 769 (`onSlider`) |
| `autoThreshold` | 740 (`onFile`), 768 (`onSlider`), 775 (`onReset`) |
| `hasImage` | 738 (`onFile`), 801 (`newBlank`) |
| `offset` | 739 (`onFile`), 802 (`newBlank`), 861 (`onPreviewMove`) |
| `width`, `height` | 742 and 743 (`onFile`), 752 and 753 (`onSize`) |
| `tileRows`, `tileCols` | 754 and 755 (`onSize`) |
| `colors` | 784 (`onColors`) |
| `invert` | 794 (`onInvert`) |
| all fields | 829 (`Object.assign(st, newEditorState(...))` in `onStartOver`) |

Important for 1b: `onStartOver` resets by `Object.assign` into the existing `st` (829), so `st` keeps its identity. The draft stores that same object (904) and the next mount reuses it (129). Keep `st` as a nested object (`state.st`) rather than flattening its fields into the new `state` object; flattening would break the `Object.assign` reset and the `hasUnsavedWork(st, savedSig)` and `gridSig(st)` calls (which take `st`, not the whole state).

Other state-like values: `titleInput.value` is written at 737 (`onFile`) and 831 (`onStartOver`), and `fileInput.value` at 733, 810, 835. These are DOM state, not bindings.

## 4. Inner functions

Line counts are `end - start + 1` from the ranges. "Module" is the recommendation from section 6 (the provisional cut had no home for ten of these; they are marked `index` for the shell). State names refer to the section 3 bindings; `st.*` lists fields.

| Function | Lines | Reads | Writes | DOM refs | Calls | Called by | Module |
|---|---|---|---|---|---|---|---|
| `showError` | 255-258 (4) | none | none | `errorBox` | none | `onFile`, `onStartOver` | index |
| `syncControls` | 260-277 (18) | `image`, `st.width/height/tileRows/tileCols/threshold/invert/colors` | none | `widthSel`, `heightSel`, `tileRowsSel`, `tileColsSel`, `slider`, `sliderValue`, `invertBox`, `colorsSel`, `resetBtn`, `blankBtn` | none | `regenerate`, `onSize`, `onSlider`, `onColors`, `onInvert`, `newBlank`, `onStartOver`, init (897) | index |
| `dims` (const arrow) | 279 (1) | `st.width/height/tileRows/tileCols` | none | none | `fullSize` | `currentCrop`, `renderGridNow`, `regenerate`, `newBlank`, `onPreviewDown`, `onPreviewMove` | index |
| `tiled` (const arrow) | 280 (1) | `st.tileRows/tileCols` | none | none | none | `renderGridNow`, `showReport`, `onSave` | index |
| `currentCrop` | 282-285 (4) | `image`, `st.offset` | none | none | `dims` | `drawPreview`, `artFor`, `regenerate`, `onPreviewDown` | image-source |
| `drawPreview` | 287-310 (24) | `image` | `previewScale` | `previewWrap`, `previewCanvas` | `currentCrop` | `regenerate`, `newBlank`, `onStartOver`, init (898) | crop-preview |
| `fitCells` | 313-320 (8) | module `root` | none | `gridHost` | `narrowCellSize` | `renderGridNow` | grid-view |
| `renderGridNow` | 322-352 (31) | `gridView`, `image`, `st.grid/palette/blank/colors`, `st.width/height` | `gridView` | `gridHost`, `emptyNote` | `dims`, `tiled`, `fitCells`, `syncBrushes`, `markTileBoundaries`, `syncHistoryButtons`, `scheduleReport`; passes `onGridPointer` to `renderGrid` | `onGridPointer`, `stepHistory`, `regenerate`, `newBlank`, `onStartOver`, `onResize`, init (899) | grid-view |
| `markTileBoundaries` | 355-362 (8) | `st.width/height` | none | `gridHost` | none | `renderGridNow` | grid-view |
| `showReport` | 369-435 (67) | `reports`, `gridView`, `st.grid/tileRows/tileCols/width/height` | none | `badgeLine`, `tileList`, `reportStatus`, `reportBadge`, `saveBtn`, `saveNote` | `tiled`; calls `gridView.setHighlight` | `scheduleReport` (561, 581, 583) | report |
| `showSaveMessage` | 437-442 (6) | none | none | `saveMsg` | none | `saveSingle`, `saveSet` | save |
| `artFor` | 448-461 (14) | `image`, `st.tileRows/tileCols` | none | none | `currentCrop` | `saveSingle`, `saveSet` | save |
| `onSave` | 463-465 (3) | none | none | none | `tiled`, `saveSingle`, `saveSet` | click listener on `saveBtn` | save |
| `saveSingle` (async) | 467-508 (42) | `reportRun`, `reports`, `st.grid/palette/blank`, `titleInput.value` | `savedSig` | `titleInput` | `canSave`, `artFor`, `showSaveMessage`, `gridSig` | `onSave` | save |
| `saveSet` (async) | 511-553 (43) | `reportRun`, `reports`, `st.grid/tileRows/tileCols/palette/blank`, `titleInput.value` | `savedSig` | `titleInput` | `canSaveSet`, `artFor`, `showSaveMessage`, `gridSig` | `onSave` | save |
| `scheduleReport` | 555-585 (31) | `st.grid/tileRows/tileCols`, `solver`, `reportTimer`, `reportRun` | `reportTimer`, `reportRun`, `reports` | `saveMsg` | `showReport`, `solver.solve` | `renderGridNow` | report |
| `strokeOf` (const arrow) | 591 (1) | none | none | none | none | `onGridPointer` | grid-view |
| `onGridPointer` | 593-612 (20) | `stroke`, `gridView`, `history`, `st.grid/brush` | `stroke`, `st.manualEdits`, `st.grid` | none | `strokeOf`, `renderGridNow`; `history.push`, `gridView.update` | the grid renderer (callback) | grid-view |
| `syncBrushes` | 615-632 (18) | `st.palette/brush` | `st.brush` (617, and 626 inside a click listener) | `brushBar` | `syncBrushes` (from its own click listener) | `renderGridNow` | grid-view |
| `syncHistoryButtons` | 634-637 (4) | `history` | none | `undoBtn`, `redoBtn` | none | `renderGridNow`, `resetHistory` | grid-view |
| `resetHistory` | 640-644 (5) | `st.grid` | `history`, `baseline` | none | `syncHistoryButtons` | `regenerate`, `newBlank`, `onStartOver` | grid-view |
| `stepHistory` | 646-653 (8) | `stroke`, `history`, `baseline` | `st.grid`, `st.manualEdits` | none | `renderGridNow`; `history.undo/redo` | `onKeydown`, click listeners on `undoBtn` and `redoBtn` | grid-view |
| `onKeydown` | 655-666 (12) | the event | none | none | `stepHistory` | `document` `keydown` listener | grid-view |
| `okToDiscard` | 669-674 (6) | `st.manualEdits` | none | none | `regenerateNeedsConfirm`, `confirm` | `onFile`, `onSize`, `onSlider`, `onReset`, `onColors`, `onInvert`, `onBlank`, `onPreviewDown` | index |
| `regenerate` | 677-718 (42) | `image`, `st.colors/width/height/tileRows/tileCols/autoThreshold/threshold/invert/offset` | `st.grid/palette/blank/manualEdits/threshold` | none | `dims`, `currentCrop`, `resetHistory`, `syncControls`, `drawPreview`, `renderGridNow` | `onFile`, `onSize`, `onSlider`, `onReset`, `onColors`, `onInvert`, `onPreviewMove` | image-source |
| `onFile` (async) | 721-745 (25) | `fileInput.files`, `titleTouched`, `image`, `st.tileRows/tileCols` | `image`, `titleInput.value`, `st.hasImage/offset/autoThreshold/width/height` | `fileInput`, `titleInput` | `showError`, `decodeFile`, `okToDiscard`, `regenerate`, `defaultSize`, `titleFromFile` | `change` listener on `fileInput` | image-source |
| `onSize` | 747-761 (15) | `image`, the four size selects | `st.width/height/tileRows/tileCols` | `widthSel`, `heightSel`, `tileRowsSel`, `tileColsSel` | `okToDiscard`, `syncControls`, `regenerate`, `newBlank` | `change` listeners on the four selects | image-source |
| `onSlider` | 763-771 (9) | `slider.value` | `st.autoThreshold/threshold` | `slider` | `okToDiscard`, `syncControls`, `regenerate` | `input` listener on `slider` | image-source |
| `onReset` | 773-777 (5) | none | `st.autoThreshold` | none | `okToDiscard`, `regenerate` | click listener on `resetBtn` | image-source |
| `onColors` | 779-787 (9) | `colorsSel.value` | `st.colors/brush` | `colorsSel` | `okToDiscard`, `syncControls`, `regenerate` | `change` listener on `colorsSel` | image-source |
| `onInvert` | 789-796 (8) | `invertBox.checked` | `st.invert` | `invertBox` | `okToDiscard`, `syncControls`, `regenerate` | `change` listener on `invertBox` | image-source |
| `newBlank` | 799-814 (16) | none | `image`, `st.hasImage/offset/grid/palette/blank/brush/manualEdits`, `fileInput.value` | `fileInput` | `dims`, `resetHistory`, `syncControls`, `drawPreview`, `renderGridNow` | `onSize`, `onBlank` | index |
| `onBlank` | 816-819 (4) | none | none | none | `okToDiscard`, `newBlank` | click listener on `blankBtn` | index |
| `onStartOver` | 822-840 (19) | `st`, `savedSig` | `st` (via `Object.assign`), `image`, `titleTouched`, `savedSig`, `titleInput.value`, `fileInput.value` | `titleInput`, `fileInput` | `hasUnsavedWork`, `confirm`, `showError`, `resetHistory`, `syncControls`, `drawPreview`, `renderGridNow` | click listener on `startOverBtn` | index |
| `onPreviewDown` | 844-851 (8) | `image`, `st` via `dims` | `drag` | `previewCanvas` | `okToDiscard`, `dims`, `currentCrop`, `centerCrop` | `pointerdown` listener | crop-preview |
| `onPreviewMove` | 852-863 (12) | `drag`, `previewScale`, `image` | `st.offset` | `previewCanvas` | `dims`, `centerCrop`, `regenerate` | `pointermove` listener | crop-preview |
| `onPreviewUp` | 864-867 (4) | none | `drag` | `previewCanvas` | none | `pointerup` and `pointercancel` listeners | crop-preview |
| `onResize` (const arrow) | 884-886 (3) | `stroke` | none | none | `renderGridNow` | `window` `resize` listener | index |

Module-level functions that move too: `decodeFile` (87-117, 31 lines) goes with image-source, `sizeSelect` (79-84) goes with build, `el` goes to `dom.js`.

## 5. Event wiring and cleanup

All wiring is in one block, lines 869 to 894, plus one listener created per brush chip, plus the timer.

| Line | Target | Event | Calls | Removed at teardown |
|---|---|---|---|---|
| 869 | `fileInput` | `change` | `onFile` | no (element dies with `root`) |
| 870-873 | `widthSel`, `heightSel`, `tileRowsSel`, `tileColsSel` | `change` | `onSize` | no |
| 874 | `slider` | `input` | `onSlider` | no |
| 875 | `resetBtn` | `click` | `onReset` | no |
| 876 | `invertBox` | `change` | `onInvert` | no |
| 877 | `colorsSel` | `change` | `onColors` | no |
| 878 | `blankBtn` | `click` | `onBlank` | no |
| 879 | `startOverBtn` | `click` | `onStartOver` | no |
| 880 | `saveBtn` | `click` | `onSave` | no |
| 881 | `undoBtn` | `click` | `stepHistory(true)` (inline arrow) | no |
| 882 | `redoBtn` | `click` | `stepHistory(false)` (inline arrow) | no |
| 883 | `document` | `keydown` | `onKeydown` | yes, 907 |
| 887 | `window` | `resize` | `onResize` (884 to 886) | yes, 908 |
| 888-890 | `titleInput` | `input` | inline arrow, sets `titleTouched = true` | no |
| 891-894 | `previewCanvas` | `pointerdown`, `pointermove`, `pointerup`, `pointercancel` | `onPreviewDown`, `onPreviewMove`, `onPreviewUp` (twice) | no |
| 625 | each brush chip | `click` | inline arrow: `st.brush = i + 1; syncBrushes()` | no (chips are replaced on every `syncBrushes`) |
| 60 | `window` | `beforeunload` | reads `liveUnsaved` and `draft` | never (module scope, once at import) |

Other registrations:

- Timer: `setTimeout` at 563 (`reportTimer`), cleared at 556 (next schedule) and 909 (teardown).
- Worker: `createSolverClient()` at 133, `solver.terminate()` at 911.
- Pointer capture: `previewCanvas.setPointerCapture` at 849.
- Grid callback: `renderGrid(..., { onPointer: onGridPointer })` at 338; `gridView.destroy()` at 323 and 912.
- `liveUnsaved` is set at 896 and cleared at 906.

What stays in `index.js`: all of lines 869 to 899 (wiring and initial render), `teardown`, `unmount`, the module-scope state and the `beforeunload` listener, plus the shell functions marked `index` in section 4. Wave 2 modules do not register listeners on their own, except `syncBrushes`, whose per-chip listener is created inside the function and moves with it.

## 6. Module-crossing analysis

### Cut used for the count

The count uses this cut. It is the provisional one with two changes: `artFor` moves from grid-view to save (it is called only by `saveSingle` and `saveSet`, 474 and 519, and it reads `image` and `currentCrop`, nothing grid-related), and the ten functions the provisional table did not place stay in `index.js` (`showError`, `syncControls`, `dims`, `tiled`, `okToDiscard`, `newBlank`, `onBlank`, `onStartOver`, `onResize`, `teardown`).

A "crossing write" is an assignment in a function of module A to state that a function in a different Wave 2 module B reads. Writes whose only readers are in `index.js` are counted separately; they are cheap, because `index.js` holds the state object and reads it directly.

| Writer module | Crossing writes (site count) | Readers | Count |
|---|---|---|---|
| image-source | `image` 736; `st.grid` 684, 712; `st.palette` 685, 694; `st.blank` 686, 695; `st.width/height` 742, 743, 752, 753; `st.tileRows/tileCols` 754, 755; `st.colors` 784; `st.brush` 785; `titleInput.value` 737 | crop-preview, grid-view, report, save | 16 |
| crop-preview | `st.offset` 861 | image-source (`currentCrop`) | 1 |
| grid-view | `st.grid` 609, 649; `gridView` 333 | report, save | 3 |
| report | `reportRun` 557; `reports` 559, 575, 578 | save | 4 |
| save | none (`savedSig` is read only by `index.js`) | | 0 |
| **Total across Wave 2 modules** | | | **24** |

Writes from a Wave 2 module whose readers are only in `index.js`: image-source 6 (`st.manualEdits` 687, 713; `st.threshold` 698, 769; `st.hasImage` 738; `st.invert` 794), grid-view 6 (`st.manualEdits` 607, 651; `stroke` 595, 604; `history` 641; `baseline` 642), report 1 (`reportTimer` 563), save 2 (`savedSig` 503, 551). Total 15.

Writes from `index.js` functions to state the modules read: `newBlank` 8 (`image`, `st.hasImage/offset/grid/palette/blank/brush/manualEdits`), `onStartOver` 4 (`st` by `Object.assign`, `image`, `titleTouched`, `savedSig`), the `titleInput` listener 1 (`titleTouched`), `teardown` 2 (`reportRun`, `gridView`). Total 15.

Not crossing: `previewScale` and `drag` are written and read only by crop-preview functions; `autoThreshold` is written and read only in image-source.

### Cross-module calls (they matter more than the writes)

- image-source calls grid-view (`renderGridNow` at 691 and 717; `resetHistory` at 688 and 714), crop-preview (`drawPreview` at 690 and 716) and the shell (`syncControls`, `okToDiscard`, `showError`, `newBlank`).
- crop-preview calls image-source (`currentCrop` at 297 and 848; `regenerate` at 862) and the shell (`okToDiscard`, `dims`).
- grid-view calls report (`scheduleReport` at 351) and the shell (`dims`, `tiled`). It calls `setHighlight` on its own `gridView`, which report also calls (378, 422).
- report calls grid-view only through the `gridView` object.
- save calls image-source (`currentCrop`, through `artFor`) and reads report state.
- The shell calls into every module.

There is one real cycle: image-source calls `drawPreview` (crop-preview) and crop-preview calls `regenerate` (image-source). It is resolved by calling through the shared context at run time, not by destructuring at construction (see Risks).

### Recommendation

Keep the five-module cut and the three rounds, with the two changes above. Nothing needs to change in the round order:

- Round 2.1: `report` and `save`. Both own no state; `report` writes `reports`, `reportRun`, `reportTimer`, which `save` only reads, so they are independent once 1b has put those on the state object.
- Round 2.2: `crop-preview` and `grid-view`.
- Round 2.3: `image-source`, last, because it holds 16 of the 24 crossing writes and calls into both earlier rounds.

At most two create lanes run at once in any round, under the 3-per-view cap.

### Estimated sizes

Function lines come from the section 4 ranges. "Boilerplate" is the factory wrapper, imports and constants, estimated at 15 to 25 lines each; that part is an estimate, the function sums are not.

| Module | Function lines | Estimated total | Over 250? |
|---|---|---|---|
| `build.js` | 110 (lines 142-251) + 6 (`sizeSelect`) | about 125 | no |
| `image-source` | 148 (`decodeFile` 31, `currentCrop` 4, `regenerate` 42, `onFile` 25, `onSize` 15, `onSlider` 9, `onReset` 5, `onColors` 9, `onInvert` 8) | about 175 | no |
| `crop-preview` | 48 (`drawPreview` 24, `onPreviewDown` 8, `onPreviewMove` 12, `onPreviewUp` 4) | about 70 | no |
| `grid-view` | 115 (`fitCells` 8, `renderGridNow` 31, `markTileBoundaries` 8, `onGridPointer` 20, `strokeOf` 1, `syncBrushes` 18, `syncHistoryButtons` 4, `resetHistory` 5, `stepHistory` 8, `onKeydown` 12) | about 145 | no |
| `report` | 98 (`showReport` 67, `scheduleReport` 31) | about 125 | no |
| `save` | 108 (`showSaveMessage` 6, `artFor` 14, `onSave` 3, `saveSingle` 42, `saveSet` 43) | about 135 | no |
| `index.js` | shell functions 70 (`showError` 4, `syncControls` 18, `dims` 1, `tiled` 1, `okToDiscard` 6, `newBlank` 16, `onBlank` 4, `onStartOver` 19, `onResize` 3), plus wiring, state setup, teardown, unmount and the module-scope draft code | about 210 | no |

No module is estimated over 250, so none needs splitting. If the shell functions were folded into image-source the estimate would rise to about 215, still under 250, but that would add shell-to-module calls, so they are kept in `index.js`.

## 7. Tests and checks that depend on `create.js`

- `src/app.js` is the only importer (line 4, `import * as create from './views/create.js'`). It uses the module as a route table entry (line 14) and calls `mount(main, params)` and `unmount()` through the shared view interface. After the folder move the import path becomes `./views/create/index.js`, and `index.js` must still export exactly `mount` and `unmount`.
- No file under `test/` imports `src/views/create.js`. `test/create.test.js` imports `src/create-logic.js`, `src/format.js`, `src/tiles.js` and `src/store.js`, not the view.
- The view is exercised only through the browser UX checks (`test/ux/checks.js`, `test/ux/harness.js`, run by `npm run test:ux` and `ux-checks.html`). They drive `#/create` and select by class name; the classes they use are `nng-create`, `nng-create-controls`, `nng-create-preview-wrap`, `nng-create-grid-wrap`, `nng-create-brushes`, `nng-create-report-status`, `nng-create-save-msg`, plus the shared grid classes. The checks named `create-blank-grid-usable`, `create-no-save-when-empty`, `create-undo`, `create-draft-survives-navigation` and `create-save-duplicate-keeps-title`, and the color and pipeline checks, are the behavioral net for this split.
- `FEATURES.json` line 300 (the `split-create-view` row) names the target modules: build, image-source, crop-preview, grid-view, report, save, index. The recommended cut keeps all of those names.
- The stylesheet link is `css/create.css` (121), relative to the page, not the module, so the folder move does not affect it.

## 8. Risks

1. **Import paths change on the move.** The imports at lines 3 to 44 use `../` and `./grid.js`; from `src/views/create/` they become `../../` and `../grid.js`. The `create-logic.js` import list is 29 names; each Wave 2 module should import only the names it uses, and `no-unused-vars` in lint will flag leftovers in `index.js`.
2. **Declaration order inside `mount`.** `reports` (367), `stroke` (590) and `drag` (843) are declared mid-function, after some functions that read them. Today this is safe only because nothing runs until line 896, and function declarations are hoisted. Putting them on the state object in 1b removes the issue, but their initial values must be set before the first `renderGridNow` call (899), and `reports` must start as `[{ phase: 'pending', result: null }]`.
3. **Factory construction order versus the image-source and crop-preview cycle.** If a factory destructures another module's functions when it is constructed, the later module is not built yet. Modules must call each other as `ctx.<module>.fn(...)` at run time, or all factories must be built first and then wired.
4. **`st` identity.** `onStartOver` resets with `Object.assign(st, ...)` (829) and the draft stores the same `st` object. Keep `st` nested in the state object; do not flatten it, and do not replace it by assignment.
5. **Draft contents.** The draft saves seven fields (section 1). If 1b stores the whole state object as the draft, transient fields (`gridView`, `stroke`, `drag`, `reports`, `reportTimer`, `reportRun`, `previewScale`) would be restored stale and `gridView` would point at a destroyed view. Keep the explicit field list in `teardown` and the explicit restore list in `mount`.
6. **Values read at teardown must be read at call time.** `teardown` (901 to 914) reads `st`, `image`, `history`, `baseline`, `titleTouched`, `savedSig`; capturing them in a closure at mount time would save the initial values. Under the state object this is natural (`state.image`), but a refactor that destructures state once would break it.
7. **Async work outlives `unmount` today, and a pure move must keep it identical.** `onFile` awaits `decodeFile` (727) and, if the view was unmounted meanwhile, goes on to set `image`, call `regenerate` and `renderGridNow`, which can start a new `scheduleReport` timer after `teardown` already cleared the old one and terminated the solver. `fitCells` would also read `root.clientWidth` after `unmount` set `root = null` (315), which would throw on a narrow window. `saveSingle` and `saveSet` can also write `savedSig` or the store after unmount (guarded only by `reportRun`). These are existing behaviors, not introduced by the split; the move must not "fix" or change them, and they are worth recording for the later cleanup.
8. **Stale-result guard.** `reportRun` is incremented in `scheduleReport` and read after every `await` in `saveSingle`, `saveSet` and the timer callback (468, 481, 512, 518, 574, 577). `run` is captured as a local at the top of each; the move must keep that capture local and must not read `state.reportRun` for it.
9. **Per-chip closures.** `syncBrushes` creates a click listener per chip with the loop index `i` (625 to 628). It is a `map` callback, so `i` is a fresh binding per chip. Moving the function whole is safe; do not hoist the listener out of the callback.
10. **`this` and `arguments`.** None of the inner functions use `this` or `arguments`. All are plain functions or arrows, so moving them needs no binding changes.
11. **Hoisting of function declarations.** The inner functions are declarations, so order within `mount` does not matter today. After extraction into factories, the functions become properties of returned objects or locals of the factory; a function used by a sibling must be defined before first call at run time, not at construction time. Everything is first called at 896 or later or from an event, so this holds if factories are all built before line 896's equivalent.
12. **Module-scope `root` read by `fitCells`.** `fitCells` reads the module variable `root`, not a local. After the DOM block moves, `root` is set by `index.js` after the builder returns, and `fitCells` (in grid-view) needs it through `ctx` (for example `refs.root`). Reading `refs.root` instead of the module variable changes behavior only in the post-unmount case in risk 7, where the old code throws on `null` and the new one would not; if exact equivalence matters, expose `ctx.root()` that returns the module variable.
13. **The plan's count and shape check out.** The plan estimates `mount` at 119 to 916; measured, `mount` ends at line 915 and `unmount` runs 917 to 922. The provisional table placed `artFor` in grid-view and left ten functions unplaced; both are corrected above. Provisional line estimates were high for crop-preview (100 estimated, about 70) and image-source (200 estimated, about 175); nothing else in the plan needs to change.
