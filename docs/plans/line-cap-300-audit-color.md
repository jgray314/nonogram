# Mutation audit: src/color.js

Lane 0c-1 of docs/plans/line-cap-300.md. Baseline commit ca93716. Mutations were applied one at a time in a scratch copy of the repo (never in the worktree), then `npm test`; when that passed, `npm run test:ux`. The file was restored after each one.

Baseline before mutating: npm test: tests 519, pass 519, fail 0 (ℹ duration_ms 1064). npm run test:ux: "51 pass, 0 fail, 0 known issues, 0 now passing".

**Result: 46 mutations run (PARTIAL: 79 were planned, the lane was stopped early; ids not listed were not run). 31 caught, 10 survived, 5 inconclusive.**

Notes on reading the table. "caught (unit)" is a failing test in `npm test` other than the `docs:` tests, which re-run the suite and fail whenever any other test does. "inconclusive" means only `docs:` tests failed (a claim about counts or timing), so it was neither a clean catch nor run through the UX checks. EQ below means an equivalent mutant (no observable change); REAL means a behavior no check pins. The location column is the line and the nearest preceding top-level declaration, so a mutation inside a constant block may show a neighbouring name.

## Mutations

| id | location | mutation | result |
|---|---|---|---|
| C01 | L9 (top) | `export const COLOR_COUNTS = [3, 4, 5];` → `export const COLOR_COUNTS = [3, 4];` | caught (unit) |
| C02 | L11 COLOR_COUNTS | `export const MERGE_DE = 15;` → `export const MERGE_DE = 10;` | inconclusive (only docs-claim tests failed) |
| C03 | L11 COLOR_COUNTS | `export const MERGE_DE = 15;` → `export const MERGE_DE = 25;` | **SURVIVED** |
| C04 | L12 MERGE_DE | `const SEED = 1;` → `const SEED = 2;` | **SURVIVED** |
| C05 | L13 SEED | `const ITERATIONS = 40;` → `const ITERATIONS = 1;` | **SURVIVED** |
| C06 | L19 lin | `return c <= 0.04045 ?` → `return c < 0.04045 ?` | inconclusive (only docs-claim tests failed) |
| C07 | L19 lin | `((c + 0.055) / 1.055) ** 2.4` → `((c + 0.055) / 1.055) ** 2.2` | caught (unit) |
| C08 | L21 f | `t > 216 / 24389 ? Math.cbrt(t)` → `t >= 216 / 24389 ? Math.cbrt(t)` | caught (ux) |
| C09 | L32 rgbToLab | `/ 0.95047;\n  const y` → `;\n  const y` | caught (unit) |
| C10 | L34 rgbToLab | `0.119192 * G + 0.9503041 * B) / 1.088…` → `0.119192 * G + 0.9503041 * B) / 1.0` | caught (unit) |
| C11 | L35 rgbToLab | `500 * (f(x) - f(y))` → `500 * (f(y) - f(x))` | caught (unit) |
| C12 | L40 deltaE | `return Math.hypot(a[0] - b[0], a[1] -…` → `return Math.hypot(a[0] - b[0], a[1] -…` | caught (unit) |
| C13 | L49 hexOf | `Math.max(0, Math.min(255, Math.round(…` → `Math.max(0, Math.round(v))` | **SURVIVED** |
| C14 | L49 hexOf | `Math.max(0, Math.min(255, Math.round(…` → `Math.min(255, Math.round(v))` | **SURVIVED** |
| C15 | L51 hexOf | `.padStart(2, '0'),` → `.padStart(1, '0'),` | caught (ux) |
| C16 | L65 inkColors | `if (!Array.isArray(palette) \|\| palett…` → `if (!Array.isArray(palette)) return n…` | **SURVIVED** |
| C17 | L66 inkColors | `palette[0].hex.toLowerCase() === '#00…` → `palette[0].hex === '#000000'` | **SURVIVED** |
| C18 | L66 inkColors | `if (palette.length === 1 &&` → `if (palette.length === 2 &&` | caught (unit) |
| C19 | L72 inkText | `rgbToLab(rgbOfHex(hex))[0] > 60 ?` → `rgbToLab(rgbOfHex(hex))[0] >= 60 ?` | caught (ux) |
| C20 | L72 inkText | `rgbToLab(rgbOfHex(hex))[0] > 60 ? '#0…` → `rgbToLab(rgbOfHex(hex))[0] > 50 ? '#0…` | **SURVIVED** |
| C21 | L72 inkText | `rgbToLab(rgbOfHex(hex))[0] > 60 ? '#0…` → `rgbToLab(rgbOfHex(hex))[0] > 60 ? '#f…` | caught (unit) |
| C22 | L92 cellColors | `const a = rgba[o + 3] / 255;\n        …` → `for (let k = 0; k < 3; k++) sum[k] +=…` | caught (unit) |
| C23 | L91 cellColors | `const o = ((crop.y + y) * imgW + crop…` → `const o = ((crop.y + y) * imgW + x) *…` | caught (ux) |
| C24 | L96 cellColors | `const n = (y1 - y0) * (x1 - x0);\n    …` → `const n = (y1 - y0);\n      row.push(s…` | caught (unit) |
| C25 | L127 kmeans | `let t = rand() * total;` → `let t = total;` | caught (ux) |
| C26 | L126 kmeans | delete `if (total === 0) break; // fewer distinct colors than k` | caught (ux) |
| C27 | L151 kmeans | delete `if (best !== assign[i]) changed = true;` | caught (ux) |
| C28 | L156 kmeans | `if (members.length) cents[j]` → `if (members.length > 1) cents[j]` | caught (ux) |
| C29 | L158 kmeans | `    if (!changed) break;\n  }\n  return…` → `  }\n  return assign;` | caught (ux) |
| C30 | L188 quantizeColors | `if (d < MERGE_DE && (!best \|\| d < bes…` → `if (d < MERGE_DE && (!best \|\| d <= be…` | caught (ux) |
| C31 | L196 quantizeColors | `b.members.length - a.members.length \|…` → `a.members.length - b.members.length \|…` | caught (unit) |
| C32 | L196 quantizeColors | `b.members.length - a.members.length \|…` → `b.members.length - a.members.length` | caught (ux) |
| C33 | L202 quantizeColors | `const inks = clusters.slice(1);` → `const inks = clusters.slice(2);` | caught (unit) |
| C34 | L205 quantizeColors | `: [{ name: 'color-1', hex: blank }];\n…` → `: [];\n  return { grid, palette, blank…` | caught (unit) |
| C35 | L212 clusterOf | `const rounded = rgbOfHex(hexOf(color)…` → `const rounded = color;\n  return { mem…` | **SURVIVED** |
| C36 | L221 colorGrid | `return pixelColorGrid(rgba, imgW, cro…` → `return cellColorGrid(rgba, imgW, crop…` | caught (unit) |
| C37 | L237 labToRgb | `const fy = (L + 16) / 116;` → `const fy = (L + 15) / 116;` | caught (unit) |
| C38 | L239 labToRgb | `const fz = fy - b / 200;` → `const fz = fy + b / 200;` | caught (unit) |
| C39 | L240 labToRgb | `const inv = (t) => (t ** 3 > 216 / 24…` → `const inv = (t) => t ** 3;` | caught (unit) |
| C40 | L245 labToRgb | `const G = -0.969266 * x + 1.8760108 *…` → `const G = -0.969266 * x + 1.8760108 *…` | caught (unit) |
| C41 | L248 labToRgb | `const v = c <= 0.0031308 ? 12.92 * c …` → `const v = 1.055 * c ** (1 / 2.4) - 0.…` | **SURVIVED** |
| C42 | L249 labToRgb | `return Math.max(0, Math.min(255, Math…` → `return Math.round(v * 255);\n  };` | inconclusive (only docs-claim tests failed) |
| C43 | L255 labToRgb | `export const SEED_FALLOFF = 80;` → `export const SEED_FALLOFF = 40;` | caught (ux) |
| C44 | L257 SEED_FALLOFF | `const MAX_PALETTE_PIXELS = 65536;` → `const MAX_PALETTE_PIXELS = 256;` | inconclusive (only docs-claim tests failed) |
| C45 | L274 sampleStep | `Math.max(1, Math.ceil(Math.sqrt((crop…` → `Math.max(1, Math.floor(Math.sqrt((cro…` | caught (ux) |
| C47 | L263 pixelAt | `return [0, 1, 2].map((k) => rgba[o + …` → `return [0, 1, 2].map((k) => rgba[o + …` | inconclusive (only docs-claim tests failed) |

## Survivors (10)

- **C03** (REAL): Same MERGE_DE boundary test as C02. Boundary: user-visible.
- **C04** (REAL): Snapshot test for quantizeColors/cellColorGrid (the seeded k-means path); note this path is the D25 research method, not what Create ships. Boundary: research path only; low user impact.
- **C05** (REAL): Snapshot test on an image that needs several Lloyd iterations (in kmeans and weightedKmeans, which the shipped pixel path uses). Boundary: user-visible (palette) via the shipped path.
- **C13** (REAL): Unit test: hexOf([300, -5, 0]) is "#ff0000" clamp on both ends (one test covers C13 and C14). Boundary: user-visible (stored palette hex; format.js allow-list expects #rrggbb).
- **C14** (REAL): Same hexOf clamp test as C13. Boundary: user-visible and storage.
- **C16** (REAL): Unit test: inkColors([]) is null. Boundary: user-visible (colour vs two-tone rendering).
- **C17** (REAL): Unit test: inkColors([{hex:"#000000"}]) and the upper-case form are null. Boundary: user-visible (two-tone vs colour rendering).
- **C20** (REAL): Unit test: inkText for a mid-grey (L between 50 and 60, e.g. #777777) is white. Boundary: user-visible (number legibility on ink chips).
- **C35** (REAL): Unit test: merge test uses the rounded colour (two means 14.9 and 15.1 apart before rounding). Boundary: user-visible.
- **C41** (REAL): Unit test: labToRgb for a very dark Lab (L 1) and rgbToLab/labToRgb round trip on 5 colours incl. near-black. Boundary: user-visible (palette hex).

## Inconclusive (5)

- **C02** (REAL): Boundary test: two inks 12 apart in Lab merge, two 18 apart stay separate (pins MERGE_DE between 12 and 18). Boundary: user-visible (how many colours a puzzle gets).
- **C06** (EQ): lin() at exactly 0.04045 is continuous across both branches to 5 decimals; accept. Boundary: none.
- **C42** (REAL): Unit test: labToRgb on an out-of-gamut Lab (a 120) clamps to 0..255. Boundary: user-visible and storage (hex must stay valid).
- **C44** (REAL): Unit test on a crop above 65536 pixels (e.g. 300x300): result equals the pinned snapshot, and sampleStep is 2. Boundary: user-visible and performance.
- **C47** (REAL): Unit test: pixelColorGrid on a half-transparent red pixel image (alpha composited over white). Boundary: user-visible (transparent PNGs).

