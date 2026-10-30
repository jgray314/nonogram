# Mutation audit: src/views/library.js (line-cap-300, Wave 0c-2b)

Baseline at main `67d68ff`: `npm test` 533 pass; `npm run test:ux` 51 pass, 0 fail. No unit test imports `library.js`; only the UX checks in `test/ux/` reach it (`pipeline-backup.js`, `pipeline-savefile.js`, `pipeline-webpbn.js` and the library walk in `checks.js`).

Method: each mutation is one exact-string replacement in a scratch copy of the repo (never `src/` in a worktree). The script runs `node --test test/*.test.js` first and only if that passes runs `npm run test:ux`; the file is restored after each. "SURVIVED" means both suites passed with the mutation in place. 25 mutations (the cap). Line numbers are in main `67d68ff`.

Result: **25 mutations, 5 caught, 20 survived.** L4 was first run as a deletion that left a `for` loop without a body, so it was caught only as a syntax error (an invalid mutant); it was re-run as `void id;` and survived. The table shows the valid run.

| id | location | mutation | result |
|---|---|---|---|
| L1 | runImport:127 | `!(await idMatches(p))` becomes `false` (forged-id check never fires) | SURVIVED |
| L2 | runImport:130 | saves of forged puzzles no longer filtered (`filter(s => true)`) | SURVIVED |
| L3 | runImport:129 | forged puzzles no longer filtered (`filter(p => true)`) | SURVIVED |
| L4 | runImport:132 | forged ids no longer recorded in `parsed.skipped` (no "id does not match content" in the status) | SURVIVED |
| L5 | runImport:128 | whole forged branch off (`if (false)`) | SURVIVED |
| L6 | runImport:141 | re-solve branch off (`if (false)`, imported verdicts trusted) | caught (test:ux) |
| L7 | runImport:149 | `ratePlan` result discarded (plan stays unrated) | caught (test:ux) |
| L8 | runImport:155 | `solver?.terminate()` dropped (worker leak) | SURVIVED |
| L9 | runImport:151 | solver-failure path no longer returns: import continues and writes unchecked puzzles | SURVIVED |
| L10 | runImport:165 | write-failure path no longer returns: falls through to the success message | SURVIVED |
| L11 | runImport:162 | `written += 1` dropped (failure message says "after 0") | SURVIVED |
| L12 | runImport:172 | "already existed" note off | SURVIVED |
| L13 | runImport:175 | skipped-detail cap 3 becomes 30 | SURVIVED |
| L14 | runImport:184 | "pictures dropped" note off | SURVIVED |
| L15 | importLibrary:110 | toolbar not disabled during import | SURVIVED |
| L16 | forThisMount:99 | generation check removed (`fn()` always runs) | SURVIVED |
| L17 | unmount:410 | `generation += 1` dropped from unmount | SURVIVED |
| L18 | unmount:413 | `store = null` dropped from unmount | SURVIVED |
| L19 | exportLibrary:82 | corrupt-record count ignores sets | SURVIVED |
| L20 | exportLibrary:79 | backup built with `sets: []` (sets silently omitted from export) | SURVIVED |
| L21 | exportXml:65 | missing-puzzle guard removed | SURVIVED |
| L22 | deleteSet:373 | tile puzzles no longer removed on set delete | SURVIVED |
| L23 | deletePuzzle:70 | confirm inverted | caught (test:ux) |
| L24 | rowNode:236 | color badge off (`if (false)`) | caught (test:ux) |
| L25 | addSamples:199 | "already present" suffix removed | SURVIVED |

The five caught are the re-solve path (L6, L7), the delete confirm and the color badge. Everything else in `runImport` survived, including the whole forged-id filter. `idMatches` itself is unit-tested (`test/format.test.js`, `test/backup.test.js`), but nothing exercises `runImport`'s use of it, so no check fails if the forged-id filter is wired out.

## Survivors and suggested closing checks

Trust boundary = on `runImport` / backup import or export. These are the ones the plan says must be closed.

| survivors | boundary / visible | suggested closing check | kind |
|---|---|---|---|
| L1, L2, L3, L5 | **trust boundary** (forged-id filter) | UX check in `pipeline-backup.js` style: import a backup containing a valid puzzle, a puzzle whose id was edited (and a save keyed to the forged id); assert the forged puzzle and its save are absent from the store and the valid one is present | UX |
| L4 | **trust boundary**, user-visible | same check; assert the status text contains "id does not match content" and the invalid count | UX |
| L9 | **trust boundary** (unrated puzzles written when the solver fails) | stub `Worker` to throw (or terminate the worker mid-import); assert the status is "Import failed: the solver could not check the puzzles" and the store is unchanged | UX |
| L10, L11 | **trust boundary**, user-visible | make `localStorage.setItem` throw on the second write (quota); assert "Import stopped after 1 of N records" is shown, not "Imported", and that records written so far remain | UX |
| L8 | resource leak, not visible | accepted unless a check can count live workers (`Worker` wrapper counting terminate calls); low value | accept or UX |
| L12, L13, L14 | user-visible status text | extend the forged-id check: duplicate puzzle plus 4+ invalid records plus a non-JPEG art backup; assert the "already existed", capped detail with `; ...`, and "picture dropped" parts | UX |
| L15 | user-visible | assert toolbar buttons are `disabled` during an import (hold the solver stub open) and enabled after | UX |
| L16, L17, L18 | stale-mount safety | start an import, navigate away (`#/`) before it ends, assert no exception is thrown and the new view's status node is untouched; for L18 assert `store` is not reused by a later mount (observable only as the next mount's data being the current one, so likely accepted) | UX |
| L19, L20 | **trust boundary** (export is the backup; silent data loss), user-visible | export check: store holding a set and a corrupt record; parse the downloaded JSON, assert `sets` present, and the status counts the corrupt record. A round-trip (export, wipe, import, compare store) closes L20 and the whole export side at once | UX |
| L21 | user-visible, defensive | open "Export for other solvers" for an id deleted in another tab; assert the status message, no download | UX |
| L22 | user-visible (data left behind) | create a set, delete it; assert the set row and all its tile puzzles are gone from the store | UX |
| L25 | user-visible status text | click "Load sample puzzles" twice; assert the second status says "already present" | UX |

Notes for Wave 0e: a single round-trip UX check (build a library with a set, a corrupt record and a color puzzle; export; delete; import; compare) plus one forged-backup check closes L1-L5 and L19-L20 and most of the status text (L11-L14). L9, L10 and L15-L17 each need a hook (worker stub, throwing storage, a held-open solver, navigation mid-import). Because `library.js` has no unit test and no DOM shim exists in the repo, all of these are UX checks; moving import logic into a pure module (outside this plan's no-behavior-change scope) would be the way to unit-test it.
