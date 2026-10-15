# Nonogram Studio — Plan

**Created:** 2026-10-08
**Status (2026-10-11):** v1 (steps 0 to 13), v1.1 (14a to 17) and v1.2 (19a to 22) are built and gated (passes 1 to 3). v1.3 (23a to 25, the UX pass 2 fixes, D20 size warning, D21 touch Fill/Cross) is merged and checked by hand on the mobile preset and at 1024x768; all UX checks pass. Run `npm test` for the current count. Gate pass 3 and its retrospective are closed. Difficulty labels come from solver personas (D22, 2026-10-09). Gate pass 4 (D22) is closed. **2026-10-11:** the owner's first hands-on round gave D23 (four labels from the personas, a size step, Easy samples, difficulty on the play page) and D24 (a finished set shows the combined photo; all-filled tiles start solved). Remaining: more hands-on feedback (step 13).
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
**(rec; the save record gained `hearts` and `rules.zen` in v1.1, see its Contracts)** Make it color-ready from day 1 even though v1 is monochrome. A puzzle is `{v: 1, id, title, width, height, palette: [{name, hex}], solution: number[][], verdict}`, where 0 is the background and 1..n index into the palette. Clues are derived from the solution, never stored. `verdict` is `{status, sweeps}` from the solver (plus an optional persona `tier` since D22), computed when the puzzle is saved, so the library can show both fairness and difficulty. It's cached, so the player never re-solves a 25x25 on load, and it's excluded from the id hash. A save is a separate record: `{puzzleId, cells, elapsedMs, rules, solvedAt}` (`solvedAt` is null until solved).
Alternative: a boolean grid now, migrating when color lands. That's cheaper today, but every saved puzzle would need migrating.

**D3. Where the picture comes from.**
1. **(rec)** Upload an image, convert it, then touch up cells in the editor.
2. Also allow drawing from a blank grid in the same editor. This costs almost nothing once the editor exists.
Recommend both. "Draw from blank" is the same editor started without an image.

**D4. Target device.**
1. **(rec)** Desktop browser first, using mouse and keyboard, right-click to cross, and up to 25x25. Tablet touch comes in a later pass.
2. Tablet or phone first. That makes 25x25 unrealistic and leans hard on the fill/cross toggle.

**D5. Default rule set when playing.**
1. **(rec, reversed in v1.1 by D7: hearts are now the default, and this behavior is Zen mode)** Free rules by default: no mistake feedback, purest play. Toggles for "check mistakes" and "hint: reveal a cell". A puzzle you made yourself is spoiled for you anyway, so the toggles mostly matter for other people's or older puzzles.
2. Normal (Picross-style) by default.

**Q6. Grid shape and image aspect (CLOSED 2026-10-08: option 1, plus tiling, see Q7).** Should the grid be square only, or allow independent width and height (Picross uses 25x20)? And when the image's aspect ratio doesn't match the grid, what happens?
1. **(rec)** Width and height are picked independently from {5, 10, 15, 20, 25}. The default is the preset closest to the image's aspect. *As built:* the long side is 15 and the short side snaps to the nearest preset, with ties going to the larger one. A mismatched image gets center-cropped, with a crop offset you can drag.
2. Square only, with center crop.
3. Independent width and height, with the image squashed to fit (distorts the picture).

**Q7. Tiling (CLOSED 2026-10-08).** One image is split into an R x C set of independent puzzles. Solving every tile reveals the whole picture, like "Clip Picross" in Picross S. Rejected: one large puzzle shown in pages.

**My calls unless you object:**
- **Grayscale conversion.** Average the brightness per cell. Default threshold from Otsu's method, with a slider and an invert toggle. Rejected "any dark pixel fills the cell" because it's too noisy.
- **Difficulty label. (Superseded 2026-10-09 by D22: labels now come from solver personas, not sweep counts.)** The original call, kept for history: Easy if line-solvable in 3 or fewer sweeps of the line solver, Medium if more, Hard if unique but needing probing, Not fair for more than one solution or `unknown`, with thresholds to calibrate in step 13.
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
| 0 | n/a | 0 setup | none | `package.json` (all scripts), lint/format config, `.git/hooks/commit-msg`, a local serve config outside the repo |
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
- **Solver:** `solve({width, height, rows: Clue[][], cols: Clue[][]}, {budget}) → {status, sweeps, grid, unresolved: [r, c][], differing: [r, c][]}`. In the returned grid, `null` means unresolved, `0` empty and `k` filled. `status` is one of the values in step 4a. `budget` counts search nodes, not milliseconds, so results are deterministic in tests. `unresolved` lists the cells the line solver couldn't decide. When `status` is `multiple`, `differing` lists the cells that differ between the two solutions found, and that's what the creator highlights. Otherwise it's `[]`. The UI calls the solver through `solver.worker.js` (a Web Worker with the same input and output, plus the persona `tier` since D22) so it never blocks the page.
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
- **Difficulty** (orchestrator-owned, `src/difficulty.js`): `difficultyLabel(verdict, size?) → 'Easy' | 'Medium' | 'Hard' | 'Very hard' | 'Not fair' | 'Unchecked'` (null verdict gives Unchecked; the label comes from the verdict's persona `tier`, D22; `size` = `{width, height}` applies D23's size step) and `isFair(verdict)` (only `unique-*` statuses). It's shared by the creator report, the library and the play header (`puzzleLabel` / `puzzleMeta` in `library-logic.js`).
- **Routes:** a `#/print/<id>` route was added to `app.js` on main, with a placeholder `src/views/print.js` the library lane replaces.

**Branching.** `tools/nonogram/` becomes its own local git repo in step 0.
- **`main` is always green.** Nothing lands on it without the full `npm test` and lint passing after the merge.
- **One branch per lane.** Each runs in its own git worktree under its own subagent. The worktrees are made by hand with `git worktree add ../nonogram-wt/<lane> -b lane/<lane>`, and each subagent is pointed at its own path. The Agent tool's built-in worktree isolation can't be used, because it branches the session's repo, which isn't this one. Each worktree runs its own `npm ci`. Lane branches: `lane/a-core`, `lane/b-image`, `lane/c-format`, `lane/d-strokes`, `lane/p-player`, `lane/k-creator`, `lane/l-library`. The W2 gate and W4 run on `main` or on a short `step/<n>` branch.
- **Commits.** A lane commits per step, test first then code, inside its worktree. It only touches the files listed for it above.
- **Merging is the orchestrator's job.** Merges use `--no-ff`, one lane at a time, so a failure points at one lane. `npm test` runs after each merge, and a red merge gets reverted, not fixed on `main`.
- **Lanes merge per step, not per lane.** A step merges as soon as its tests pass, so dependents can start. Lane A merges step 1 (`clues.js`) right away, which unblocks the W2 gate and 5x without waiting on the solver. A lane that needs another lane's merged step runs `git merge main` in its worktree first. The "Depends on" column names steps, not whole lanes.
- **Contract changes** land on `main` first, in their own commit. Active lanes then merge `main` in before continuing.
- **Conflicts** should be rare because lanes own separate files. If one happens, the orchestrator resolves it, and it's a signal the ownership table needs fixing.
- **Commit messages:** what changed in the subject, why in the body. No AI co-author trailer.
- **Local only.** Pushing to GitHub isn't in scope unless you ask.

**Lane rules** (every lane prompt includes them):
- **Lane subagents run on Sonnet** (`model: "sonnet"`, which is Sonnet 5.5), at the owner's request on 2026-10-08. The orchestrator (Opus) merges, runs the manual checks and holds the contracts. **Upgrade rule:** if a Sonnet lane hits the two-failure stop, the orchestrator takes that step over on Opus. It doesn't relaunch Sonnet on the same step.
- Only touch the files your lane owns. If a contract seems wrong, stop and report back. Never edit a contract or another lane's file.
- **Two failed attempts at the same test means stop and report** what you tried and what happened. Don't keep trying variations.
- Logic is tested in Node. Lanes don't drive the browser pane.
- Paste the real `npm test` and `npm run lint` output in your final report.

**Manual checks.** These are the **[manual]** steps, run in the browser pane by the orchestrator (me), one at a time, on merged `main` after each lane merges. There's one pane, and parallel agents driving it would collide.

**Check-ins.** One line to you at each lane merge (what merged, test count, anything flagged), plus at each wave boundary. That replaces the "every 3 to 5 actions" cadence while lanes run in parallel.

### Phase 0. Setup
0. `[seq]` Node is installed (v24.20.0, verified 2026-10-08). Setup:
   - `git init` with a `main` branch and a `.gitignore` covering `node_modules/`.
   - A repo-local git identity: the owner's name, with their GitHub noreply email.
   - A **`commit-msg` hook that rejects any `Co-Authored-By` trailer.** It lives in `.git/hooks`, which every worktree shares, so subagent commits are covered too.
   - `package.json` with **every script the lanes will need, defined up front**: `test`, `test:slow`, `lint`, `format:check`. Lanes never edit `package.json`.
   - ESLint (flat config with browser and Node globals) and Prettier. **ESLint bans `innerHTML`, `outerHTML` and `insertAdjacentHTML`** (`no-restricted-properties`). Titles come from imported files, so all text renders through `textContent`. This is a structural rule, not something to remember.
   - Test files go in `test/<module>.test.js`.
   - A local serve entry outside the repo: `python -m http.server 8123`, run from the repo root.
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
10. `[W3·K]` Upload an image and preview the grid. Width and height are picked independently from {5, 10, 15, 20, 25} (Q6). The default size comes from `defaultSize(imgW, imgH)`, which sets the long side to 15 and snaps the short side to the nearest preset, with ties going to the larger one. There's a center crop with a draggable offset, a threshold slider and an invert toggle. A one-line hint says simple, high-contrast images convert best. Images are downscaled on load to at most 1024px on the long side, so a phone photo doesn't stall `getImageData`. A file that won't decode shows an error, not a blank grid. Tests: `defaultSize picks closest aspect`, `crop stays inside image bounds`, `load scale caps long side at 1024` (pure). **[manual]** Uses your sample images (see Limits).
11a. `[W3·K]` Cell editor (paint and erase, using the step 6b stroke logic) and blank-grid drawing (D3). **[manual]**
11b. `[W3·K]` Live solver report: verdict, difficulty label, and highlighting. `differing` cells are highlighted when the result is `multiple`, and `unresolved` cells when it's `unique-needs-guessing`. The solver runs in the worker on edit, debounced, and a newer edit cancels a stale result. Test: `report updates after edit` (pure). **[manual]**
11c. `[W3·K]` "Save to library" from the creator. It computes the id and writes `verdict` from the latest report, then calls `store.put`. The creator owns saving. The library only lists, plays, deletes and backs up. Tests: `saved puzzle carries verdict`, `save waits for a fresh report` (no saving a stale verdict). **[manual]**
12. `[W3·L]` Library: list, play, delete, through `store.js`. **The source image is never stored, only the grid.** *(Reversed in v1.2 by D14: a bounded crop is stored as `art` for the solve reveal. The test below became `only art holds image data, and it is bounded`.)* Each puzzle shows its size and difficulty label (from `verdict.sweeps`; since D22, from the persona `tier`). Puzzles that aren't fair show a "not fair" badge. Each puzzle has an "Export webpbn XML" action (using step 5x). **Backup:** `backup.js` exports every puzzle, save and set as one JSON file and imports it back, skipping duplicate ids. `localStorage` is the only store, and clearing browser data would otherwise wipe everything. Tests: `library lists saved puzzles`, `library record has no image data`, `badge shown for non-unique verdict`, `difficulty label from verdict`, `backup round-trip restores all kinds`, `import skips existing ids`, `import reports and skips invalid records` (pure). **[manual]**
12p. `[W3·L]` Print view showing clues and an empty grid, with the answer key on page 2. **[manual]** Print preview at 10x10 and 25x25.

### Phase 4. Tiled sets (Q7)
12b. `[W2·B]` `tiles.js` turns the cropped image into one full grid of (R x tile height) by (C x tile width) cells, using `image.js` with **a single threshold over the whole image**, then slices that grid into R x C tiles. A threshold per tile would make visible seams in the finished mosaic. Each tile becomes a full puzzle. A set record `{v, setId, title, rows, cols, tileIds}` is stored separately from the puzzles. A tile puzzle carries `set: {id, row, col}`, and **that field is part of the id hash**. Otherwise two identical tiles (for example two blank skies) would share an id, and solving one would mark the other solved. Tests: `tiles reassemble to the full grid`, `identical tiles get distinct ids`, `set lists tile ids row-major`.
12c. `[W4]` Creator UI: an R x C picker (up to 4x4), a solver report for each tile (run through the worker, in sequence), and a flag on any tile that is all blank or all filled, since those make degenerate puzzles. "Save set" writes every tile puzzle (each with its `verdict`) and then the set record, using the 11c save path. Test: `set save writes tiles before set record` (pure), so a half-written set never points at missing tiles. **[manual]**
12d. `[W3·L]` The library groups each set into a mosaic view, where solved tiles show their picture and unsolved tiles stay blank. Clicking a tile plays it. Test: `set progress counts solved tiles`. **[manual]**

### Phase 5. Cozy styling (added 2026-10-08 at the owner's request)
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
13. `[seq]` Register in the owner's local tool index. Run `/gate-review`. Calibrate the difficulty labels by playing about 5 puzzles you made. *(Widened 2026-10-09 by the owner: hands-on use gives broad feedback on the whole tool, not only the difficulty labels. The labels' check is one part of it.)*

---

## v1.1: play feedback (from the owner's testing, 2026-10-08)

**Decisions (owner, 2026-10-08):** D6 restart. D7 hearts on by default, 3 of them, only a wrong fill costs one, a wrong cross is ignored, 0 hearts means restart, and the heart-free mode is called **Zen mode**. D8 a clue number is done only when its block is closed in at the right position, as most apps do it. D9 the answer key on the print page starts hidden, and one switch controls whether it prints. D10 empty rows and columns are crossed at the start, always. Reasoning and rejected options are in the Decisions log.

**Sizing:** steps are review units (one test-first commit each), per the owner's 2026-10-08 sizing rule. No hour estimates.

### Contracts (frozen before lanes start)

- **Save record, extended.** `{puzzleId, cells, elapsedMs, rules, solvedAt, hearts?}`. `rules.zen` is a boolean (missing means `false`). `hearts` is an integer from 0 to `MAX_HEARTS`; a missing value means `MAX_HEARTS`, so every v1 save stays valid. `validateSave` rejects a non-integer, a negative, or anything above `MAX_HEARTS`, and a non-boolean `rules.zen`. Upper bound per plan-review check 9.
- **`game.js` additions (lane H owns):**
  - `MAX_HEARTS = 3`.
  - `crossEmptyLines(cells, clues)` returns a new grid with every unknown cell in a line whose clue list is empty set to `-1`. Other cells are unchanged.
  - `heartsStroke(cells, stroke, solution)` returns `{next, wrong}`. The stroke's mode comes from `applyStroke` exactly as in v1: compute `full = applyStroke(cells, stroke)`, then walk `strokeCells(cells, stroke)` in order, keeping only cells where `full` differs from `cells`. Each such cell is applied in turn. A cell that becomes filled where the solution is empty is not applied: it becomes `-1` instead, `wrong` is `[r, c]`, and the walk stops there. Cells applied before it stay. Strokes that only cross or clear never cost a heart, and `wrong` is `null`. Monochrome only: a fill of the wrong color is out of scope until color mode.
  - `heartsAvailable(verdict)` is `isFair(verdict)`. Hearts need the stored solution to be the only one.
  - `restartCells(clues, width, height)` returns `crossEmptyLines` of a blank grid. Restart and a fresh game both start from it.
- **`clue-progress.js` (new, lane N owns):** `clueProgress(cells, clues)` returns `{rows: boolean[][], cols: boolean[][]}`, one flag per clue number. Rule per line:
  - If the whole line is satisfied (`lineSatisfied`), every number is done.
  - Otherwise, scan from the start. Skip crossed cells. Stop at the first unknown cell. A filled run counts only if it's closed: bounded by the line edge or a crossed cell on both sides. A closed run that matches the next clue in length (and color) marks that clue done and the scan continues. Anything else stops the scan.
  - Then do the same from the end, matching clues from the last one backwards. The end scan only sees the cells the start scan didn't consume, so no run and no clue is matched twice. (Corrected at gate pass 2: the original "stop at a clue the start scan marked" let one run mark two numbers.)
- **`grid.js` (lane N owns):** add `setClueDone({rows, cols})`, which takes the per-number flags and toggles `nng-clue-done` on each clue node. Lane N **keeps** `setSatisfied` so `play.js` still works between merges. Step 17 swaps the call in `play.js` and then removes `setSatisfied`.
- **Hearts are not part of undo.** Undo and redo move cells only. A heart lost stays lost, and the corrected cross is an ordinary cell that undo can step back past.

### Lanes (one wave, three lanes)

| Lane | Steps | Owns files |
|---|---|---|
| H, hearts and restart | 14a, 14b, 14c | `src/game.js`, `src/format.js`, `src/views/play.js`, `css/play.css`, their tests |
| N, per-number clues | 15a, 15b | `src/clue-progress.js`, `src/views/grid.js`, their tests |
| P, print | 16 | `src/views/print.js`, `css/print.css` |

Lane rules from v1 apply unchanged: stop after 2 failures, never edit a contract or another lane's file, paste real test output. Merges follow the same order, with the orchestrator wiring `setClueDone` into `play.js` after both H and N merge.

### Steps

14a. `[H]` Pure logic in `game.js` per the contract. Tests: `crossEmptyLines crosses only empty-clue lines`, `crossEmptyLines keeps marked cells`, `heartsStroke stops at the first wrong fill`, `heartsStroke keeps cells applied before the mistake`, `heartsStroke ignores wrong crosses`, `heartsStroke clear stroke costs nothing`, `heartsAvailable needs a unique verdict`, `heartsStroke follows the v1 stroke mode` (a left stroke starting on a filled cell clears, and costs nothing), `restartCells is blank plus empty-line crosses`.
14b. `[H]` `validateSave` per the extended save contract. Tests: `v1 save without hearts is valid`, `hearts above MAX_HEARTS rejected`, `negative or fractional hearts rejected`, `non-boolean zen rejected`.
14c. `[H]` Play view.
   - Hearts show as 3 heart icons next to the timer, filled or empty.
   - A **Zen mode** switch replaces nothing else: in Zen mode the v1 behavior is unchanged (Check mistakes, Hints, Auto-cross). With Zen off, a fill stroke goes through `heartsStroke`, a wrong cell is shown with a red cross until the next move, and Check mistakes is hidden since mistakes are corrected as they happen.
   - On a puzzle that isn't fair, Zen mode is forced on, with the note "Hearts, mistake marks and hints need a puzzle with a unique solution." (Wording after D13.) (Changed at step 17 from "Hearts need…", which sat next to the separate check-and-hint note.)
   - At 0 hearts the grid locks, the timer stops, and an "Out of hearts" panel offers only **Restart**. Every switch is disabled while out of hearts. A save with `hearts: 0` reopens in this state.
   - The red cross on a wrong cell lives in memory only. It isn't saved and clears on the next move.
   - Hints work in both modes and never cost a heart.
   - A **Restart** button (with a confirm) sets cells to `restartCells`, the timer to 0, `solvedAt` to null, hearts to `MAX_HEARTS`, and starts a new undo history. Rules are kept. It works on a solved puzzle too, since replay is the point. The out-of-hearts panel's own Restart skips the confirm, since the game is already lost (built that way, accepted at step 17).
   - On open, cells go through `crossEmptyLines` before the undo history starts, so those crosses aren't an undo step. This covers v1 saves too. It doesn't mark the save dirty on its own.
   - Tests: `restartCells is blank plus empty-line crosses` goes in 14a, since it's pure. The view wiring has no Node test: it's checked by hand. **[manual]** Lose all 3 hearts on a sample; reload while out of hearts; restart; switch Zen on and off; reload mid-game and check hearts persist; restart a solved puzzle.
15a. `[N]` `clueProgress` per the contract. Tests: `closed run at the start marks the first number`, `run touching an unknown cell is not done`, `scan from the end marks the last number`, `wrong-length closed run stops the scan`, `satisfied line marks every number`, `empty clue line has no numbers`.
15b. `[N]` `grid.js` `setClueDone` per the contract. No Node test: it only toggles classes on DOM nodes, and a shape-only test would claim more than it checks (gate lesson 5). **[manual]** after the orchestrator's wiring: numbers grey out one by one while solving.
16. `[P]` Print page. A "Include answer key" switch, off at first, sits in the print controls. Off: the key isn't shown or printed. On: it shows and prints on page 2, as in v1. **[manual]** Print preview both ways.
17. `[seq]` Orchestrator: wire `setClueDone` into `play.js`, remove `setSatisfied` from `grid.js` (and its doc comment), run the full suite, do the manual checks on merged `main`, then a slim `/gate-review` scoped to the v1.1 commits.

**Done 2026-10-08.** Lanes merged `--no-ff`: P `ab99949` (16), N `02fbe84` (15a, 15b), H `84c7a73` (14a to 14c), then step 17 `f6266fd`. Full suite green after each merge. Manual checks on merged `main` in the browser pane:
- Cat 10x10: a correct fill is free, a wrong fill becomes a red cross and costs a heart, a wrong cross is free, undo steps the cross back and the heart stays lost, a hint costs nothing.
- At 0 hearts the grid locks, every switch is disabled and the timer stops. All three hold after a reload. The panel's Restart gives 3 hearts, 00:00 and a clean grid.
- Zen on hides the hearts and shows Check mistakes. Single clue numbers grey out (the first "1" of "1 1" once fenced by a cross).
- Spider: its empty bottom row starts crossed. Checker test (not fair): Zen is forced on and hearts are hidden. Heart (solved): Restart is enabled.
- Print: the key is hidden at first, and shows and hides with the switch. The owner's real print preview was done on v1.
- Not yet seen: the light theme for the hearts, the out-of-hearts panel and the red cross.

---

## v1.2: UX pass 1 fixes (2026-10-08)

**Source:** `docs/reviews/nonogram-ux-review.md` UX pass 1. **Owner's calls:** "1, 2a, 3, 4a, 6, minors as recommended. On 5 when complete fade to original image crop including original color palette. Back to library strip below the image appears once fade is complete." So UX1, UX2 (keep the draft), UX3, UX4 (continue in Zen), UX6, UX7 to UX15 as recommended (option 1 each), and UX5 replaced by the solve reveal (D14). Later the same day: "1, add a hint counter per puzzle, do polish items too if they are easy, go", so D14 option 1, D18, and UX16 polish joined. Not in scope: UX17 taste, and UX5's status strip and sticky header.

**Done means:** each finding's KNOWN UX check in `test/ux/checks.js` flips to passing and loses its flag, plus new checks where noted. Node tests cover the pure helpers. Steps are review units per the 2026-10-08 sizing rule.

### Decisions

- **D14 (approved by the owner, "1", 2026-10-08): store a small copy of the source crop.** The reveal needs the original image, and v1 deliberately stored none (plan review #4, the test `library record has no image data`, "the source image is never stored"). Recommended: an optional `art` field on the puzzle record, a JPEG data URL of the crop scaled to at most 320px on the long side (about 15 to 40KB), saved by Create with the puzzle and never sent anywhere. It is excluded from the id hash, like `verdict`. Puzzles with no art (blank-grid puzzles, samples, everything made before v1.2) skip the fade, and the strip appears at once.
- **D15 UX9 vs the AI-label rule.** The reviewer recommended plain sample names, but the owner's rule is that AI-made samples say so. Resolved: the library shows the name ("Cat (10x10)") with a small "AI test sample" badge, rendered from the stored title prefix. The record and its exports keep the full title, so the label still travels with the puzzle. No schema change.
- **D16 UX11 rule defaults.** The Zen and Auto-cross switches change this puzzle and also become the default for puzzles you haven't started yet (prefs `play.zen`, `play.autoCross`). A line under the switches says so. D12 still applies: on a started puzzle, leaving Zen restarts it.
- **D17 UX10 hints.** The Hints switch is removed. "Reveal a cell" is always available on puzzles with a unique solution. It reveals a cell that should be filled, in the line that has the fewest unknown cells left, and never an empty cell.
- **D18 hint counter per puzzle (owner, with the D14 answer: "add a hint counter per puzzle").** The save counts the reveals used on this play-through. Each Reveal adds one, undo doesn't refund it (same as hearts), and every restart sets it to 0 (the Restart button, the out-of-hearts Restart, and leaving Zen). Continue in Zen keeps it. The play view shows "Hints used: N" beside the Reveal button, and the solve strip adds it ("Solved in 03:12 · 2 hints", nothing added at 0). Not shown in the library for now. Rejected: a lifetime total across replays (a replay is a fresh attempt).
- **Polish (owner, "do polish items too if they are easy").** UX16's items join the lanes: an empty line shows a "0" clue (P), the hover crosshair is off on a solved or locked grid (P), the theme switch stops flashing and "Theme: auto" names what it resolved to (L), the file input is styled in both themes (C). The double Restart is already 20b. UX17 is taste and stays out.

### Contracts (frozen before lanes start)

- **Puzzle record `art?` (D14).** A string that starts with `data:image/jpeg;base64,` (`ART_PREFIX`), at most `MAX_ART_CHARS` = 200,000 characters (check 9). `validatePuzzle` rejects anything else. Not part of `puzzleId`. The test `library record has no image data` becomes `only art holds image data, and it is bounded`. **Landed before the lanes.**
- **Save `hints?` (D18).** An integer from 0 to the puzzle's `width * height` (check 9: each hint reveals a different cell). Missing means 0. **Landed before the lanes.**
- **`game.js` (lane P):** `solvedSummary(elapsedMs, hints)` returns `"Solved in mm:ss"`, plus `" · 1 hint"` or `" · N hints"` when hints is above 0.
- **`create-logic.js` (lane C):** `defaultSize(imgW, imgH)` returns the image's own size when both sides are in `SIZES` (pixel-art sources). Otherwise it's unchanged. `titleFromFile(name)` turns `my-cat_2.png` into `my cat 2` (extension dropped, `-` and `_` become spaces, trimmed, at most 60 characters). An empty result gives `Untitled`.
- **`library-logic.js` (lane L):** the progress values are `'solved' | 'in progress' | 'not started'` ('new' is renamed). A save whose cells equal `restartCells` for that puzzle, with `elapsedMs < 1000` and `solvedAt` null, is `'not started'`. The order is in progress, then not started, then solved, with titles A to Z within each group (case-insensitive, ignoring the AI-sample prefix). `sampleLabel(title)` returns `{name, ai}`.
- **`game.js` (lane P):** `hintCell(cells, solution)` follows D17. The cell with value 1 is from the row or column with the fewest unknown cells that still has an unfilled solution cell; ties go to the first row, then column. It returns `null` when every solution cell is filled.
- **Prefs (lane P):** `play.zen` and `play.autoCross`, read through `store.getPref` and written through `setPref` only. Anything other than `true` counts as false, so a hand-edited pref can't break play. *(Since D19, `play.autoCross` is the other way round: on unless it is a literal `false`.)*
- **`grid.js` (lane P):** `setOverlay(node | null)` places one node over exactly the cell area (spanning the cell rows and columns of the CSS grid, above the cells), or removes it. Create and print don't call it, so their behavior is unchanged.
- **UX checks:** lanes can't run `ux-checks.html` (the server serves `main`), so lanes verify with Node tests and describe their DOM hooks in the report. The orchestrator flips the KNOWN flags and adds the new checks in step 22, after merging.
- **CSS ownership:** lane L owns `css/base.css` (the nav). Lane P sizes the play grid by setting `--cell` on the play grid holder from `play.js`, and doesn't edit `base.css`.

### Lanes (one wave, three lanes)

| Lane | Steps | Owns files |
|---|---|---|
| C, Create | 19a to 19g | `src/views/create.js`, `src/create-logic.js`, `css/create.css`, their tests |
| P, Play | 20a to 20h | `src/views/play.js`, `src/game.js`, `src/views/grid.js`, `css/play.css`, their tests |
| L, Library and shell | 21a to 21e | `src/views/library.js`, `src/library-logic.js`, `src/theme.js`, `css/library.css`, `css/base.css`, `index.html`, their tests |
| Orchestrator | 22 | `src/format.js` (the `art` and `hints` fields, landed before the lanes), `test/ux/checks.js`, docs |

v1 lane rules apply.

### Steps

19a. `[C]` UX1. The blank grid sizes to its cells: no flex shrink, and a minimum cell size. With nothing loaded, a line says "Drop an image above, or start from a blank grid." UX check `create-blank-grid-usable` flips.
19b. `[C]` UX12. `defaultSize` native sizes, `titleFromFile` prefills the title, and the report and Save stay disabled until at least one cell is filled. Tests: `defaultSize keeps a preset-sized source`, `titleFromFile cleans a file name`, `titleFromFile falls back to Untitled`. UX check `create-no-save-when-empty` flips.
19c. `[C]` UX13. Undo and redo for hand edits in Create (`createHistory`, Ctrl+Z / Ctrl+Y, plus Undo and Redo buttons, matching 20a). A regenerate (threshold, size, invert) starts a new history. New UX check `create-undo`.
19d. `[C]` UX2a. The Create draft (source image, crop, settings, cells, history) lives in memory at module level and is restored when you come back to Create. It's cleared after a successful save, or by a "Start over" button. A `beforeunload` warning fires while there are unsaved edits, since a reload loses the in-memory draft. UX check `create-leave-warns` is rewritten as `create-draft-survives-navigation` (edit, go to Library, come back, and the edit is still there).
19e. `[C]` Accessibility: each Tiles dropdown gets its own label ("Tile rows", "Tile columns"). UX check `a11y-create-inputs-labelled` flips.
19f. `[C]` D14. On save, capture the crop at most 320px on the long side as JPEG quality 0.8 into `art`. Each tile in a set gets its own slice. **[manual]** Save, reload, and confirm the record carries art.
19g. `[C]` Polish. The file input is styled to match the theme's buttons, in day and evening. **[manual]** both themes.
20a. `[P]` UX3. Undo and Redo buttons, disabled when there's nothing to undo or redo, labelled with their shortcuts. A one-line legend under the grid: "Left-drag to fill · Right-drag to cross · Ctrl+Z to undo". UX checks `play-undo-visible` and `play-controls-legend` flip.
20b. `[P]` UX4a. The out-of-hearts panel says "Restart clears the grid, timer and hearts." and offers **Restart** and **Continue in Zen mode**, which keeps the cells, turns Zen on and unlocks. The rules-bar Restart hides while the panel shows, so only one shows. New UX check `play-continue-in-zen`.
20c. `[P]` D14 solve reveal. On solve, if the puzzle has `art`, an image of it is placed over the cell area through `grid.setOverlay` and fades in over about 1.2s while the cells fade out. With reduced motion, it swaps at once. Once the fade ends, a strip below the image shows "Solved in mm:ss" and a **Back to library** link. With no art, the strip shows at once. Reopening a solved puzzle shows the image and strip without the fade. UX5's `play-solved-next-step` check is rewritten as `play-solved-strip` (the library link appears after solving).
20d. `[P]` D17. Remove the Hints switch, make Reveal always available on fair puzzles, and use the new `hintCell`. Tests: `hintCell reveals a filled cell`, `hintCell picks the line with fewest unknowns`, `hintCell returns null when all fills are done`. UX check `play-no-hint-gate` flips.
20e. `[P]` D16. Defaults come from prefs when there is no save. A switch change writes the pref, and a line explains it. Test: none in Node (view wiring). New UX check `play-rule-defaults`: tick Zen on one puzzle, and an unstarted puzzle opens in Zen.
20f. `[P]` UX15. The play grid's `--cell` is computed from the space left in the window: the largest size from 16 to 32px that fits the grid and its clue gutters in the viewport height under the header and the width of the main column. It's recomputed on resize. The clue gutters stay in view while the grid scrolls at narrow widths (sticky row and column clues). New UX check `play-25x25-fits-desktop` (Cat 25x25's last row is visible without page scroll at 1024x768).
20g. `[P]` D18 hint counter. Each Reveal adds 1 to `hints` in the save, restarts set it to 0, Continue in Zen keeps it, undo doesn't refund it. "Hints used: N" beside the Reveal button, and the solve strip text comes from `solvedSummary`. Tests: `solvedSummary formats time`, `solvedSummary adds the hint count` (0, 1 and 2 hints). New UX check `play-hint-counter` (reveal twice, the counter reads 2; restart, it reads 0).
20h. `[P]` Polish. An empty line shows a "0" clue, styled as done (`gutterSize` counts it as depth 1; it has no flag in the progress arrays). The hover crosshair doesn't show on a solved or locked grid. Test: `empty line gets a zero clue gutter`. **[manual]** hover after solving.
21a. `[L]` UX14 and UX9 status. `not started` per the contract. Tests: `restarted grid with only auto-crosses is not started`, `progress label is not started, not new`. UX check `library-restart-reads-new` flips (renamed `library-restart-reads-not-started`).
21b. `[L]` UX7. Order per the contract. Test: `library orders in progress, not started, solved, then by title`.
21c. `[L]` UX8 and UX9 row. **Play** is the one primary button. A "More" menu (`<details>`, no script needed) holds Print, "Export for other solvers (webpbn)" and **Delete**, styled as danger and confirming with the puzzle's name. One fairness label per row. Sample rows show the name plus an "AI test sample" badge (D15). Test: `sampleLabel splits the AI prefix`. New UX check `library-delete-is-tucked-away`.
21d. `[L]` UX6. The nav wraps at narrow widths, so the Theme button stays on screen. UX check `narrow-nav-fits` flips.
21e. `[L]` Polish. The theme switch no longer flashes (no color transition while a theme is being applied), and the auto label names what it resolved to: "Theme: auto (evening)". Test: `auto theme label names the resolved theme`. **[manual]** switch themes and watch for a flash.
22. `[seq]` Orchestrator. The `art` and `hints` contracts in `format.js` first (done before the lanes), then merges, flipping the KNOWN flags, the full UX check run (all pass, none KNOWN except the out-of-scope items), the manual reveal check in both themes, a slim `/gate-review` and a `/ux-gate-review` pass 2 on the result.

**Done 2026-10-09.** Prep `05796c4` (the `art` and `hints` contracts). Lanes merged `--no-ff`: L `3c48608`, C `b98b755`, P `990db9f` (P's agent hit a usage limit after committing all 8 steps; verified from the branch). Step 22 checks `e10193a` (33 pass, 0 known). The solve reveal was checked by hand in evening and day, including reopening. Gate pass 3 (`docs/reviews/nonogram-gate.md`) found 1 High and 3 Medium; fixes and D19 landed on branch `gate3-fixes`, and the UX checks went to 35 pass. UX pass 2 is in `docs/reviews/nonogram-ux-review.md`, with its new findings waiting on the owner.

---

## v1.3: UX pass 2 fixes (2026-10-09)

**Source:** `docs/reviews/nonogram-ux-review.md` UX pass 2. **Owner's calls:** "do ux18, ux19 undo is fine, ux20 update message, ux21 do it, ux22 do it but add warning to puzzles unlikely to render well due to size, ux23 give cross and fill selectors for mobile, ux24 do it, do polish, explain ux28". So UX18 option 1, UX19 accepted as is, UX20 option 2 (copy), UX21, UX22 option 1 plus a size warning (D20), UX23 a Fill/Cross selector (D21), UX24, UX25 to UX27. UX28 is explained to the owner, not changed.

### Decisions
- **D20 size warning.** A puzzle is "large for this screen" when Play's fitted cell size hits its 16px floor and the grid still doesn't fit the holder. Play then shows a note above the grid: "This puzzle is big for this screen, so the grid scrolls. It's easiest on a wider window." In the library, below 600px wide, a row whose width or height is 20 or more shows a small "Best on a big screen" badge. Rejected: blocking large puzzles on small screens.
- **D21 touch input.** On a coarse pointer (`matchMedia('(pointer: coarse)')`), Play shows a **Fill / Cross** selector next to Undo. A touch or pen stroke uses the selected mode as its button; the mouse is unchanged (left fills, right crosses). Touch drags follow the finger (`pointermove` with `elementFromPoint`, after releasing the implicit pointer capture), and cells get `touch-action: none` so a drag on the cells doesn't scroll the page; the grid still scrolls by dragging the clue gutters. On a coarse pointer the legend reads "Choose Fill or Cross, then tap or drag". Create stays mouse-only for now. Rejected: long-press to cross (slow, and fights the browser's own long-press).
- **UX18 duplicate grid.** Puzzle ids are a hash of the grid, so the same grid is the same puzzle. Saving one that already exists writes nothing and says: "This grid is already in your library as '<title>'." with an **Open it** link and the draft kept. Tile sets are unchanged (a tile's id includes its set id, so a new set can't collide).

### Contracts (frozen before lanes start)
- **`game.js` (lane P):** `restartPrompt(zen)` returns the Restart confirm text. Hearts: "Restart this puzzle? The grid, timer, hearts and hints reset. This can't be undone." Zen: "Restart this puzzle? The grid, timer and hints reset, and Zen mode stays on. This can't be undone."
- **`grid.js` (lane P):** `renderGrid` takes `touchButton: () => 'left' | 'right'` (optional; default `'left'`), used for touch and pen pointers only. It also renders one corner node (`nng-grid-corner`) spanning the gutter rows and columns, which play.css pins above both gutters.
- **`create-logic.js` (lane C):** `existingPuzzle(store, id)` returns the stored puzzle's title, or `null`.
- **`library-logic.js` (lane C):** `largePuzzle(puzzle)` is true when width or height is 20 or more. `rowModel` gains `large`.
- **`library-logic.js` `sampleLabel`** is imported by Play for UX27; lane P doesn't edit it.

### Lanes
| Lane | Steps | Owns files |
|---|---|---|
| P, Play | 23a to 23f | `src/views/play.js`, `src/game.js`, `src/views/grid.js`, `css/play.css`, their tests |
| C, Create and library | 24a to 24e | `src/views/create.js`, `src/create-logic.js`, `css/create.css`, `src/views/library.js`, `src/library-logic.js`, `css/library.css`, their tests |
| Orchestrator | 25 | `test/ux/checks.js`, docs |

### Steps
23a. `[P]` UX20. Restart's confirm uses `restartPrompt`. Test: `restartPrompt says what resets in each mode`.
23b. `[P]` UX22. Opaque gutter and corner backgrounds; every row clue sticky to the left at its slot, every column clue sticky to the top, the corner pinned above both. **[manual]** Cat 25x25 at 375, scrolled right and down.
23c. `[P]` D20 in Play: the size note. Test: none in Node (layout).
23d. `[P]` D21. The Fill / Cross selector, touch strokes, the coarse-pointer legend. Test: none in Node (input wiring). **[manual]** mobile preset: fill, cross, drag a line of each.
23e. `[P]` UX25 and UX27. "Solved" becomes a flat badge, not a button-like pill. The Play header shows `sampleLabel(title).name` plus the "AI test sample" badge styled as in the library.
23f. `[P]` UX28 (owner, after the explanation: "move save buttons below the grid"). Export save and Import save, with their message line, move below the grid and the legend, styled lighter than Restart. Texts and behavior unchanged. The solved strip still lands on screen for Cat 25x25 at 1024x768.
24a. `[C]` UX18 per the decision. Test: `existingPuzzle finds a stored grid by id`. **[manual]** save the banana image at 10x10 over the sample: the sample keeps its title.
24b. `[C]` UX24. Create uses the same page padding as Library and Play, and below 600px wide its cell size fits the grid to the width (minimum 12px; larger grids scroll).
24c. `[C]` UX25 and UX26. Create's "Difficulty: …" becomes a flat badge, and is hidden until something is filled. The empty line reads "Choose an image above, or draw on the grid below." "Blank grid" is shown only while an image is loaded, renamed "Clear to blank".
24d. `[C]` UX21. Below 600px the More panel aligns to its button's left edge and stays inside the screen.
24e. `[C]` D20 in the library: `largePuzzle`, and the "Best on a big screen" badge below 600px. Test: `largePuzzle is 20 or more on a side`.
**Done 2026-10-09.** Lanes merged `--no-ff`: C `d309064`, P `b2987f0`; step 25 `141cc0f`. UX checks 40 pass, 0 known; 188 Node tests. Manual checks on the mobile preset and at 1024x768 found two layout bugs the lanes couldn't see, both fixed in `141cc0f`: the sticky offset counted the holder padding twice (clues showed through at 375), and the first grid measurement ran before the layout settled (the size note showed on a 25x25 that fits). The legend and the save buttons now share one row, so 23f costs no height. Touch strokes checked with simulated touch: a Cross drag across three cells, a Fill tap.

25. `[seq]` Orchestrator: merges, new UX checks (`create-save-duplicate-keeps-title`, `play-restart-message-zen`, `narrow-more-menu-on-screen`, `create-grid-fits-375`, `play-header-sample-badge`), manual checks at 375 (UX22, D21), docs.

---

## Backlog (post-v1, collected 2026-10-08 from lane reports and browser checks)

Each item has a trigger. Items marked **kill** are recorded only so they aren't re-raised.

**Color mode (re-sorted at gate pass 6, 2026-10-14, once color research started):**
- Left-clear rule and color-aware personas are now owner decisions 8 and 5 in `docs/color-research.md`, settled before the color build plan.
- `makeSet` shares one palette array across tiles, and `tileFlags` treats any non-zero cell as filled. Fine for monochrome. Trigger: the color build plan.
- **Kill:** `toWebpbn` throwing past about 60 distinct characters. Unreachable: `MAX_PALETTE` is 30 and the export has 61 fallback characters.

**Trust (gate pass 2, L1):**
- **Done (merged `a9ff17f`).** Hearts, mistake marks and hints trusted an imported puzzle's `verdict`, so a hand-edited verdict could switch hearts on for a puzzle with several solutions. Library backup import and Import save now discard the verdict and re-solve each written puzzle with the solver worker (`rateImports`, `ratePlan`; the client is `src/solver-client.js`).

**Solver:**
- Search always guesses the first unresolved cell. Revisit if a real 25x25 puzzle you make hits `unknown`.
- `solve` doesn't validate that clue counts match the dimensions. Callers always derive clues from a grid. Revisit if clues ever arrive from imports.

**Creator and player feel:**
- **Kill (gate pass 6):** clues updating on stroke release, no way back to the source after "Clear to blank", the solve glow replaying on reopen, the play grid scrolling below 16px, and gate pass 1 L11's elapsed time on close and leave-Create warning. Their trigger was "after about 5 puzzles played"; three hands-on rounds later, none came up.
- A set 4 tiles wide (4 x 96px) is wider than a phone screen in the library, whether finished or not (noticed 2026-10-11, D24). Trigger: you play sets on the phone.
- D24's finished-set view is covered by unit tests on `tileFace` and `setProgress`, not by a UX check. Trigger: the set view changes again.

**Trust (gate pass 3, L2), accepted for a personal tool:**
- **Done (merged `a9ff17f`).** `validatePuzzle` lets unknown extra keys through, and the store kept them. Both import paths now apply `pickKnown`, which keeps only `PUZZLE_KEYS`, `SAVE_KEYS` and `SET_KEYS`. `validatePuzzle` itself is unchanged, so stored records still load.
- **Done (merged `a9ff17f`).** The `art` bound counted characters, not decoded pixels. `jpegSize` (in `format.js`) now reads the JPEG frame header, and imports drop `art` that isn't a parseable JPEG or has a side over `MAX_ART_SIDE` (320). The puzzle stays, without its picture reveal.
- A 4x4 tile set can store 16 art strings, about 3.2M characters at worst, near the storage quota. Typical art is a few KB, and a failed save rolls back the whole set. Trigger: a quota error on save.

**Owner's hands-on testing, 2026-10-08:** reset, hearts, per-number clues, print key hidden, and crossing empty lines at the start shipped as v1.1 (steps 14a to 17). Print preview itself worked as planned, so step 13's print check is done.

**Kill (harmless):**
- With reduced motion on, a stray `nng-pop` class can stay on a cell. The animation is off, so nothing shows.
- (Gate pass 6) One stray filled row seen once after a viewport resize on 2026-10-08. Never reproduced, and it didn't recur in three hands-on rounds.

## Limits of plan-only review

Five plan-review passes (2026-10-08) tightened the specs, contracts and dependency timing. Reviewing the plan can't settle the items below. Each one is named with the earliest point where real evidence shows up.

| Unknown | Why a plan can't settle it | Earliest real evidence |
|---|---|---|
| Solver performance at 25x25, and the node budget | Depends on the real implementation and real puzzles | Step 4b performance test (W1) |
| Whether step estimates hold (10 to 15 minutes) | No history yet for this stack and this lane setup | W1r retro |
| Whether subagents keep to contracts and stop rules | Agent behavior, untested in this setup | First W1 merges, then W1r |
| How strokes, 25x25 legibility and clue cross-off feel | Play feel can only be judged by playing | Manual checks in 6a and 7, the 25x25 check in step 9, and you playing at the end of W3 |
| Whether images convert into recognizable puzzles | Depends on real source images | Step 10. **Have 3 to 5 sample images ready by W3** (an icon, a silhouette, a photo) |
| Whether the difficulty labels (D22's personas) match how hard puzzles feel | Only playing calibrates them | Step 13, in rounds of hands-on play (round 1 gave D23) |

What isn't on this list (contract shapes, ownership, dependency order) was reviewed and is the plan's job. If execution turns up a problem in that category, it's a plan miss and gets logged in the review doc.

## Risks
- **Solver speed at 25x25 when backtracking.** Guarded by the step 4b performance test and the node budget. If it fails, lower the budget and report `unknown`. The worker keeps the UI responsive either way.
- **Subagent lanes drift from the contracts.** Every merge runs the full suite on `main`, and contract tests live with the module that owns the contract.
- **Photos rarely survive conversion at 10x10.** Expect icon-style source images to work best, and say so in the UI.
- **Difficulty labels are a heuristic until calibrated in step 13.** Since D22 they come from modeled personas, which play may show don't match real people. The first round of play (D23) changed the mapping, not the personas. The Casual technique set is the likeliest to move.

## Decisions log
**2026-10-11. D24 finished sets and all-filled tiles.** Owner: "For a titled set, show full combined photo if all puzzles have been solved. Also treat the trivial case of all filled as trivially solved the same way you do for all empty." A set whose every tile is solved shows "✓ complete" and draws each tile's stored crop (`art`) flush, with no gaps and tiles at their own aspect, so the mosaic reads as the source photo. A tile without a crop (a set made before v1.2 or from a blank grid) keeps its solution cells. An all-filled puzzle starts filled (`fillFullPuzzle` in `restartCells` and on load), so it is solved on open, like an all-blank one. In the set view, tiles that start solved also count as solved without being opened (`tileSolved`, display only, no save written); otherwise a set with a blank sky tile could never complete until the player opened it. "Starts solved" is one rule, shared with Play (`startsSolved`: the starting grid already satisfies the clues), so a multi-color tile with no blank cells but two runs in a row doesn't count (gate pass 5, M1). A save that ran out of hearts is not filled on reopen, so a loss stays a loss (L2). A single puzzle that starts solved still shows "not started" in the library until opened; only set tiles count unopened, because only a set waits on them (L4). Rejected: pre-filling every full-width line in ordinary puzzles, which would give away real (if easy) moves; only the whole-grid case was asked for.

**2026-10-11. D23 labels after the first play round.** Owner: Easy and Medium "feel relatively correct for a first pass", but "hard should be very hard and the current easy / medium split should become a 3 way split"; "I would expect most 5x5s to be easy and most 20x20s and 25x25 puzzles to be hard"; chose the size step ("A, no bump for very hard"); and "also list the puzzle difficulty in the page with the puzzle itself". Now: Newcomer is Easy, Casual Medium, Regular Hard, Expert and nobody both Very hard (the tier keeps them apart). A grid 20 or more on its longer side steps Easy and Medium up one, at display time, the same threshold as D20. Without it only about half of picture-like 20x20 and 25x25 grids read Hard; with it 27 of 39 and 34 of 36 do (`npm run test:slow`). Two Newcomer samples (Plus 5x5, Castle 10x10) were added, because no sample was Easy under the new mapping. The play header shows "W x H · label" inline next to the title, so the header doesn't grow and the grid's fit is unchanged. A needs-guessing puzzle without a stored tier now reads Very hard, which also closes gate pass 4's L2 mismatch. Rejected: splitting the Regular tier by solver effort (a new threshold to tune; revisit if the persona split feels wrong in play); a fifth label for "nobody" (about 1 in 400 fair puzzles). Touchpad fill/cross surprises were traced to Windows right-click gestures; the owner chose no change.

**2026-10-09. D22 difficulty by persona.** (Label mapping and the no-tier "Hard" fallback superseded by D23.) Owner: "create a 3-5 simple player personas and use them to level set initial difficulty ratings", then "make the changes". Four personas (Newcomer, Casual, Regular, Expert) are solvers limited to certain techniques (`src/personas.js`, `difficulty-personas.md`). The label is the least skilled persona who finishes: Newcomer or Casual is Easy, Regular is Medium, Expert (one-cell trials) is Hard, and nobody (deeper guessing) is Very hard. The verdict stores the result as an optional `tier`, computed in the solver worker. Line-solvable puzzles saved earlier get a tier for display only, never written back. A needs-guessing one without a tier keeps "Hard". The verdict isn't hashed, so ids don't change. Rejected: retuning the sweep threshold. Over 394 fair puzzles, the full line solver's sweep count didn't separate Casual from Regular (Casual puzzles take at most 3 sweeps, and Regular ones a median of 3), so the old rule called almost everything Easy. The corpus is reproducible with `npm run test:slow`. Step 13's play now tests the personas instead of setting thresholds from scratch.
**2026-10-08. D1 to D5 closed, all recommendations.** Owner: "intended for web browser use."
- D1 Stack: static web app, plain JS ES modules, no runtime dependencies. Node is dev-only (tests, ESLint, Prettier). Served with `python -m http.server`. Rejected a Python plus JS split (two languages, solver written twice) and browser-only tests without Node (no lint, clunky). Reversing it means rewriting the core.
- D2 Data model: color-ready puzzle JSON (palette plus index grid, 0 is background). Clues are derived, not stored. Saves are separate, keyed by puzzle id. Rejected a boolean grid because every saved puzzle would need migrating once color lands.
- D3 Input: upload and touch up an image, or draw from blank, in the same editor.
- D4 Device: desktop browser first, up to 25x25. Touch comes later.
- D5 Default rules: Free. Check-mistakes and hint are toggles.
- Parallel execution (2026-10-08, at the owner's request): four waves, with one branch per lane in its own git worktree, merged `--no-ff` into an always-green `main`. Interface contracts are frozen in the Parallel lanes section. This overrides the owner's usual "one thread, no subagents" default, which was written for time-boxed sessions, not this project. Rejected a single thread: W1 has four independent pure-logic lanes, and running them one after another wastes most of that.
- Q6 Grid shape: width and height are picked independently from {5, 10, 15, 20, 25}. The default is the closest match to the image's aspect, with a center crop and a draggable offset. Rejected square-only (Picross itself uses 25x20) and squashing (distorts the picture). Tiling was added on top (Q7).
- 2026-10-08: lane subagents use Sonnet (owner's call). This is a cost and speed call for well-specified, contract-bound pieces. The orchestrator stays on Opus for merges, contract calls and manual verification.
- 2026-10-08: cozy game aesthetic added as step 12s (W5, sequential), at the owner's request. It comes after all views exist, so one owner touches every stylesheet instead of three lanes restyling in parallel. Q8 closed: system rounded font; light day theme plus a dark evening theme, following the system setting with a persisted toggle; Stardew Valley and Animal Crossing as feel references only, no copied assets. Rejected: a Google Font (network dependency for a local tool).
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

**2026-10-08. v1.1 decisions D6 to D10, from the owner's hands-on testing.** Owner: "1; 2a start with 3, only on wrong fill, ignore wrong cross, restart, name heart free version zen mode; 3 only when right like most aps, 4;5".
- D6 Restart with a confirm, not undoable. Rejected: an undoable reset (a second history concept for one button).
- D7 Hearts by default on fair puzzles, 3 hearts, wrong fill only, hard restart at 0, heart-free mode named Zen mode. This **reverses v1 decision 1** (free rules by default): the owner's hands-on testing asked for mistake feedback by default, and Zen mode keeps the v1 behavior one switch away. Wrong crosses are free because a cross is a note to yourself, not a claim. Rejected: hearts as an opt-in mode; costing hearts for wrong crosses; a "keep playing" option at 0. Old saves count as hearts mode with full hearts, which is the simplest valid default; a v1 game in progress gains hearts it can lose, which is acceptable for a personal tool.
- D8 Per-number completion only for closed runs at the matching position from either edge. Rejected: any complete run of the right length (misleading). **Changed for hearts mode by D11.**
- D9 Answer key hidden by default, one switch for screen and print. Rejected: two separate print buttons.
- D10 Empty lines crossed at the start, always, as part of the starting grid (not an undo step). The owner answered "5" without picking a variant; the recommended "always" was taken. Rejected: only with auto-cross on.
- Samples: all samples, including the original three (which the library lane drew during the v1 build), are titled "AI test sample:" per the owner's no-AI-content rule. Owner: "label as ai generated for testing and put in library".

**2026-10-08. D11 and D12, after hands-on play and gate pass 2.**
- D11 Clue numbers in hearts mode cross out as soon as their block is complete, with no fence of crosses needed. Owner: "cross out a number once completed. don't require the cap." Done means every cell of that number's block in the solution is filled (`solutionProgress`). Hearts mode already corrects wrong fills as they happen, so this gives nothing away. Zen mode and puzzles without a unique solution keep D8's fenced rule, since going by the solution there would reveal which fills are right. Rejected: a length-only match without the solution (a 2 would cross out while you're still drawing a 3).
- D12 Zen mode can be switched on at any time. Switching back to hearts restarts the puzzle, with a confirm unless nothing has been played yet. This closes gate pass 2's L3 (using Zen to dodge a heart, then switching back). Owner: "Do your recommendation for zen mode." Rejected: free switching both ways (the dodge), and changing mode only through Restart (too strict for someone who just wants to relax mid-puzzle).
- D13 Zen mode marks a wrong fill at the square, the same red cross as hearts mode, with no wider consequence: no heart lost, no lock. Owner: "zen should give the square level error when a wrong fill occurs, but have no wider consequence". This removes v1's Check mistakes switch, which only mattered when wrong fills could stay on the board. Because fills are now checked in both modes, D11's complete-block rule applies in Zen too. D8's fenced rule is left only for puzzles without a unique solution, which have no answer to check against. D12 still holds: risky fills in Zen are free, so switching back to hearts still restarts. Rejected: keeping Check mistakes as an option (nothing left for it to show).

**2026-10-08. v1.2 decisions D14 to D18, from UX pass 1.** Full text in the v1.2 section's Decisions.
- D14 Store a bounded source crop (`art`) for the solve reveal. Owner: "1". This **reverses v1's "the source image is never stored"**: the reveal the owner asked for can't exist without it. Bounded to 200,000 characters, never in the id hash, never sent anywhere. Rejected: no storage with a strip only (owner picked the fade).
- D15 to D17 as in the v1.2 section (sample badge, rule defaults, hint without a switch).
- D18 Hint counter per play-through, reset by every restart. Owner: "add a hint counter per puzzle". Rejected: a lifetime total. Corrected at gate pass 3: the `w * h` bound in the save is a sanity cap, not a true maximum, since reveal, undo, reveal counts twice.

**2026-10-09. Gate pass 3 calls.**
- H1 The play timer starts with the first click on the grid (or a first hint), not on open or restart. Owner: "start timer with first click". So a puzzle you only opened, or restarted and looked at, stays "not started". Rejected: comparing cells only in the library (the timer would still show time that was never played).
- D19 Auto-cross is on by default, and its crosses sweep in along the line. Owner: "when all fill is done for a row or column quickly add in the applied xs when you cross out the final number in the key". In hearts and Zen mode the last number crosses out exactly when the line's fills are complete, which is when auto-cross fires. The switch stays, and turning it off is remembered as the default (D16). Saves made before this keep their own setting. Rejected: removing the switch (some players like to cross by hand).
- Everything else in gate pass 3: the reviewers' recommendations, per the owner ("rest clean up per your recommendation"). The dispositions are in `docs/reviews/nonogram-gate.md`.
