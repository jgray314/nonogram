# Mutation audit: src/samples.js

Lane 0c-1 of docs/plans/line-cap-300.md. Baseline commit ca93716. Mutations were applied one at a time in a scratch copy of the repo (never in the worktree), then `npm test`; when that passed, `npm run test:ux`. The file was restored after each one.

Baseline before mutating: npm test: tests 519, pass 519, fail 0 (ℹ duration_ms 1064). npm run test:ux: "51 pass, 0 fail, 0 known issues, 0 now passing".

**Result: 46 mutations run. 29 caught, 17 survived, 0 inconclusive.**

Notes on reading the table. "caught (unit)" is a failing test in `npm test` other than the `docs:` tests, which re-run the suite and fail whenever any other test does. "inconclusive" means only `docs:` tests failed (a claim about counts or timing), so it was neither a clean catch nor run through the UX checks. EQ below means an equivalent mutant (no observable change); REAL means a behavior no check pins. The location column is the line and the nearest preceding top-level declaration, so a mutation inside a constant block may show a neighbouring name.

## Mutations

| id | location | mutation | result |
|---|---|---|---|
| S01 | L11 ART | `title: 'AI test sample: Plus (5x5)',` → `title: 'Plus (5x5)',` | caught (unit) |
| S02 | L15 ART | `title: 'AI test sample: Castle (10x10…` → `title: 'AI test sample: Castle (10x11…` | caught (unit) |
| S03 | L12 ART | `rows: ['..#..', '..#..', '#####', '..…` → `rows: ['..#..', '..#..', '#####', '..…` | caught (unit) |
| S04 | L17 ART | `'#.#.##.#.#',\n      '##########',` → `'#.#.##.#.#',\n      '#########.',` | caught (unit) |
| S05 | L31 ART | `rows: ['.#.#.', '#####', '#####', '.#…` → `rows: ['.#.#.', '#####', '#####', '.#…` | caught (ux) |
| S06 | L36 ART | `'....##....',\n      '...####...',` → `'....##....',\n      '...###....',` | **SURVIVED** |
| S07 | L53 ART | `'....#######....',\n      '..#########…` → `'....#######....',\n      '..#########…` | **SURVIVED** |
| S08 | L73 ART | `'#........#',\n      '##......##',` → `'.........#',\n      '##......##',` | caught (unit) |
| S09 | L88 ART | `'...#...#.......',\n      '...##.##...…` → `'...#...#.......',\n      '...##.##...…` | caught (unit) |
| S10 | L108 ART | `'....##........##....',\n      '....##…` → `'....##........##....',\n      '....##…` | caught (unit) |
| S11 | L133 ART | `'...#.................#...',\n      '.…` → `'...#.................#...',\n      '.…` | caught (unit) |
| S12 | L163 ART | `'........##',\n      '........##',\n   …` → `'........##',\n      '........##',\n   …` | caught (unit) |
| S13 | L178 ART | `'.........##.........',\n      '..#...…` → `'.........##.........',\n      '..#...…` | caught (unit) |
| S14 | L197 ART | `      '....................',\n    ],\n…` → `      '...................#',\n    ],\n…` | caught (unit) |
| S15 | L207 COLOR_ART | `blank: '#fdf1dc', // cream` → `blank: '#fdf1dd', // cream` | **SURVIVED** |
| S16 | L209 COLOR_ART | `['r', 'red', '#d7263d'],` → `['r', 'red', '#d7263e'],` | **SURVIVED** |
| S17 | L211 COLOR_ART | `['y', 'yellow', '#f2c230'],\n    ],\n  …` → `['y', 'gold', '#f2c230'],\n    ],\n    …` | caught (ux) |
| S18 | L216 COLOR_ART | `'.rrggggrr.',\n      'rrrrggrrrr',` → `'.rrggggrr.',\n      'rrrrggrrrg',` | **SURVIVED** |
| S19 | L228 COLOR_ART | `blank: '#1f2f4f', // night sky: the c…` → `blank: '#1f2f4e', // night sky` | **SURVIVED** |
| S20 | L232 COLOR_ART | `['t', 'tan', '#c9a777'],` → `['t', 'tan', '#c9a778'],` | **SURVIVED** |
| S21 | L236 COLOR_ART | `'...rrrr...',\n      '.rrwwrrrr.',` → `'...rrrr...',\n      '.rrwwrrrw.',` | **SURVIVED** |
| S22 | L250 COLOR_ART | `blank: '#cde8f6', // soft sky` → `blank: '#cde8f7', // soft sky` | **SURVIVED** |
| S23 | L255 COLOR_ART | `['b', 'brown', '#9a5b34'],` → `['b', 'brown', '#9a5b35'],` | **SURVIVED** |
| S24 | L258 COLOR_ART | `'.....ppppp.....',\n      '....ppppppp…` → `'.....ppppp.....',\n      '....ppppppp…` | **SURVIVED** |
| S25 | L266 COLOR_ART | `'.ggg...g.......',` → `'.ggg...g......g',` | **SURVIVED** |
| S26 | L280 samplePuzzles | `for (const { title, rows } of ART) {` → `for (const { title, rows } of ART.sli…` | caught (unit) |
| S27 | L282 samplePuzzles | `(ch) =>\n        ch === '#' ? 1 : 0,` → `(ch) =>\n        ch === '#' ? 0 : 1,` | caught (unit) |
| S28 | L282 samplePuzzles | `[{ name: 'black', hex: '#000000' }], …` → `[{ name: 'black', hex: '#111111' }], …` | caught (ux) |
| S29 | L294 colorSamplePuzzles | `const palette = inks.map(([, name, he…` → `const palette = inks.map(([, name, he…` | **SURVIVED** |
| S30 | L295 colorSamplePuzzles | `const value = (ch) => inks.findIndex(…` → `const value = (ch) => inks.findIndex(…` | caught (unit) |
| S31 | L297 colorSamplePuzzles | `out.push({ ...(await sampleRecord(tit…` → `out.push({ ...(await sampleRecord(tit…` | caught (unit) |
| S32 | L293 colorSamplePuzzles | `for (const { title, blank, inks, rows…` → `for (const { title, blank, inks, rows…` | caught (unit) |
| S33 | L305 sampleRecord | `    v: 1,\n    id: '',\n    title,` → `    v: 2,\n    id: '',\n    title,` | caught (unit) |
| S34 | L308 sampleRecord | `    width: rows[0].length,\n    height…` → `    width: rows.length,\n    height: r…` | **SURVIVED** |
| S35 | L311 sampleRecord | `solution: rows.map((row) => Array.fro…` → `solution: rows.map((row) => Array.fro…` | **SURVIVED** |
| S36 | L315 sampleRecord | `const problem = { width: puzzle.width…` → `const problem = { width: puzzle.width…` | caught (unit) |
| S37 | L317 sampleRecord | `puzzle.verdict = { status, sweeps };` → `puzzle.verdict = { status, sweeps: 0 …` | **SURVIVED** |
| S38 | L321 sampleRecord | delete `if (tier) puzzle.verdict.tier = tier;` | caught (unit) |
| S39 | L320 sampleRecord | `const tier = personaTier(problem, sta…` → `const tier = null;` | caught (unit) |
| S40 | L322 sampleRecord | `puzzle.id = await puzzleId(puzzle);` → `puzzle.id = 'x';` | caught (unit) |
| S41 | L331 loadSamples | `if (store.get('puzzle', puzzle.id)) s…` → `if (false) skipped += 1;` | caught (unit) |
| S42 | L333 loadSamples | `      store.put('puzzle', puzzle);\n  …` → `      added += 1;` | caught (unit) |
| S43 | L333 loadSamples | `      store.put('puzzle', puzzle);\n  …` → `      store.put('puzzle', puzzle);\n  …` | caught (unit) |
| S44 | L330 loadSamples | `for (const puzzle of [...(await sampl…` → `for (const puzzle of [...(await sampl…` | caught (unit) |
| S45 | L330 loadSamples | `for (const puzzle of [...(await sampl…` → `for (const puzzle of [...(await color…` | **SURVIVED** |
| S46 | L337 loadSamples | `return { added, skipped };` → `return { added: added + skipped, skip…` | caught (unit) |

## Survivors (17)

- **S06** (REAL): Pin each sample art: unit test asserting the sorted list of puzzleId values for samplePuzzles() and colorSamplePuzzles() (one hash covers S06 to S25 art rows). Boundary: user-visible (the sample picture and its clues).
- **S07** (REAL): Same id snapshot test as S06. Boundary: user-visible.
- **S15** (REAL): Unit test: colorSamplePuzzles() blank hex per title equals the expected literal (the id excludes blank, D29). Boundary: user-visible (blank colour in previews).
- **S16** (REAL): Same id snapshot test as S06 (palette hex is in the id). Boundary: user-visible.
- **S18** (REAL): Same id snapshot test as S06. Boundary: user-visible.
- **S19** (REAL): Same blank-hex test as S15. Boundary: user-visible.
- **S20** (REAL): Same id snapshot test as S06. Boundary: user-visible.
- **S21** (REAL): Same id snapshot test as S06. Boundary: user-visible.
- **S22** (REAL): Same blank-hex test as S15. Boundary: user-visible.
- **S23** (REAL): Same id snapshot test as S06. Boundary: user-visible.
- **S24** (REAL): Same id snapshot test as S06. Boundary: user-visible.
- **S25** (REAL): Same id snapshot test as S06. Boundary: user-visible.
- **S29** (REAL): Unit test: colour sample palette names equal the inks names (red, green, ...); the library shows them. Boundary: user-visible (ink names).
- **S34** (EQ): No closing check needed while every sample is square; a non-square sample would catch it. Accept in writing, or add one non-square assertion on width/height of each record. Boundary: none today.
- **S35** (EQ): The initial verdict null is overwritten before return; accept. Boundary: none.
- **S37** (REAL): Unit test: every sample verdict has sweeps >= 1 (difficulty labels read sweeps). Boundary: user-visible (difficulty label).
- **S45** (REAL): Unit test: loadSamples puts the two-tone samples first (order of store.put calls); the library order depends on it. Boundary: user-visible (library order).

