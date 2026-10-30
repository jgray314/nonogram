# Mutation audit: src/format.js (lane 0c-2a)

Baseline 1086869. `node --test test/*.test.js`: 533 tests, all pass. Each mutation was one exact string replacement in a scratch copy of the repo, with the unit suite run against it and the file restored afterwards. 30 mutations, 21 caught, 9 survived. `npm run test:ux` was not rerun: none of the survivors is plausibly reachable from the UX checks (they exercise real, app-written records, not crafted boundary values).

Bound mutations loosen the bound by one (`N` to `N+1`), which is the direction that admits hostile input. Allow-list mutations add a key or drop one.

| id | location | mutation | result |
|---|---|---|---|
| M01 | `PALETTE_ENTRY_KEYS` | add `'extra'` | caught |
| M02 | `PALETTE_ENTRY_KEYS` | drop `'hex'` | caught |
| M03 | `PUZZLE_SET_KEYS` | add `'extra'` | caught |
| M04 | `RULES_KEYS` | add `'extra'` | caught |
| M05 | `pickKeys` | drop the `Object.hasOwn` guard | caught |
| M06 | `pickKnown` | palette entries passed through unpicked | caught |
| M07 | `pickKnown` | puzzle `set` pick removed | caught |
| M08 | `pickKnown` | save `rules` pick disabled | caught |
| M09 | `SAVE_KEYS` | drop `'hints'` | caught |
| M10 | `MAX_SET_SIDE` | 4 to 5 | caught |
| M11 | `MAX_GRID_SIDE` | 25 to 26 | caught |
| M12 | `MAX_PALETTE` | 30 to 31 | caught |
| M13 | `MAX_ART_CHARS` | 200000 to 200001 | SURVIVED |
| M14 | `MAX_TITLE_CHARS` | 500 to 501 | SURVIVED |
| M15 | `MAX_NAME_CHARS` | 100 to 101 | SURVIVED |
| M16 | `MAX_SET_ID_CHARS` | 200 to 201 | SURVIVED |
| M17 | `MAX_SWEEPS` | 1000000 to 1000001 | SURVIVED |
| M18 | `MAX_ID_CHARS` | `MAX_SET_ID_CHARS + 1` | caught |
| M19 | `MAX_ART_SIDE` | 320 to 321 | caught |
| M20 | `validatePuzzle` | id length check `> MAX_ID_CHARS + 1` | caught |
| M21 | `jpegSize` `isSof` | treat DAC (0xCC) as a frame marker | SURVIVED |
| M22 | `jpegSize` | SOF `length < 8` to `length < 7` | SURVIVED |
| M23 | `jpegSize` | swap returned width and height | caught |
| M24 | `jpegSize` | remove the `length < 2` guard | SURVIVED |
| M25 | `boundArt` | `<= MAX_ART_SIDE` to `<` | caught |
| M26 | `boundArt` | skip `delete rest.art` | caught |
| M27 | `idMatches` | `catch` returns true instead of false | SURVIVED |
| M28 | `canonical` | drop `toLowerCase()` on hex | caught |
| M29 | `canonical` | never include `set` | caught |
| M30 | `puzzleId` | 16-char slice to 15 | caught |

## Survivors

| id | what it means | suggested closing check | trust boundary |
|---|---|---|---|
| M13 | `art` of exactly `MAX_ART_CHARS + 1` characters is not pinned as refused (nor `MAX_ART_CHARS` as accepted) | `validatePuzzle` on a valid puzzle with `art` = prefix padded to exactly 200000 (ok) and 200001 (error); better, assert against the exported constant | yes |
| M14 | title length boundary unpinned, in both `validatePuzzle` and `validateSet` | titles of `MAX_TITLE_CHARS` (ok) and `+1` (error) for both validators | yes |
| M15 | palette name length boundary unpinned | name of `MAX_NAME_CHARS` (ok) and `+1` (error) | yes |
| M16 | set id length boundary unpinned (`puzzle.set.id` and `setId`; `MAX_ID_CHARS` derives from it but M18 shows the id checks are pinned) | `set.id` and `setId` at `MAX_SET_ID_CHARS` (ok) and `+1` (error) | yes |
| M17 | verdict `sweeps` upper bound unpinned | sweeps `MAX_SWEEPS` (ok), `MAX_SWEEPS + 1` (error), `-1` (error) | yes |
| M21 | a JPEG whose first non-SOF segment is a DAC (0xFFCC) is read as a frame header, so a crafted file can report a size it does not have | `jpegSize` on a hand-built JPEG with a DAC segment before the real SOF; expect the SOF's size (or null) | yes (art bound on import) |
| M22 | SOF segment with declared length 7 is accepted although the minimal frame header is 8 | `jpegSize` on a JPEG with an SOF of length 7: expect null | yes |
| M24 | a segment length of 0 or 1 is not refused (the scan still advances 2 bytes, so no infinite loop; it parses garbage rather than returning null) | `jpegSize` on a JPEG with a length-1 segment before the SOF: expect null | yes, low severity |
| M27 | `idMatches` returns true when `puzzleId` throws (for example a puzzle with no `palette`), so a malformed record passes the forged-id filter | `idMatches({})` and `idMatches({id:'x', palette:null})` must be false | yes (this is the forged-id gate `runImport` relies on) |

Suggested priority: M27 first (one line, highest consequence), then M21, M22, M24 (one small crafted-JPEG test file), then M13 to M17 (one table-driven boundary test).

## Notes for the plan

- The brief asked about the validators' duplicate-id refusal. `format.js` has none: `validatePuzzle`, `validateSave` and `validateSet` check one record and `validateSet` does not reject repeated entries in `tileIds`. The duplicate-id refusal (`seenPuzzles`, `seenSets`, `seenSaves`) lives in `src/backup.js` lines 53 to 76, so it belongs to that file's audit, not this one. Whether `tileIds` duplicates should be refused in `validateSet` is a design question for AGENTS.md rule 6, not a mutation result.
- Not mutated (out of the 30 cap): `gridError` bounds, `validateSave` hearts and hints bounds, `HEX` regex, `STATUSES`, `blank` check.
