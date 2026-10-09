# Nonogram Studio — Plan

**Created:** 2026-10-08
**Status:** All build steps (0 to 12s) merged to main and checked by hand in the browser, 2026-10-08. 119 tests pass. Registered in the toolkit. Remaining in step 13: `/gate-review`, Jess's print preview check, and difficulty calibration by play.
**Platform:** web browser, desktop first.
**What it is:** A personal tool to turn an image (your own picture, no AI in the content) into a nonogram, check that it's a fair puzzle, then play it with state saved. Single user, no accounts.

---

## Research findings that shape the plan

**Rules.** Each row and column clue lists its runs of filled cells in order. Runs of the **same** color need at least one blank between them. In color puzzles, runs of **different** colors may touch, or may not, and the solver has to work out which. ([Wikipedia](https://en.wikipedia.org/wiki/Nonogram), [Easybrain help](https://nonogramcolorios.easybrain.com/hc/en-us/articles/360011229957-What-is-Nonogram-Color))

**What makes a good puzzle.** In order of importance:
1. **A unique solution.** If more than one solution exists, a solver can't tell which one you meant, and the puzzle is broken.
2. **Line-solvable, meaning no guessing.** Every cell can be deduced by reasoning about one row or column at a time. A puzzle can have a unique solution and still force guessing. On 5x5 grids alone there are more than 333k such puzzles. ([mscroggs](https://www.mscroggs.co.uk/blog/117)) Simon Tatham's Pattern game guarantees there's no backtracking.
3. **A picture you can recognize.** Players want the payoff of an image. ([Leiden thesis](https://liacs.leidenuniv.nl/assets/Masterscripties/2011-04SjoerdHenstra.pdf))
4. **Matching difficulty.** The academic measures count solver steps. Commercial games tier by grid size: 10x10 is normal, 15x15 is hard.

**Why image to nonogram isn't just thresholding.** Henstra (Leiden, 2011) shows that thresholding alone usually produces puzzles that aren't unique. The fix is a loop: threshold, check, modify cells, check again. Existing tools ([convert-nonogram](https://crates-io.ganymede-static.progval.net/crates/convert-nonogram/0.1.1), the commercial Nonogram Generator) offer the same knobs: grid size, threshold, a uniqueness check, and showing where the ambiguity is. **So the creator has to include a cell editor and a live solver report.** A one-shot converter isn't enough.

**Standard play interface.** These are conventions, not a formal spec. Sources: [UW CSE154 lab](https://courses.cs.washington.edu/courses/cse154/19su/sections/extra/nonograms/slides/index.html), App Store listings, Picross e reviews.
- Fill and cross (X) are separate states. A cross marks a cell you know is empty. Left-click fills, right-click crosses, and tablets use a mode toggle.
- Dragging paints. **The first cell's state sets the action for the whole stroke**: starting on an empty cell fills, starting on a filled cell clears. A drag that starts outside the grid does nothing.
- **Inferred from playing the games, not found in a source:** drags lock to the row or column they start in, and the UI shows a live count of the run you're dragging.
- Thick gridlines every 5 cells. Highlight the row and column under the cursor.
- Clues cross themselves off when satisfied. A completed line can auto-cross its blank cells (optional).
- Undo and redo. Autosave.
- **Picross e's two rule sets:** *Normal* flags mistakes with a time penalty, and *Free* gives no mistake feedback. Hints are optional, for example revealing a cell or pre-filling a row. Experienced players switch the helpers off.
- **Known UX weakness:** touch targets get too small from 15x15 up on small screens.

**Interchange format.** [webpbn XML v0.3](https://webpbn.com/pbn_fmt.html) is the de facto standard. Solvers such as pbnsolve and nonogrid read it. It supports color puzzles, the goal solution, **and saved partial progress** (`<solution type="saved">`). We'll export to it. I couldn't fetch the `.non` spec (404), so `.non` is out of scope until it's verified.

**Sizes.** 5x5, 10x10, 15x15 and 20x20 are standard. Picross DS goes up to 25x20, so 25x25 is feasible on a desktop screen. The constraint is clue width: the worst case for a 25-cell line is 13 clue numbers.

---

## Decisions (all closed, see Decisions log)

**D1. Stack.** *Expensive to reverse.* Play has to happen in a browser, so the question is where the logic lives.
1. **(rec)** One static web app (creator and player) written in plain JS modules. Install **Node as a dev tool only** so the pure logic can be tested with `node --test`. ESLint and Prettier as npm dev dependencies. The page is served with `python -m http.server`, which is already available (ES modules don't load from `file://`). No runtime dependencies.
2. A Python creator (Pillow and pytest, both already installed) writes JSON, plus a separate JS player. Two languages, and the solver would exist twice or the player couldn't check anything. The JS would also be untested without Node.
3. All JS without Node, with tests running in a browser test page. No install, but clunkier testing and no lint.
Reversing this later means rewriting the core. Installing Node takes about 2 minutes with `winget install OpenJS.NodeJS.LTS`, and you'd run it.

**D2. Data model.** *Expensive to reverse, because saved puzzles and save files grow around it.*
**(rec)** Make it color-ready from day 1 even though v1 is monochrome. A puzzle is `{v: 1, id, title, width, height, palette: [{name, hex}], solution: number[][], verdict}`, where 0 is the background and 1..n index into the palette. Clues are derived from the solution, never stored. `verdict` is `{status, sweeps}` from the solver, computed when the puzzle is saved, so the library can show both fairness and difficulty. It's cached, so the player never re-solves a 25x25 on load, and it's excluded from the id hash. A save is a separate record: `{puzzleId, cells, elapsedMs, rules, solvedAt}` (`solvedAt` is null until solved).
Alternative: a boolean grid now, migrating when color lands. That's cheaper today, but every saved puzzle would need migrating.

**D3. Where the picture comes from.**
1. **(rec)** Upload an image, convert it, then touch up cells in the editor.
2. Also allow drawing from a blank grid in the same editor. This costs almost nothing once the editor exists.
Recommend both. "Draw from blank" is the same editor started without an image.

**D4. Target device.**
1. **(rec)** Desktop browser first, using mouse and keyboard, right-click to cross, and up to 25x25. Tablet touch comes in a later pass.
2. Tablet or phone first. That makes 25x25 unrealistic and leans hard on the fill/cross toggle.

**D5. Default rule set when playing.**
1. **(rec)** Free rules by default: no mistake feedback, purest play. Toggles for "check mistakes" and "hint: reveal a cell". A puzzle you made yourself is spoiled for you anyway, so the toggles mostly matter for other people's or older puzzles.
2. Normal (Picross-style) by default.

**Q6. Grid shape and image aspect (CLOSED 2026-10-08: option 1, plus tiling, see Q7).** Should the grid be square only, or allow independent width and height (Picross uses 25x20)? And when the image's aspect ratio doesn't match the grid, what happens?
1. **(rec)** Width and height are picked independently from {5, 10, 15, 20, 25}. The default is the preset closest to the image's aspect. A mismatched image gets center-cropped, with a crop offset you can drag.
2. Square only, with center crop.
3. Independent width and height, with the image squashed to fit (distorts the picture).

**Q7. Tiling (CLOSED 2026-10-08).** One image is split into an R x C set of independent puzzles. Solving every tile reveals the whole picture, like "Clip Picross" in Picross S. Rejected: one large puzzle shown in pages.

**My calls unless you object:**
- **Grayscale conversion.** Average the brightness per cell. Default threshold from Otsu's method, with a slider and an invert toggle. Rejected "any dark pixel fills the cell" because it's too noisy.
- **Difficulty label.** A sweep is one pass of the line solver over every row and column. Thresholds are provisional:
  - Easy: line-solvable in 3 or fewer sweeps.
  - Medium: line-solvable in more than 3.
  - Hard: unique, but needs probing.
  - Not fair: more than one solution, or `unknown`.
  This is a heuristic, labeled as such, and the thresholds get calibrated in step 13.
- **No auto-fixing ambiguity.** Henstra's automatic modify loop is out. The tool shows the ambiguous cells and you decide. Changing the picture is a design call.

---

## Scope

**In (v1):**
- Monochrome creator: image to grid at 5, 10, 15, 20 or 25, a threshold, a cell editor, and a live report covering uniqueness, line-solvability, ambiguous cells and difficulty.
- Puzzle library stored locally.
- Player with the standard interface above, autosave, and save file export and import.
- Print view.
- webpbn XML export.
- Tiled sets: one image split into an R x C set of puzzles (Q7).

**Out:** AI content, accounts, sync, sharing, sound, triddlers and other variants, auto-repairing ambiguity, `.non`.

**Deferred (stretch, in order):**
1. Color mode: palette quantize, color clues, and a color solver.
2. webpbn XML import.
3. Tablet touch pass.

---

## Steps

Each step takes 10 to 15 minutes, and each names the test that proves it. Logic tests run through `node --test`. UI steps are verified in the browser pane and marked **[manual]**, with their pure state functions unit tested.

### Parallel lanes

Tags on each step read `[wave·lane]`. Steps in the same wave but different lanes can run at the same time. Steps within a lane run in order. `[seq]` means nothing runs alongside it. A wave starts once the steps it depends on are done, not when the whole previous wave is done.

| Wave | Lane | Steps | Depends on | Owns files |
|---|---|---|---|---|
| 0 | n/a | 0 setup | none | `package.json` (all scripts), lint/format config, `.git/hooks/commit-msg`, session-root `.claude/launch.json` |
| W1 | A, logic core | 1 → 3 → 4a → 4b | 0 | `src/clues.js`, `src/solver.js`, `src/solver.worker.js` + tests |
| W1 | B, image | 2 | 0 | `src/image.js` + test |
| W1 | C, format | 5 | 0 | `src/format.js` + test |
| W1 | D, strokes | 6b | 0 | `src/play-state.js` + test |
| W2 | gate | 6a app shell + store | 1, 5 | `index.html`, `src/app.js`, `src/views/grid.js`, `css/base.css`, `src/store.js` + test |
| W2 | B | 12b tiles | 2, 5 | `src/tiles.js` + test |
| W2 | C | 5x XML export | 1, 5 | `src/webpbn.js` + test |
| W3 | P, player | 7 → 8 → 9 | 6a, 6b | `src/views/play.js`, `css/play.css`, `src/save.js` (serialize, export, import; storage goes through `store.js`) |
| W3 | K, creator | 10 → 11a → 11b → 11c | 6a, 2, 6b; 11b also needs 4b | `src/views/create.js`, `css/create.css` |
| W3 | L, library | 12 → 12p → 12d | 6a, 5; 12 also needs 5x; 12d also needs 12b | `src/views/library.js`, `css/library.css`, `src/views/print.js`, `src/backup.js` |
| W4 | n/a | 12c tile creator UI + set save | K (incl. 11c), 12b | `src/views/create.js` (after K is done) |
| W5 | n/a | 12s cozy styling pass | 12c, 12d (all views exist) | `css/*.css`, `index.html` head, `src/theme.js` |
| n/a | n/a | 13 close | all | n/a |

**Where it pays off.** W1 is the real win: four pure-logic lanes with no DOM and no shared files. W3 is a moderate win. Its three UI lanes are separate, but they share the grid renderer and base CSS. **Any change to `src/views/grid.js` or `css/base.css` after the W2 gate goes back to one owner** (the P lane) and doesn't get made in parallel.

**What makes this safe (plan-review check #5).** Parallel lanes are only safe when the interfaces between them are fixed before work starts. These are the contracts. Changing one is a sequential step that touches every lane using it.
- **Clue:** `{n, c}` (run length, palette index ≥1). `lineClues(line: number[]) → Clue[]`. An empty line gives `[]`. `puzzleClues(solution) → {rows: Clue[][], cols: Clue[][]}`.
- **Solver:** `solve({width, height, rows: Clue[][], cols: Clue[][]}, {budget}) → {status, sweeps, grid, unresolved: [r, c][], differing: [r, c][]}`. In the returned grid, `null` means unresolved, `0` empty and `k` filled. `status` is one of the values in step 4a. `budget` counts search nodes, not milliseconds, so results are deterministic in tests. `unresolved` lists the cells the line solver couldn't decide. When `status` is `multiple`, `differing` lists the cells that differ between the two solutions found, and that's what the creator highlights. Otherwise it's `[]`. The UI calls the solver through `solver.worker.js` (a Web Worker with the same input and output) so it never blocks the page.
- **Image:** `cellLuminance(rgba, imgW, imgH, crop: {x, y, w, h}, cols, rows) → number[][]` (0 to 255). `otsu(values) → threshold`. `binarize(lum, t, invert) → number[][]` (0 or 1).
  - Luminance is 0.299R + 0.587G + 0.114B, with each pixel composited over white by its alpha, so transparent pixels count as background.
  - Cell (r, c) covers crop pixels in [x + floor(c·w/cols), x + floor((c+1)·w/cols)). A cell with no pixels samples the nearest pixel.
  - `otsu` returns the integer t in 1..255 that maximizes between-class variance, where class 0 is values < t. Ties go to the smallest t, and a single-class input returns 128.
  - `binarize`: lum < t means filled.
- **Format:** the puzzle, save and set records exactly as defined in D2, step 5 and step 12b. `puzzleId(puzzle) → Promise<string>`. The hash covers `set` when it's present (step 5 implements this, and step 12b only uses it).
- **Store:** the only module that touches `localStorage`. Keys are `nng:puzzle:<id>`, `nng:save:<puzzleId>` and `nng:set:<setId>`. Functions: `get(kind, id)`, `put(kind, record)`, `list(kind)` and `remove(kind, id)`, where kind is `puzzle`, `save` or `set`. Removing a puzzle also removes its save. `list` runs the `format.js` validators and skips invalid records, returning `{records, skipped}`, so one corrupt entry can't blank the library.
- **Strokes:** `applyStroke(cells, {button: 'left' | 'right', path: [r, c][]}, paint = 1) → cells`. Pure, with axis lock applied inside. Cell encoding as in step 5.
  - The axis is decided by the second distinct path cell. If it differs in both row and column, the larger delta wins, and a tie goes horizontal.
  - Later points are projected onto the locked line and clamped to the grid.
  - Cells between consecutive points are filled in, so fast mouse movement doesn't skip any.
  - `strokeCells(cells, stroke) → [r, c][]` gives the covered cells before the state filter. Step 7 uses it for the live stroke length. `paint` is the palette index a fill writes. It's always 1 in v1, and it gives color mode a slot.
- **Views:** each `src/views/*.js` exports `mount(el, params)` and `unmount()`. `app.js` owns routing.
- **Store factory:** `createStore(storage = localStorage)`, so tests can inject storage. A save is listed only when its puzzle exists and is valid.
- **Grid renderer:** `renderGrid(container, {width, height, clues, cells, onPointer})` returns `{update(cells), destroy()}`. `onPointer({type: 'down' | 'enter' | 'up', r, c, button})` gets null r and c outside the cells. `gutterSize(clues) → {top, left}`. The renderer never applies strokes itself; views wire `play-state.js`.
- **Tiles:** `tileGrid(rgba, imgW, imgH, crop, tileW, tileH, R, C, {threshold, invert}) → {full, tiles}` uses one global threshold. `makeSet({title, tiles, palette}) → Promise<{set, puzzles}>`, with a deterministic `setId` (a hash of title, rows, cols and the full grid). `tileFlags(tile) → 'blank' | 'full' | null`.
- **XML:** `toWebpbn(puzzle) → string`.
- **Store prefs** (added for 12s): `getPref(key, fallback)` and `setPref(key, value)` under `nng:pref:<key>`. They aren't records, have no validator, are never listed, and a corrupt value returns the fallback.
- **Difficulty** (orchestrator-owned, `src/difficulty.js`): `difficultyLabel(verdict) → 'Easy' | 'Medium' | 'Hard' | 'Not fair' | 'Unchecked'` (null verdict gives Unchecked) and `isFair(verdict)` (only `unique-*` statuses). It's shared by the creator report and the library.
- **Routes:** a `#/print/<id>` route was added to `app.js` on main, with a placeholder `src/views/print.js` the library lane replaces.

**Branching.** `tools/nonogram/` becomes its own local git repo in step 0.
- **`main` is always green.** Nothing lands on it without the full `npm test` and lint passing after the merge.
- **One branch per lane.** Each runs in its own git worktree under its own subagent. The worktrees are made by hand with `git worktree add ../nonogram-wt/<lane> -b lane/<lane>`, and each subagent is pointed at its own path. The Agent tool's built-in worktree isolation can't be used, because it branches the session's repo and `context-directory/` isn't one. Each worktree runs its own `npm ci`. Lane branches: `lane/a-core`, `lane/b-image`, `lane/c-format`, `lane/d-strokes`, `lane/p-player`, `lane/k-creator`, `lane/l-library`. The W2 gate and W4 run on `main` or on a short `step/<n>` branch.
- **Commits.** A lane commits per step, test first then code, inside its worktree. It only touches the files listed for it above.
- **Merging is the orchestrator's job.** Merges use `--no-ff`, one lane at a time, so a failure points at one lane. `npm test` runs after each merge, and a red merge gets reverted, not fixed on `main`.
- **Lanes merge per step, not per lane.** A step merges as soon as its tests pass, so dependents can start. Lane A merges step 1 (`clues.js`) right away, which unblocks the W2 gate and 5x without waiting on the solver. A lane that needs another lane's merged step runs `git merge main` in its worktree first. The "Depends on" column names steps, not whole lanes.
- **Contract changes** land on `main` first, in their own commit. Active lanes then merge `main` in before continuing.
- **Conflicts** should be rare because lanes own separate files. If one happens, the orchestrator resolves it, and it's a signal the ownership table needs fixing.
- **Commit messages:** what changed in the subject, why in the body. No AI co-author trailer.
- **Local only.** Pushing to GitHub isn't in scope unless you ask.

**Lane rules** (every lane prompt includes them):
- **Lane subagents run on Sonnet** (`model: "sonnet"`, which is Sonnet 5.5), at Jess's request on 2026-10-08. The orchestrator (Opus) merges, runs the manual checks and holds the contracts. **Upgrade rule:** if a Sonnet lane hits the two-failure stop, the orchestrator takes that step over on Opus. It doesn't relaunch Sonnet on the same step.
- Only touch the files your lane owns. If a contract seems wrong, stop and report back. Never edit a contract or another lane's file.
- **Two failed attempts at the same test means stop and report** what you tried and what happened. Don't keep trying variations.
- Logic is tested in Node. Lanes don't drive the browser pane.
- Paste the real `npm test` and `npm run lint` output in your final report.

**Manual checks.** These are the **[manual]** steps, run in the browser pane by the orchestrator (me), one at a time, on merged `main` after each lane merges. There's one pane, and parallel agents driving it would collide.

**Check-ins.** One line to you at each lane merge (what merged, test count, anything flagged), plus at each wave boundary. That replaces the "every 3 to 5 actions" cadence while lanes run in parallel.

### Phase 0. Setup
0. `[seq]` Node is installed (v24.20.0, verified 2026-10-08). Setup:
   - `git init` with a `main` branch and a `.gitignore` covering `node_modules/`.
   - A repo-local git identity: Jess Gray, with the noreply email.
   - A **`commit-msg` hook that rejects any `Co-Authored-By` trailer.** It lives in `.git/hooks`, which every worktree shares, so subagent commits are covered too.
   - `package.json` with **every script the lanes will need, defined up front**: `test`, `test:slow`, `lint`, `format:check`. Lanes never edit `package.json`.
   - ESLint (flat config with browser and Node globals) and Prettier. **ESLint bans `innerHTML`, `outerHTML` and `insertAdjacentHTML`** (`no-restricted-properties`). Titles come from imported files, so all text renders through `textContent`. This is a structural rule, not something to remember.
   - Test files go in `test/<module>.test.js`.
   - The serve entry `nonogram` in the session-root `ClaudeCodeWork/.claude/launch.json`: `python -m http.server 8123 --directory context-directory/tools/nonogram`.
   - `.gitattributes` forces LF line endings, so Windows CRLF doesn't churn diffs.
   - **Done 2026-10-08.** Smoke test passes. Lint and format checks are clean. The `innerHTML` ban was confirmed firing on a probe file. The hook rejected a probe commit that had the trailer.

   Tests: `smoke: test runner runs`. `hook rejects co-author trailer` is checked by hand once, with a throwaway commit.

### Phase 1. Core logic (pure, no DOM)
1. `[W1·A]` `clues.js`: line to clues, color-aware. Tests: `mono runs`, `empty line gives []`, `adjacent different-color runs are separate clues`, `same color runs split by gap`.
2. `[W1·B]` `image.js`: average a pixel array (RGBA) into a grid of cells, Otsu threshold, invert. Tests use synthetic arrays: `half-dark image splits at midline`, `otsu picks between two clusters`, `invert flips`, `non-divisible sizes cover every pixel`.
3. `[W1·A]` `solver.js` line solver. This is a **complete** line solver: for each line it considers every placement of the clue runs that fits the known cells, using left-to-right DP with memoization. A cell is decided when all valid placements agree on it. Repeat until nothing changes. "Line-solvable" means this process finishes the whole grid. Tests: `solves known line-solvable 10x10`, `2x2 diagonal stalls with 4 unknown`, `contradiction detected`, `reports sweep count`. Fixtures are hand-authored in the test files, with no third-party puzzles copied.
4a. `[W1·A]` `solver.js` uniqueness: when the line solver stalls, probe and backtrack, counting solutions up to 2. A search budget (node count) caps the work. Possible results: `unique-line-solvable`, `unique-needs-guessing`, `multiple`, `none`, or `unknown` when the budget is hit. The report also lists the cells still unresolved. **`unknown` is never shown as fair.** Tests:
   - One fixture per class. `multiple reports differing cells`.
4b. `[W1·A]` Solver verification and the worker wrapper. The worker is a thin shell over `solve`. It isn't unit-tested in Node, and gets checked **[manual]** in step 11b. Tests:
   - **Runtime rule:** the default `npm test` must stay under about 10s, since it runs on every merge. If either exhaustive 4x4 test pushes past that, it moves to `test:slow`, and the default suite keeps a seeded sample of 2,000 grids.
   - `exhaustive 4x4 cross-check`: enumerate all 65,536 4x4 grids and group them by clue signature to get the true solution count. Assert the solver's verdict (unique or multiple) matches for every grid.
   - `capped search reports unknown, never unique`.
   - `brute line oracle agrees on all 4x4`: a separate, naive line solver that enumerates every 2^n assignment of each line. It must give the same line-solvable verdict and the same decided cells as the DP solver. This is an independent check on "line-solvable", which the difficulty labels depend on.
   - `25x25 completes under 1s`, a performance guard at the largest size in scope, not 20x20. It runs on two fixtures:
     - a hand-made line-solvable 25x25
     - a seeded random-noise 25x25, the worst case, which has to hit the budget and return `unknown` inside 1s

     An easy fixture alone would pass without testing anything.
   - `npm run test:slow` (optional, not part of the green gate): an exhaustive 5x5 cross-check covering 33.5M grids.
5. `[W1·C]` `format.js`: puzzle JSON (D2). The id is the SHA-256 (`crypto.subtle`, available in both browser and Node) of canonical JSON `{width, height, palette hexes, solution, set}`, where `set` is included only when present. Truncated to 16 hex characters. The title is excluded. Save `cells` encoding: `0` unknown, `-1` crossed, `k>=1` filled with palette color k. `validatePuzzle(x)`, `validateSave(x, puzzle)` and `validateSet(x)` check shape, `v === 1`, grid dimensions and value ranges. They return `{ok, error}` and never throw. Tests: `json round-trip`, `validate rejects malformed and wrong-version records`, `id stable across title change`, `id excludes verdict`, `id changes when a cell changes`, `id includes set position`.

5x. `[W2·C]` `webpbn.js`: webpbn XML export. It was split out of step 5 because it needs `clues.js`, which lane C's worktree wouldn't have during W1. Test: `xml matches spec 2x2 example`.

### Checkpoint after W1
W1r. `[seq]` A short retro once W1 merges:
- Compare actual step times to the 10 to 15 minute estimate.
- Check real solver performance against the 25x25 guard.
- Did the lanes stay inside their contracts and stop rules?
- Any contract that needs to change before W2.

Update the plan before W2 starts. One line to you with the result.

**W1r result (2026-10-08).** W2 started per-step before the retro, since its dependencies were merged. The retro ran once the solver landed.
- **Step time.** Lanes took 0.5 to 4 minutes per step, against the 10 to 15 minute estimate. The estimate is far too high for agent lanes. Keep the step sizes anyway, since they drive diff readability, not time.
- **Solver performance.** Real-budget 25x25 random puzzles ran at most 327ms (budget 5000), well inside the 1s guard. The lane's own noise test uses budget 50, which is weaker than intended but covered by this probe.
- **Contracts.** All lanes stayed within their owned files, with no contract edits.
- **Lane rule breaches, 2:**
  - Lane B returned a placeholder report. The work was verified by hand, and every later prompt requires a real report.
  - Lane A made a third attempt at the same test after two failures, against the stop rule. The failure was in its fixture design, not the solver, and it was fixed by checking against brute force. Next prompts restate the rule more firmly.
- **Contract changes before W3:** `difficulty.js` and the print route were added on main.

### Phase 2. Player
6a. `[W2 gate]` App shell, a single `index.html` with hash routes `#/library`, `#/create` and `#/play/<id>`. Render the grid and clues, thick lines every 5, and a row/column highlight. The clue gutter is sized to the longest clue list. `store.js` per the Store contract. Tests: `layout: gutter fits max clue count`, `store round-trip per kind`, `removing a puzzle removes its save`, `list skips corrupt record` (pure, with an in-memory `localStorage` stub). **[manual]** 10x10 in the pane.
6b. `[W1·D]` Stroke logic in `play-state.js`. A stroke's mode comes from the button and the first cell:
   | Button | First cell | Action | Changes only cells that are |
   |---|---|---|---|
   | Left | unknown | fill | unknown |
   | Left | filled | clear | filled |
   | Left | crossed | nothing | n/a |
   | Right | unknown | cross | unknown |
   | Right | crossed | clear | crossed |
   | Right | filled | nothing | n/a |

   Crosses are protected from left strokes, and fills from right strokes. One stroke is one undo step.
   - The axis locks when the stroke enters its second distinct cell.
   - A stroke started outside the grid does nothing.
   Tests: one test per row of the table, plus `fill stroke skips crossed cells`, `stroke locks to axis` and `outside start is no-op`.
7. `[W3·P]` Clue cross-off, completion detection and reveal, undo and redo. **Solved means every row and column clue is satisfied**, so an alternate solution to a non-unique puzzle counts. Solving sets `solvedAt`. Auto-cross from step 9 is part of the stroke's undo step. Keyboard: Ctrl+Z undoes and Ctrl+Y or Ctrl+Shift+Z redoes. Moving a cursor around the grid by keyboard is out of v1. While dragging, a live count of the stroke's length shows next to the cursor. This is the inferred convention from Research. Tests: `satisfied clue flagged`, `solved detected`, `alternate solution counts as solved`, `undo/redo restores`, `stroke length reported during drag`. **[manual]**
8. `[W3·P]` Autosave to localStorage per puzzle id, plus save file export and import. The exported file **bundles the puzzle with the save**, so importing works on a browser that doesn't have the puzzle. Imports go through the `format.js` validators. Tests: `save serialize round-trip`, `import rejects save whose cells don't fit the puzzle`, `import rejects malformed file`, `import adds missing puzzle`. **[manual]** Reload keeps progress.
9. `[W3·P]` Rule toggles (check mistakes, reveal-cell hint), a timer, and optional auto-cross of completed lines. Check and hint compare against the stored solution, so they're disabled with a note when the puzzle's cached `verdict` isn't unique. The player never imports the solver. Tests: `check flags only wrong fills`, `hint reveals an unsolved cell`, `check disabled when not unique`. **[manual]** 25x25 legibility check, which may trigger a layout fix.

### Phase 3. Creator
10. `[W3·K]` Upload an image and preview the grid. Width and height are picked independently from {5, 10, 15, 20, 25} (Q6). The default size comes from `defaultSize(imgW, imgH)`, which picks the preset pair closest to the image's aspect. There's a center crop with a draggable offset, a threshold slider and an invert toggle. A one-line hint says simple, high-contrast images convert best. Images are downscaled on load to at most 1024px on the long side, so a phone photo doesn't stall `getImageData`. A file that won't decode shows an error, not a blank grid. Tests: `defaultSize picks closest aspect`, `crop stays inside image bounds`, `load scale caps long side at 1024` (pure). **[manual]** Uses your sample images (see Limits).
11a. `[W3·K]` Cell editor (paint and erase, using the step 6b stroke logic) and blank-grid drawing (D3). **[manual]**
11b. `[W3·K]` Live solver report: verdict, difficulty label, and highlighting. `differing` cells are highlighted when the result is `multiple`, and `unresolved` cells when it's `unique-needs-guessing`. The solver runs in the worker on edit, debounced, and a newer edit cancels a stale result. Test: `report updates after edit` (pure). **[manual]**
11c. `[W3·K]` "Save to library" from the creator. It computes the id and writes `verdict` from the latest report, then calls `store.put`. The creator owns saving. The library only lists, plays, deletes and backs up. Tests: `saved puzzle carries verdict`, `save waits for a fresh report` (no saving a stale verdict). **[manual]**
12. `[W3·L]` Library: list, play, delete, through `store.js`. **The source image is never stored, only the grid.** Each puzzle shows its size and difficulty label (from `verdict.sweeps`). Puzzles that aren't fair show a "not fair" badge. Each puzzle has an "Export webpbn XML" action (using step 5x). **Backup:** `backup.js` exports every puzzle, save and set as one JSON file and imports it back, skipping duplicate ids. `localStorage` is the only store, and clearing browser data would otherwise wipe everything. Tests: `library lists saved puzzles`, `library record has no image data`, `badge shown for non-unique verdict`, `difficulty label from verdict`, `backup round-trip restores all kinds`, `import skips existing ids`, `import reports and skips invalid records` (pure). **[manual]**
12p. `[W3·L]` Print view showing clues and an empty grid, with the answer key on page 2. **[manual]** Print preview at 10x10 and 25x25.

### Phase 4. Tiled sets (Q7)
12b. `[W2·B]` `tiles.js` turns the cropped image into one full grid of (R x tile height) by (C x tile width) cells, using `image.js` with **a single threshold over the whole image**, then slices that grid into R x C tiles. A threshold per tile would make visible seams in the finished mosaic. Each tile becomes a full puzzle. A set record `{v, setId, title, rows, cols, tileIds}` is stored separately from the puzzles. A tile puzzle carries `set: {id, row, col}`, and **that field is part of the id hash**. Otherwise two identical tiles (for example two blank skies) would share an id, and solving one would mark the other solved. Tests: `tiles reassemble to the full grid`, `identical tiles get distinct ids`, `set lists tile ids row-major`.
12c. `[W4]` Creator UI: an R x C picker (up to 4x4), a solver report for each tile (run through the worker, in sequence), and a flag on any tile that is all blank or all filled, since those make degenerate puzzles. "Save set" writes every tile puzzle (each with its `verdict`) and then the set record, using the 11c save path. Test: `set save writes tiles before set record` (pure), so a half-written set never points at missing tiles. **[manual]**
12d. `[W3·L]` The library groups each set into a mosaic view, where solved tiles show their picture and unsolved tiles stay blank. Clicking a tile plays it. Test: `set progress counts solved tiles`. **[manual]**

### Phase 5. Cozy styling (added 2026-10-08 at Jess's request)
12s. `[W5 seq]` Restyle every view in a cozy game aesthetic. It runs sequentially, after all views exist, because it touches every CSS file. Lanes do functional styling only until then.
- **Direction (rec, overridable via Q8):**
  - A warm, soft palette: cream paper background, cocoa-brown ink for fills, muted sage or terracotta accents.
  - Rounded corners and soft shadows on panels and buttons, with a subtle paper texture drawn in CSS gradients (no image files).
  - A friendly rounded font for headings, with a clean font kept for clues.
  - Small, gentle motion:
    - a fill "pop" on cells
    - clues that fade when satisfied
    - a short celebratory reveal on solve
  - All motion respects `prefers-reduced-motion`.
- **Guardrails:**
  - Legibility at 25x25 wins over decoration. Clue digits stay high-contrast.
  - Filled, empty and crossed cells must be distinguishable at a glance, and in print.
  - Colors are CSS custom properties on `:root`, so the theme is one block.
- Tests:
  - `theme contrast: clue text and fills meet 4.5:1 against background` (pure, a WCAG contrast ratio computed from the `src/theme.js` token values).
  - **[manual]** before/after screenshots of library, create, play (10x10 and 25x25), print preview, and the solved state.

**Q8 (CLOSED 2026-10-08).**
- **Font:** a system rounded font stack, with no network.
- **Themes:** a light "day" theme and a dark "evening" theme. The evening theme is deep blue-violet night with warm lantern-amber accents, not plain grey dark mode.
  - The default follows `prefers-color-scheme`.
  - A toggle in the nav overrides it, and the choice persists.
  - Persisting it adds a `pref` kind to `store.js` (`getPref` and `setPref`, with no validator needed). This is a contract change, made by the orchestrator at the start of 12s, because `store.js` is the only module that touches `localStorage`.
- **References:** Stardew Valley and Animal Crossing. Take the *feel*:
  - warm wood and cream tones, leafy greens, soft sky blues
  - chunky rounded UI panels, like wooden signs or rounded speech bubbles
  - gentle, bouncy motion

  **No copied assets, logos, fonts or character art.** Palette and shape language only.
- **Test added:** the `theme contrast` test runs on both themes.

### Close
13. `[seq]` Register in the toolkit. Run `/gate-review`. Calibrate the difficulty labels by playing about 5 puzzles you made.

---

## Backlog (post-v1, collected 2026-10-08 from lane reports and browser checks)

Each item has a trigger. Items marked **kill** are recorded only so they aren't re-raised.

**Color mode (all deferred to the trigger "color mode starts"):**
- Left-clear removes any filled color, not just the start cell's color (`play-state.js`). Decide the rule when color lands.
- `makeSet` shares one palette array across tiles, and `tileFlags` treats any non-zero cell as filled. Fine for monochrome.
- `toWebpbn` throws when a palette needs more than about 60 distinct characters.

**Solver:**
- Search always guesses the first unresolved cell. Revisit if a real 25x25 puzzle you make hits `unknown`.
- `solve` doesn't validate that clue counts match the dimensions. Callers always derive clues from a grid. Revisit if clues ever arrive from imports.

**Creator and player feel (revisit after you've played about 5 puzzles):**
- In the editor, clues update on stroke release, not during the drag.
- There's no way back to the source image after pressing "Blank grid".
- Opening an already-solved puzzle replays the solve glow once.
- The grid scrolls rather than shrinking on a narrow window. Desktop is the target (D4).

**Kill (harmless):**
- With reduced motion on, a stray `nng-pop` class can stay on a cell. The animation is off, so nothing shows.

**Unreproduced:**
- One stray filled row appeared during a browser session after a viewport resize. It wasn't reproducible from a fresh load. Watch for it in real play, and if it recurs, capture the steps.

## Limits of plan-only review

Five plan-review passes (2026-10-08) tightened the specs, contracts and dependency timing. Reviewing the plan can't settle the items below. Each one is named with the earliest point where real evidence shows up.

| Unknown | Why a plan can't settle it | Earliest real evidence |
|---|---|---|
| Solver performance at 25x25, and the node budget | Depends on the real implementation and real puzzles | Step 4b performance test (W1) |
| Whether step estimates hold (10 to 15 minutes) | No history yet for this stack and this lane setup | W1r retro |
| Whether subagents keep to contracts and stop rules | Agent behavior, untested in this setup | First W1 merges, then W1r |
| How strokes, 25x25 legibility and clue cross-off feel | Play feel can only be judged by playing | Manual checks in 6a and 7, the 25x25 check in step 9, and you playing at the end of W3 |
| Whether images convert into recognizable puzzles | Depends on real source images | Step 10. **Have 3 to 5 sample images ready by W3** (an icon, a silhouette, a photo) |
| Whether the difficulty thresholds match how hard puzzles feel | Only playing calibrates them | Step 13, about 5 puzzles played by you |

What isn't on this list (contract shapes, ownership, dependency order) was reviewed and is the plan's job. If execution turns up a problem in that category, it's a plan miss and gets logged in the review doc.

## Risks
- **Solver speed at 25x25 when backtracking.** Guarded by the step 4b performance test and the node budget. If it fails, lower the budget and report `unknown`. The worker keeps the UI responsive either way.
- **Subagent lanes drift from the contracts.** Every merge runs the full suite on `main`, and contract tests live with the module that owns the contract.
- **Photos rarely survive conversion at 10x10.** Expect icon-style source images to work best, and say so in the UI.
- **Difficulty labels are a heuristic until calibrated in step 13.**

## Decisions log
**2026-10-08. D1 to D5 closed, all recommendations.** Jess: "intended for web browser use."
- D1 Stack: static web app, plain JS ES modules, no runtime dependencies. Node is dev-only (tests, ESLint, Prettier). Served with `python -m http.server`. Rejected a Python plus JS split (two languages, solver written twice) and browser-only tests without Node (no lint, clunky). Reversing it means rewriting the core.
- D2 Data model: color-ready puzzle JSON (palette plus index grid, 0 is background). Clues are derived, not stored. Saves are separate, keyed by puzzle id. Rejected a boolean grid because every saved puzzle would need migrating once color lands.
- D3 Input: upload and touch up an image, or draw from blank, in the same editor.
- D4 Device: desktop browser first, up to 25x25. Touch comes later.
- D5 Default rules: Free. Check-mistakes and hint are toggles.
- Parallel execution (2026-10-08, at Jess's request): four waves, with one branch per lane in its own git worktree, merged `--no-ff` into an always-green `main`. Interface contracts are frozen in the Parallel lanes section. This overrides coding-preferences' "one thread, no subagents", which was written for time-boxed sessions, not this project. Rejected a single thread: W1 has four independent pure-logic lanes, and running them one after another wastes most of that.
- Q6 Grid shape: width and height are picked independently from {5, 10, 15, 20, 25}. The default is the closest match to the image's aspect, with a center crop and a draggable offset. Rejected square-only (Picross itself uses 25x20) and squashing (distorts the picture). Tiling was added on top (Q7).
- 2026-10-08: lane subagents use Sonnet (Jess). This is a cost and speed call for well-specified, contract-bound pieces. The orchestrator stays on Opus for merges, contract calls and manual verification.
- 2026-10-08: cozy game aesthetic added as step 12s (W5, sequential), at Jess's request. It comes after all views exist, so one owner touches every stylesheet instead of three lanes restyling in parallel. Q8 closed: system rounded font; light day theme plus a dark evening theme, following the system setting with a persisted toggle; Stardew Valley and Animal Crossing as feel references only, no copied assets. Rejected: a Google Font (network dependency for a local tool).
- Plan-review pass 6: XML export got a UI action in step 12. Set saving is owned by 12c. Validators were added in `format.js` and used by the store and every import. `innerHTML` is banned by lint. Images are downscaled on load.
- Plan-review pass 5: Q6's size picker and crop now land in step 10. `verdict` carries sweeps. Undo has keyboard shortcuts and the stroke length shows live. A test runtime rule was added. The W1r retro checkpoint and the Limits section were added.
- Plan-review pass 4: lanes merge per step, not per lane. XML export moved to 5x. `verdict` is cached on the puzzle. The creator owns saving. Library backup was added. Tiles use one global threshold.
- Plan-review pass 3: Node v24 is installed. `crypto.subtle` is global in Node 24 and available in the browser on `localhost` (a secure context), so the id hash works in both. Shells opened before the install need PATH refreshed before `node` resolves.
- Plan-review pass 2 calls, overridable:
  - Left-click on a crossed cell does nothing. You have to right-click to remove a cross.
  - Solved means every clue is satisfied, so an alternate solution counts.
  - A puzzle that isn't fair can still be saved, with a badge.
  Rejected: blocking unfair puzzles from saving, since you may want to keep a draft.
- Q7 Tiling: an R x C set of independent puzzles from one image. Each tile's id hash includes its set position, so identical tiles get distinct ids. Rejected paging one large puzzle (worse at 25x25 screen sizes, and a solver speed risk).
