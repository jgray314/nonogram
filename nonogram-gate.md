# Nonogram Studio: gate reviews

# Pass 1: adversarial + walkthrough, 2026-10-08

**Run:** 2026-10-08.
**Scope:** `main` at `e97b8a5`, which is the full v1 (steps 0 to 12s) before the gate. Fixes landed in `a38a332`, `bc3d580`, `efecb74` and `6fca7ac`.
**Prior runs:** none. The pre-build plan reviews are in `nonogram-plan-review.md`, and the reviewers did not see them, so both lenses ran cold.
**Reviewers:** two read-only Explore subagents on Sonnet, with no write access, each forming its findings independently. The orchestrator (Opus) reproduced the High before fixing it.

**Step 0, backlog prune.** The plan's deferred list (color mode, XML import, tablet touch) was written the same day, so nothing was stale. The real gap was that the "noticed but not fixed" items from lane reports were recorded nowhere. They are now collected in PLAN.md "Backlog (post-v1)", each with a trigger, a kill, or an unreproduced note.

## Lens 1: Adversarial

### HIGH
- **H1 (NEW). One imported record could make the library permanently unrenderable.** `validatePuzzle` didn't bound `set.row` or `set.col`. A record with `row: 100000` passed validation, and `groupSets` then allocated `rows*cols` and threw `RangeError` inside `library.mount`. The record stays in localStorage, so the library never loads until browser data is cleared. Reproduced by the reviewer.

### MEDIUM
- **M2 (NEW). Empty ids passed validation, then threw mid-import.** The library import loop had no error handling, so this caused a partial import with no message. Quota errors took the same path.
- **M3 (NEW). Imported ids were trusted, never checked against content.** A forged id could attach a save to the wrong puzzle, an id of `demo` loaded the built-in demo, and save import silently replaced existing progress.
- **M4 (NEW). A failed set save could delete progress.** The rollback removed every id it had written, including tiles that already existed (a re-saved identical set reuses the same ids), along with their saves.
- **L5, rated Low-Medium (NEW). Export said "Library exported." while silently leaving out corrupt records.**

### LOW
- **L6 (NEW).** A malformed `%` escape in the hash threw in the router and left a blank page.
- **L7 (NEW).** Async handlers can outlive their view. File import awaits in library, play and create can touch torn-down state after you navigate away mid-read.
- **L8 (NEW).** Control characters in a title produced invalid XML.
- **L9 (NEW, design).** Auto-cross treats a line as satisfied when your fills match its clues, even if they're in the wrong place. It then crosses the true cell too.
- **L10 (NEW).** The solver's color bitmask (`1 << c`) breaks at 31 or more colors, and 25x25 structured puzzles were not timed at the real budget.
- **L11 (NEW), minor:**
  - `e.key` can be undefined in the key handler.
  - Elapsed time isn't saved on tab close.
  - Duplicate ids within one backup file.
  - Download filenames can end in "." and don't avoid Windows reserved names.
  - Nothing warns when you leave Create with unsaved work.
  - A solved puzzle can't be reset.
  - Saving an identical grid overwrites the title.
  - A `__proto__` id in `groupSets`.

### Weak tests flagged
- The smoke test asserted `1 + 1 === 2`.
- "report updates after edit" doesn't test an edit.
- "save waits for a fresh report" only tests the `canSave` predicate.
- "25x25 completes under 1s" ran at budget 50 and accepted any status.
- The Otsu tie rule isn't pinned.
- There's no test of the stale-result race in `create.js`.

### Verified clean
- **Solver.** The reviewer ran independent brute-force oracles, stronger than the repo's own:
  - 4,000 random 3-color lines through `solveLine`: 0 mismatches.
  - Exhaustive 3x3 two-color grids (19,683) for unique vs multiple: 0 mismatches.
  - Edge cases checked: 1xN, empty clues, a clue longer than its line, contradictions, 0x0, `n:0`. Budget semantics hold, and `unknown` is never reported as unique.
- **Image, clues and tiles.** Cell boundaries, alpha compositing, threshold direction, `otsu` with a single class, crop clamping, and the single global threshold for tiles.
- **Format and storage.** The id canonicalization (fixed key order, lowercased hex, `set` only when present) is correct, and the validators never throw. `gridError` checks the row count before iterating, so an inflated declared width can't allocate. `store.list` skips corrupt records and orphan saves.
- **Security.** No `eval`, `new Function`, or innerHTML-family sinks. Imported text always goes through `textContent`. `href` values are literals, blob URLs, or encoded ids. Palette hex is regex-checked before reaching `fillStyle`.
- **Play and create.** Solve detection is clue-based. Undo can't pass the solved lock. Listeners are removed on unmount and destroy. In the creator, `reportRun` staleness is checked after every await, so a stale verdict can't be saved.

## Lens 2: Outside-reviewer walkthrough

- **W1 (NEW, High).** No README. The only run instructions were buried in PLAN.md step 0 and the owner's local tool index.
- **W2 (NEW, High).** PLAN.md reads as a future-tense spec and build log, not a record of what exists. The lane and branch machinery dominates it.
- **W3 (NEW, High).** A dev-only `#/play/demo` route shipped in the UI and bypassed the store.
- **W4 (NEW, High).** PLAN.md had uncommitted edits: the backlog section, which was in progress at review time.
- **W5 (NEW).** Q6 and step 10 described the default grid size as "closest preset pair to aspect". The code pins the long side to 15.
- **W6 (NEW).** The reviewer said the plan's "no co-author trailer" rule clashes with the session's attribution convention.
- **W7 (NEW).** Stale specifics: a hard-coded test count, and the budget-50 noise test described as if it hit the budget.
- **W8 (NEW).** The decisions log is out of order, and some entries are undated.
- **W9, W10, W11 (NEW).** Overclaiming test names, and a duplicate test name (`difficulty label from verdict` in two files). Overlaps Lens 1's weak tests.
- **W12 (NEW).** Duplicated `el()` helper in four views with two signatures, duplicated download code, and inconsistent CSS loading between views.
- **W13 (NEW).** Dead or test-only exports.
- **W14 (NEW).** The `difficulty.js` comment says "step 13" without naming PLAN.md.
- **W15 (NEW).** Leftover artifacts: the plan-review doc at the root, and the `../nonogram-wt/` worktrees.
- **W16, W17 (NEW, cosmetic).** Two color sources (base.css fallback and theme.js; a test pins them together). The `play-state.js` vs `game.js` split is unclear, and names mix `nng`, `nonogram-studio` and "Nonogram Studio".

## Disposition

| ID | Disposition |
|---|---|
| H1 | **Fixed** `a38a332`. `set.row` and `set.col` are bounded to 0 to 3, and set rows and cols to 1 to 4 (`MAX_SET_SIDE`). **Proof: mutation-verified guard.** Removing the row bound makes `validate bounds tile set position and set size (gate H1)` fail; restoring it passes. Records already in storage with a bad position are now skipped by `store.list` instead of crashing the library. **Shape sweep** (same unbounded-number defect class): width and height are now capped at 25, and palette length at 30, the solver bitmask limit. Fixed in `6fca7ac` with a test written first (red, then green). |
| M2 | **Fixed** `a38a332`. Empty `id` and `setId` are rejected (test red, then green), and the import loop now reports "Import stopped after N of M records". |
| M3 | **Fixed** `a38a332`. `idMatches` recomputes the hash (test red, then green). Library import skips forged puzzles and their saves. Save import rejects mismatches and asks before replacing progress. The `demo` spoof went with W3. |
| M4 | **Fixed** `bc3d580`. `rollbackTargets` spares records that existed before the save (test red, then green). |
| L5 | **Fixed** `a38a332`. Export reports how many corrupt records were left out. |
| L6 | **Fixed** `bc3d580`. A bad escape falls back to the library route. |
| L7 | **Deferred.** Trigger: any error report from navigating during an import, or the next time those handlers are touched. Fix shape: a per-mount generation token, checked after each await. Real but needs a mid-read navigation, and the worst case is a console error or a leaked listener, not data loss. |
| L8 | **Fixed** `bc3d580`. Control characters are dropped before escaping (test added). |
| L9 | **Noted only.** It matches how auto-cross works in other games: it reasons from the clues, not the answer. Auto-cross is off by default, and Check exists for this. |
| L10 | Bitmask part **fixed** by the palette cap in `6fca7ac`. 25x25 timing at the real budget is **fixed** in `efecb74` (nine seeded noise grids at `DEFAULT_BUDGET`, each under 1s). Structured worst cases stay under the "Limits" table item until real 25x25 puzzles exist. |
| L11 | `e.key` **fixed** in `6fca7ac`. The rest are **noted only**, since they're minor UX for a single-user tool. Elapsed-time-on-close and leave-Create-warning join the backlog's "after about 5 puzzles played" trigger. |
| Weak tests | Smoke test **deleted**. Three tests **renamed** to say what they assert (`efecb74`). Noise timing **replaced** with a real-budget test. The Otsu tie pin and the create stale-race test are **deferred**: the race is guarded in code (verified clean above), and testing it needs DOM wiring this repo doesn't unit-test. |
| W1 | **Fixed** `efecb74`. README added with what it is, how to run it, the routes, dev commands and doc pointers. |
| W2 | **Partly fixed.** The status line is now an as-built summary. Moving the lane machinery to an appendix is **deferred** until the next plan edit. It's an accurate record of how this was built, just long. |
| W3 | **Fixed** `bc3d580`. Demo route removed. Samples cover the use. |
| W4 | **Fixed** `efecb74` (the backlog committed). |
| W5 | **Fixed** `6fca7ac`. Q6 and step 10 now state the as-built rule. |
| W6 | **Rejected.** The owner's standing rule is no AI co-author trailer in their personal repos, and the commit hook enforces it. The session's default convention doesn't override the owner's instruction. |
| W7 | **Fixed** `6fca7ac` (no hard-coded count) and `efecb74` (the test now matches its description). |
| W8 | **Deferred** with W2, to the next plan edit. |
| W9 to W11 | **Fixed** `efecb74`. |
| W12 | **Deferred.** Trigger: the next change touching two or more views. Extract `src/views/dom.js`, a shared download helper, and one CSS-loading convention then. Duplication beats premature reuse until a change has to touch all copies. |
| W13 | **Noted only.** Most are test seams. Un-exporting would force tests through views. |
| W14 | **Fixed** `6fca7ac`. |
| W15 | Plan-review doc: **kept**, and the README now points to it. Worktrees: **pending the owner**. They're merged and safe to remove, but deleting needs the owner's OK. |
| W16, W17 | **Noted only.** The color drift is test-pinned, and the naming is cosmetic. |

**Close checks:**
- No open Critical or High.
- **Claim grep:** "demo" and "119 tests" appear nowhere in `src/`, README or PLAN status. The default-size claim was updated in both places it appears.
- **Checks:** `npm test` passes 125 of 125, and lint and format are clean.
- **CHANGELOG:** none to compact (this repo has none, by design).
- **Cross-session notes:** the owner's notes outside the repo list the open items.

## Retrospective

**Draft from the phase record.** Each lesson cites its evidence. These are awaiting the owner's lessons before being finalized.

1. **Lane reports can't be trusted as the record. The branch is.** Two of about 12 lane runs returned an empty or placeholder report (lane B step 2; creator steps 11b to 12c). Another broke the two-failure stop rule (lane A made a third attempt). Every merge was verified from `git log`, the diff, and a fresh `npm test`, and that caught nothing wrong. The verification habit is what made the reports' unreliability harmless.
2. **The hand checks in the browser found bugs no test could.** These were all found by running the merged app in the browser pane:
   - a blank tile that could never be solved
   - the hidden "Solved" banner showing as an empty pill
   - form controls staying unthemed in the evening theme
   - a cached placeholder view
3. **The plan reviews caught contract gaps but not size bounds.** Six plan passes added validators (pass 6). Every validator checked shape and none checked magnitude, and that's exactly where the gate's only High sat. A plan-review check for "every number that crosses a trust boundary has an upper bound" would have caught it before code existed.
4. **Step estimates were 3 to 20 times too high for agent lanes** (W1r: 0.5 to 4 minutes per step, against 10 to 15 estimated). Step size still earned its keep as a review unit.
5. **Test names written from the spec list overclaimed.** Three tests were named for the property in the prompt ("waits for a fresh report", "updates after edit") when only a helper was testable in Node. Lane prompts should say: if the property needs DOM or timing, name the test for what it actually asserts and flag the gap.
6. **Sonnet was enough for every contract-bound lane.** No step hit the upgrade-to-Opus rule. The solver, the hardest step, passed both of the reviewer's independent oracles.
7. **(Orchestrator working style.)** Shell heredocs mangled backslash escapes twice: once in a plan edit, once in the XML escape regex. Content heavy in escapes goes through the file editor or `chr()`, not the shell.

**Owner's lessons:** *pending. Ask what surprised them, what cost more time than it should have, what she'd change at the start next time, what should become standard, and where the process or the assistant got in the way.*

**Dispositions:** *pending, until the owner's lessons are in.*
