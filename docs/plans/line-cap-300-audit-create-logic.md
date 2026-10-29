# Mutation audit: src/create-logic.js

Lane 0c-1 of docs/plans/line-cap-300.md. Baseline commit ca93716. Mutations were applied one at a time in a scratch copy of the repo (never in the worktree), then `npm test`; when that passed, `npm run test:ux`. The file was restored after each one.

Baseline before mutating: npm test: tests 519, pass 519, fail 0 (ℹ duration_ms 1064). npm run test:ux: "51 pass, 0 fail, 0 known issues, 0 now passing".

**Result: 100 mutations run. 63 caught, 37 survived, 0 inconclusive.**

Notes on reading the table. "caught (unit)" is a failing test in `npm test` other than the `docs:` tests, which re-run the suite and fail whenever any other test does. "inconclusive" means only `docs:` tests failed (a claim about counts or timing), so it was neither a clean catch nor run through the UX checks. EQ below means an equivalent mutant (no observable change); REAL means a behavior no check pins. The location column is the line and the nearest preceding top-level declaration, so a mutation inside a constant block may show a neighbouring name.

## Mutations

| id | location | mutation | result |
|---|---|---|---|
| L01 | L5 (top) | `export const SIZES = [5, 10, 15, 20, …` → `export const SIZES = [5, 10, 15, 20];` | caught (unit) |
| L02 | L6 SIZES | `export const LONG_SIDE = 15;` → `export const LONG_SIDE = 20;` | caught (unit) |
| L03 | L7 LONG_SIDE | `export const MAX_LOAD_SIDE = 1024;` → `export const MAX_LOAD_SIDE = 2048;` | caught (unit) |
| L04 | L15 nearestSize | `if (Math.abs(s - target) <= Math.abs(…` → `if (Math.abs(s - target) < Math.abs(b…` | caught (unit) |
| L05 | L25 defaultSize | `if (SIZES.includes(imgW) && SIZES.inc…` → `if (SIZES.includes(imgW) \|\| SIZES.inc…` | caught (unit) |
| L06 | L28 defaultSize | `const s = Math.max(5, nearestSize((LO…` → `const s = nearestSize((LONG_SIDE * sh…` | **SURVIVED** |
| L07 | L29 defaultSize | `return imgW >= imgH ? { width: LONG_S…` → `return imgW > imgH ? { width: LONG_SI…` | caught (ux) |
| L08 | L34 gridSig | `return JSON.stringify([st.tileRows, s…` → `return JSON.stringify([st.tileRows, s…` | caught (ux) |
| L09 | L34 gridSig | `return JSON.stringify([st.tileRows, s…` → `return JSON.stringify([st.grid, st.pa…` | **SURVIVED** |
| L10 | L42 hasUnsavedWork | `return (st.hasImage \|\| hasFilledCell(…` → `return (st.hasImage && hasFilledCell(…` | caught (unit) |
| L11 | L42 hasUnsavedWork | `return (st.hasImage \|\| hasFilledCell(…` → `return (st.hasImage \|\| hasFilledCell(…` | caught (unit) |
| L12 | L42 hasUnsavedWork | `return (st.hasImage \|\| hasFilledCell(…` → `return (hasFilledCell(st.grid)) && gr…` | caught (unit) |
| L13 | L48 existingPuzzle | `return found ? String(found.title ?? …` → `return found ? String(found.title) : …` | **SURVIVED** |
| L14 | L48 existingPuzzle | `return found ? String(found.title ?? …` → `return found ? '' : null;` | caught (unit) |
| L15 | L51 existingPuzzle | `const CLUE_W = 22;` → `const CLUE_W = 20;` | **SURVIVED** |
| L16 | L52 CLUE_W | `const GRID_CHROME = 20;` → `const GRID_CHROME = 10;` | **SURVIVED** |
| L17 | L60 narrowCellSize | `return clamp(fit, 12, 24);` → `return clamp(fit, 10, 24);` | caught (unit) |
| L18 | L60 narrowCellSize | `return clamp(fit, 12, 24);` → `return clamp(fit, 12, 30);` | caught (unit) |
| L19 | L63 narrowCellSize | `const MAX_TITLE = 60;` → `const MAX_TITLE = 80;` | caught (unit) |
| L20 | L69 titleFromFile | delete `.replace(/\.[^./\\]*$/, '')` | caught (unit) |
| L21 | L70 titleFromFile | `.replace(/[-_\s]+/g, ' ')` → `.replace(/[-_]+/g, ' ')` | **SURVIVED** |
| L22 | L72 titleFromFile | `.slice(0, MAX_TITLE)\n    .trim();` → `.slice(0, MAX_TITLE);` | **SURVIVED** |
| L23 | L74 titleFromFile | `return base \|\| 'Untitled';` → `return base;` | caught (unit) |
| L24 | L67 titleFromFile | `const base = String(name ?? '')\n    .…` → `const base = String(name ?? '')` | **SURVIVED** |
| L25 | L79 hasFilledCell | `return grid.some((row) => row.some((v…` → `return grid.some((row) => row.some((v…` | **SURVIVED** |
| L26 | L89 centerCrop | `if (imgW * gridH >= imgH * gridW) {` → `if (imgW * gridH > imgH * gridW) {` | **SURVIVED** |
| L27 | L91 centerCrop | `w = Math.max(1, Math.min(imgW, Math.f…` → `w = Math.max(1, Math.min(imgW, Math.r…` | **SURVIVED** |
| L28 | L94 centerCrop | `h = Math.max(1, Math.min(imgH, Math.f…` → `h = Math.max(1, Math.floor((imgW * gr…` | **SURVIVED** |
| L29 | L96 centerCrop | `const x = clamp(Math.round((imgW - w)…` → `const x = clamp(Math.round((imgW - w)…` | caught (unit) |
| L30 | L97 centerCrop | `const y = clamp(Math.round((imgH - h)…` → `const y = clamp(Math.round((imgH - h)…` | **SURVIVED** |
| L31 | L104 loadScale | `return long > MAX_LOAD_SIDE ? MAX_LOA…` → `return long >= MAX_LOAD_SIDE ? MAX_LO…` | **SURVIVED** |
| L32 | L109 blankGrid | `return Array.from({ length: height },…` → `return Array.from({ length: width }, …` | caught (unit) |
| L33 | L125 blankGrid | `export function newEditorState({ widt…` → `export function newEditorState({ widt…` | **SURVIVED** |
| L34 | L135 newEditorState | `    threshold: 128,\n    autoThreshold…` → `    threshold: 127,\n    autoThreshold…` | **SURVIVED** |
| L35 | L136 newEditorState | `    autoThreshold: true,` → `    autoThreshold: false,` | **SURVIVED** |
| L36 | L145 newEditorState | `    brush: 1,\n  };` → `    brush: 0,\n  };` | caught (ux) |
| L37 | L142 newEditorState | `    colors: 0,\n    palette: null,\n   …` → `    colors: 3,\n    palette: null,\n   …` | **SURVIVED** |
| L38 | L132 newEditorState | `    tileRows: 1,\n    tileCols: 1,\n   …` → `    tileRows: 1,\n    tileCols: 2,\n   …` | caught (ux) |
| L39 | L151 regenerateNeedsConfirm | `return Boolean(hasManualEdits);` → `return false;` | caught (unit) |
| L40 | L155 STATUS_TEXT | `'unique-line-solvable': 'One solution…` → `'unique-line-solvable': 'One solution…` | **SURVIVED** |
| L41 | L157 STATUS_TEXT | `multiple: 'More than one solution. Hi…` → `multiple: 'More than one solution.',` | **SURVIVED** |
| L42 | L158 STATUS_TEXT | `none: 'No solution fits these clues.',` → `none: 'No solution.',` | **SURVIVED** |
| L43 | L159 STATUS_TEXT | `unknown: 'Could not decide: the searc…` → `unknown: 'Unknown.',` | **SURVIVED** |
| L44 | L156 STATUS_TEXT | `'unique-needs-guessing': 'One solutio…` → `'unique-needs-guessing': 'One solutio…` | **SURVIVED** |
| L45 | L165 verdictOf | delete `if (result.tier) verdict.tier = result.tier;` | caught (unit) |
| L46 | L164 verdictOf | `const verdict = { status: result.stat…` → `const verdict = { status: result.stat…` | caught (unit) |
| L47 | L164 verdictOf | `const verdict = { status: result.stat…` → `const verdict = { status: result.stat…` | caught (unit) |
| L48 | L176 reportView | `if (!result) return { text: 'Checking…` → `if (!result) return { text: 'Checking…` | **SURVIVED** |
| L49 | L176 reportView | `label: 'Unchecked', highlight: [] };` → `label: 'Pending', highlight: [] };` | caught (unit) |
| L50 | L177 reportView | `const label = difficultyLabel(verdict…` → `const label = difficultyLabel(verdict…` | caught (unit) |
| L51 | L179 reportView | `if (result.status === 'multiple') hig…` → `if (result.status === 'multiple') hig…` | caught (unit) |
| L52 | L180 reportView | delete `else if (result.status === 'unique-needs-guessing') hi…` | caught (unit) |
| L53 | L182 reportView | `text: STATUS_TEXT[result.status] ?? r…` → `text: STATUS_TEXT[result.status],` | **SURVIVED** |
| L54 | L184 reportView | `highlight: highlight.map(([r, c]) => …` → `highlight,` | **SURVIVED** |
| L55 | L192 DEFAULT_PALETTE | `export const ART_MAX_SIDE = 320;` → `export const ART_MAX_SIDE = 400;` | caught (unit) |
| L56 | L193 ART_MAX_SIDE | `export const ART_MIN_SIDE = 160;` → `export const ART_MIN_SIDE = 100;` | caught (unit) |
| L57 | L197 ART_ATTEMPTS | `  [ART_MAX_SIDE, 0.6],\n  [240, 0.6],` → `  [240, 0.6],\n  [ART_MAX_SIDE, 0.6],` | **SURVIVED** |
| L58 | L199 ART_ATTEMPTS | `  [160, 0.5],\n];` → `];` | **SURVIVED** |
| L59 | L210 artSize | `long < ART_MIN_SIDE ? Math.max(1, Mat…` → `long < ART_MIN_SIDE ? Math.max(1, Mat…` | **SURVIVED** |
| L60 | L210 artSize | `long < ART_MIN_SIDE ? Math.max(1,` → `long <= ART_MIN_SIDE ? Math.max(1,` | **SURVIVED** |
| L61 | L211 artSize | `const scale = Math.min(up, maxSide / …` → `const scale = up;` | caught (unit) |
| L62 | L212 artSize | `return { width: Math.max(1, Math.roun…` → `return { width: Math.round(w * scale)…` | **SURVIVED** |
| L63 | L217 tileCropRect | `const edge = (start, len, n, i) => st…` → `const edge = (start, len, n, i) => st…` | **SURVIVED** |
| L64 | L219 tileCropRect | `const x1 = edge(crop.x, crop.w, cols,…` → `const x1 = edge(crop.x, crop.w, cols,…` | caught (unit) |
| L65 | L220 tileCropRect | `const y0 = edge(crop.y, crop.h, rows,…` → `const y0 = edge(crop.y, crop.h, cols,…` | caught (unit) |
| L66 | L233 pickArt | `typeof url === 'string' && url.starts…` → `url.startsWith(ART_PREFIX) && url.len…` | **SURVIVED** |
| L67 | L233 pickArt | `typeof url === 'string' && url.starts…` → `typeof url === 'string' && url.length…` | caught (unit) |
| L68 | L233 pickArt | `typeof url === 'string' && url.starts…` → `typeof url === 'string' && url.starts…` | **SURVIVED** |
| L69 | L233 pickArt | `typeof url === 'string' && url.starts…` → `typeof url === 'string' && url.starts…` | caught (unit) |
| L70 | L237 pickArt | `  return undefined;\n}` → `  return ART_ATTEMPTS.length ? encode…` | caught (unit) |
| L71 | L242 withArts | `puzzles.map((p, i) => (arts[i] ? { ..…` → `puzzles.map((p, i) => (arts[i] ? { ..…` | **SURVIVED** |
| L72 | L255 buildPuzzleRecord | `title: title.trim() \|\| 'Untitled',` → `title: title \|\| 'Untitled',` | caught (unit) |
| L73 | L255 buildPuzzleRecord | `title: title.trim() \|\| 'Untitled',` → `title: title.trim(),` | caught (unit) |
| L74 | L256 buildPuzzleRecord | `width: grid[0].length,\n    height: gr…` → `width: grid.length,\n    height: grid[…` | caught (unit) |
| L75 | L258 buildPuzzleRecord | `palette: palette.map((p) => ({ name: …` → `palette,` | **SURVIVED** |
| L76 | L259 buildPuzzleRecord | `solution: grid.map((row) => row.slice…` → `solution: grid,` | caught (unit) |
| L77 | L260 buildPuzzleRecord | `verdict: verdictOf(report),\n  };` → `verdict: report,\n  };` | caught (unit) |
| L78 | L262 buildPuzzleRecord | delete `if (art) record.art = art;` | caught (unit) |
| L79 | L263 buildPuzzleRecord | delete `if (blank) record.blank = blank;` | caught (unit) |
| L80 | L251 withArts | `export function buildPuzzleRecord(gri…` → `export function buildPuzzleRecord(gri…` | caught (unit) |
| L81 | L253 buildPuzzleRecord | `    v: 1,\n    id: '',\n    title: titl…` → `    v: 1,\n    id: 'x',\n    title: tit…` | **SURVIVED** |
| L82 | L272 canSave | `return phase === 'fresh' && Boolean(r…` → `return phase === 'fresh';` | caught (unit) |
| L83 | L272 canSave | `return phase === 'fresh' && Boolean(r…` → `return Boolean(result);` | caught (unit) |
| L84 | L278 canSave | `export const TILE_COUNTS = [1, 2, 3, …` → `export const TILE_COUNTS = [1, 2, 3];` | caught (unit) |
| L85 | L282 fullSize | `return { width: width * cols, height:…` → `return { width: width * rows, height:…` | caught (unit) |
| L86 | L287 sliceTiles | `const tileH = grid.length / rows;\n  c…` → `const tileH = grid.length / cols;\n  c…` | caught (unit) |
| L87 | L291 sliceTiles | `grid.slice(r * tileH, (r + 1) * tileH…` → `grid.slice(r * tileH, (r + 1) * tileH…` | caught (unit) |
| L88 | L298 tileStatusLine | `const name = `r${row + 1}c${col + 1}`;` → `const name = `r${row}c${col}`;` | caught (unit) |
| L89 | L299 tileStatusLine | `if (!result) return `${name}: checkin…` → `if (!result) return `${name}: checked…` | caught (unit) |
| L90 | L301 tileStatusLine | `return flag ? `${name}: ${label} (${f…` → `return `${name}: ${label}`;` | caught (unit) |
| L91 | L300 tileStatusLine | `const label = difficultyLabel(verdict…` → `const label = difficultyLabel(verdict…` | caught (unit) |
| L92 | L306 canSaveSet | `return reports.length > 0 && reports.…` → `return reports.every(canSave);` | caught (unit) |
| L93 | L306 canSaveSet | `return reports.length > 0 && reports.…` → `return reports.length > 0 && reports.…` | caught (unit) |
| L94 | L313 withVerdicts | `verdict: verdictOf(reports[i].result),` → `verdict: verdictOf(reports[0].result),` | caught (unit) |
| L95 | L322 setWrites | `return [...puzzles.map((record) => ({…` → `return [{ kind: 'set', record: set },…` | caught (unit) |
| L96 | L322 setWrites | `{ kind: 'set', record: set }];\n}` → `];\n}` | caught (unit) |
| L97 | L332 rollbackTargets | `[kind, kind === 'set' ? record.setId …` → `[kind, record.id])` | caught (unit) |
| L98 | L333 rollbackTargets | `.filter(([kind, id]) => !existedBefor…` → `.filter(([kind, id]) => existedBefore…` | caught (unit) |
| L99 | L333 rollbackTargets | `.filter(([kind, id]) => !existedBefor…` → `.filter(([kind, id]) => true);` | caught (unit) |
| L100 | L188 reportView | `export const DEFAULT_PALETTE = [{ nam…` → `export const DEFAULT_PALETTE = [{ nam…` | caught (unit) |

## Survivors (37)

- **L06** (EQ): nearestSize already returns at least 5 (SIZES[0]); the Math.max is redundant. Accept, or delete the redundant guard later. Boundary: none.
- **L09** (REAL): Unit test: hasUnsavedWork/gridSig differ when only tileRows or tileCols change. Boundary: user-visible (unsaved-work warning).
- **L13** (REAL): Unit test: existingPuzzle for a record with no title returns an empty string, not "undefined". Boundary: user-visible (duplicate-save message); store data.
- **L15** (REAL): Unit test pinning narrowCellSize(availWidth, cols, clueCols) for 2 to 3 hand-computed inputs (e.g. 360, 15, 4 gives 14). Boundary: user-visible (narrow layout).
- **L16** (REAL): Same narrowCellSize test as L15. Boundary: user-visible.
- **L21** (REAL): Unit test: titleFromFile("my  photo.png") and a tab/newline in the name collapse to single spaces. Boundary: user-visible (default title).
- **L22** (REAL): Unit test: titleFromFile of a name whose 60th character is a space has no trailing space. Boundary: user-visible.
- **L24** (EQ): The leading trim is repeated by the later trim after the replace; accept. Boundary: none.
- **L25** (REAL): Unit test: hasFilledCell([[0,2],[0,0]]) is true (colour inks above 1). Boundary: user-visible (unsaved-work warning and save gating for colour grids).
- **L26** (EQ): Equal aspect ratios give the same crop from either branch; accept. Boundary: none.
- **L27** (REAL): Unit test: centerCrop on an image whose ratio does not divide evenly (e.g. 101x50 into 1x1) pins floor. Boundary: user-visible (the crop).
- **L28** (EQ): In this branch h <= imgH already, so the Math.min is redundant; accept. Boundary: none.
- **L30** (REAL): Unit test: centerCrop with offset {dx:0, dy:5} shifts y (and clamps at the edge). Boundary: user-visible (drag to reposition the crop).
- **L31** (EQ): At exactly 1024 the scale is 1 either way; accept. Boundary: none.
- **L33** (REAL): Unit test: newEditorState() has 15x15 and a 15x15 blank grid. Boundary: user-visible (initial size).
- **L34** (REAL): Unit test pinning the whole newEditorState() default object (covers L33 to L38). Boundary: user-visible (initial threshold).
- **L35** (REAL): Same newEditorState test as L34. Boundary: user-visible.
- **L37** (REAL): Same newEditorState test as L34. Boundary: user-visible (colours default off).
- **L40** (REAL): Unit test: reportView text for each of the five statuses equals STATUS_TEXT literal (copy the five strings into the test). Boundary: user-visible.
- **L41** (REAL): Same reportView text test as L40. Boundary: user-visible.
- **L42** (REAL): Same reportView text test as L40. Boundary: user-visible.
- **L43** (REAL): Same reportView text test as L40. Boundary: user-visible.
- **L44** (REAL): Same reportView text test as L40. Boundary: user-visible.
- **L48** (EQ): The mutation only reflowed code (no behavior change); not a real mutant. Accept. Boundary: none.
- **L53** (REAL): Unit test: reportView({status:"weird"}).text is "weird" (falls back, does not show undefined). Boundary: user-visible.
- **L54** (REAL): Unit test: reportView highlight is a copy, mutating it does not change result.differing. Boundary: internal aliasing.
- **L57** (REAL): Unit test: pickArt calls encode with the ART_ATTEMPTS sides and qualities in order (recording stub). Boundary: trust boundary (art size bound, MAX_ART_CHARS) and storage size.
- **L58** (REAL): Unit test: pickArt where only the last attempt (160, 0.5) fits returns that url. Boundary: trust boundary (art bound).
- **L59** (REAL): Unit test: artSize(10, 10) scales up in whole steps to the ART_MIN_SIDE; artSize(10,10,100) respects maxSide. Boundary: user-visible (reveal art size).
- **L60** (EQ): At exactly ART_MIN_SIDE up is Math.max(1, 1) = 1 either way; accept. Boundary: none.
- **L62** (EQ): width is at least 1 for any real source (scale <= up and w >= 1 gives round >= 1 except for a w << h source); add artSize(1, 1000) = width 1 if wanted. Boundary: none today.
- **L63** (REAL): Unit test: tileCropRect on an odd crop width (e.g. w 7 into 2 cols) pins Math.round at the seam. Boundary: user-visible (tile art seams).
- **L66** (REAL): Unit test: pickArt where encode returns a non-string (undefined, object) skips it instead of throwing. Boundary: trust boundary (canvas output).
- **L68** (REAL): Unit test: pickArt accepts a url of exactly MAX_ART_CHARS and rejects MAX_ART_CHARS + 1. Boundary: trust boundary (MAX_ART_CHARS).
- **L71** (REAL): Unit test: withArts result entries are copies (not the same object) when there is no art. Boundary: internal aliasing.
- **L75** (REAL): Unit test: buildPuzzleRecord palette entries are copies and drop extra keys (pass {name, hex, junk}). Boundary: trust boundary (record keys are allow-listed by format.js; this strips extras first).
- **L81** (REAL): Unit test: buildPuzzleRecord(...).id is "" (contract: caller fills it). Boundary: trust boundary (id must be recomputed by puzzleId).

