# Plan: end-to-end pipeline checks

Goal: browser UX checks that drive the paths crossing the most module boundaries, with nothing seeded: image upload, `image.js`/`color.js`, the Create view, the solver worker, save, backup export and import, and webpbn export. Today the UX checks seed puzzles with a stored `verdict` and never touch these paths.

Runs as part of `npm run test:ux`. This plan is independent of the view-split plan (`view-split.md`); neither depends on the other.

## Waves

Lane A is split in two: A0 holds everything the other lanes depend on and carries no checks; A1 is the first check. After A0 merges, A1, B, C and D are independent.

### Wave 0: foundation (one lane, A0, merges first)

Owns `test/ux/harness.js` additions, the color fixture, and no checks. Deliverables:

- `uploadImage(app, url)`: fetch `url` (same origin), wrap it in a `File`, set it on the Create file input through a `DataTransfer`, fire `change`. Resolves when the preview has rendered.
- `createAndSave(app, url)`: `uploadImage`, wait for the worker's verdict in the report, press Save, return the saved puzzle id. C and D use it to get a puzzle without seeding one.
- `captureDownload(app, fn)`: stub `URL.createObjectURL` and the anchor click inside the app frame, run `fn`, resolve `{ name, blob, text() }` for the file the app tried to download.
- `pickFile(app, inputSelector, blob, name)`: set a file on any input in the frame and fire `change`, for import.
- `resetStore(app)`: clear `nng:` keys in the frame's storage.
- One synthetic color PNG (a few flat regions, 3 to 5 distinct inks), in `test/ux/`.
- The registration line in `test/ux/checks.js` (`...PIPELINE_CHECKS`, imported from `test/ux/pipeline-*.js`), with empty arrays or absent files guarded, so later lanes never edit the `CHECKS` array itself.

Done when: each helper has a smoke use in a throwaway check (deleted before merge), `npm run test:ux` still passes, lint and typecheck are clean.

Wave 0 is sequential and small. Its signatures are frozen before it starts, so Wave 1 lanes can be briefed and begin writing at the same time; they cannot run for real until A0 merges.

### Wave 1: checks (four parallel lanes, no dependencies between them)

| Lane | Owns | Uses from A0 | Done when |
|---|---|---|---|
| A1. Mono pipeline | `test/ux/pipeline-mono.js` | `createAndSave` | Upload cat-15x15, worker verdict appears in the report, save, puzzle in the library with the worker's verdict |
| B. Color pipeline | `test/ux/pipeline-color.js` | `uploadImage`, the color PNG | 3 to 5 inks, blank color set, Color badge in the library |
| C. Backup round trip | `test/ux/pipeline-backup.js` | `createAndSave`, `captureDownload`, `pickFile`, `resetStore`, the color PNG | Mono and color puzzles: export, clear, import; ids match; verdict re-rated by the worker, not read from the file |
| D. webpbn export | `test/ux/pipeline-webpbn.js` | `createAndSave`, `captureDownload` | Parsed XML dimensions and clue counts match the puzzle |

- Each lane keeps one feature row (`e2e-pipeline-mono`, `-color`, `-backup`, `-webpbn`) with a failing-first check, so the ledger shows what is open.
- Lanes touch their own file plus `FEATURES.json`. The conflicts on merge are appended rows only. Merge, do not rebase.
- If a Wave 1 lane hits the two-failure stop because a helper is wrong, the fix goes to A0's files on `main`, not into a copy in the lane. The orchestrator takes that step over.
- Merge order within Wave 1 does not matter.

### Wave 2: mutation proofs (four parallel runs, after every Wave 1 lane has merged)

Each mutation is independent and runs in its own scratch copy of merged `main`, read-only to the repo:

| Mutation | Must fail |
|---|---|
| Break `pixelColorGrid` | B |
| Stop re-rating imports (trust the file's verdict) | C |
| Swap the webpbn width and height | D |
| Make the worker return a fixed verdict | A1 |

Record each result in the matching feature row's evidence. A mutation that does not turn its check red means the check does not guard that path; fix the check before moving on.

### Wave 3: wrap-up (sequential)

1. Note `npm run test:ux` time before and after.
2. Join the combined gate check (see Gate).

### Dependency summary

```
A0 ──► A1, B, C, D (independent of each other) ──► mutation proofs ──► gate
```

## Results (2026-10-29)

Waves 0 to 2 ran on local `main`; nothing is pushed. `npm run test:ux` went from 45 to 49 checks and from about 9s to about 11s.

Changes from the plan as written:

- Create defaults to two-tone, so `createAndSave` gained a `{ colors }` option. Lane C's first "color" puzzle was two-tone because the helper could not ask for color.
- The color PNG lives at `test/ux/color-3ink.png`, not under `fixtures/`: the encoding test scans every file under a `fixtures/` directory as UTF-8 text.
- Lane worktrees may be cut from `origin/main`, not local `main`. Each lane brief starts with `git reset --hard main`.

Mutation results (each run in a scratch worktree, reverted):

| Mutation | Caught by | Gap found and fixed |
|---|---|---|
| Palette collapsed to one color | color, backup (and an older Create check) | none |
| Blank equal to an ink | color (and an older Create check) | none |
| Import keeps the file's verdict (full or partial) | backup; 6 unit tests for the full case, none for the partial case | none |
| Webpbn row and column clue blocks swapped | webpbn only (unit tests miss it) | none |
| Webpbn run lengths off by one or last clue dropped | webpbn | none |
| Webpbn image rows reversed | unit tests only | webpbn check now compares image rows to the solution |
| Worker returns a fixed `unique-line-solvable` | nothing | mono, color and backup now compare the stored verdict (status and sweeps) to the pure solver run on the stored solution (`test/ux/expected-verdict.js`) |
| Worker returns `unknown` | mono, color | backup now also fails (its snapshot is pinned to the pure solver) |
| Worker never replies | all four, by waiting for Save | the client has no timeout; a hung worker waits forever in the real UI |

Known gaps that remain:

- The webpbn export writes no width or height, and every sample image is square, so a width and height confusion cannot be tested without a non-square sample.
- The `total <= 5` colors assertion in the color check was not exercised by a mutation.
- The backup check's tamper rule flips each verdict to a different one; a mutation that trusted only a faked `unique-line-solvable` verdict is caught only if one of the two puzzles is truly `multiple`.
- The solver client has no timeout (found by the hung-worker mutation); that is an app question, not a test gap.

## Decisions

- Upload source is the repo's own sample PNGs plus one new synthetic color PNG. No third-party images.
- Download interception stubs the browser API inside the frame. A real file save is not attempted in headless Chrome.
- The checks do not seed a verdict anywhere. A check that needs a seeded puzzle belongs in the existing groups, not here.

## Gate

The maintainer wants one gate check on the whole round once every lane (of both plans) is done, before anything is pushed to `main` on GitHub. Nothing in this plan pushes. Lanes merge to local `main` only.
