# Color mode research: how to layer color into puzzles

Date: 2026-10-14. Shipped in merge `88e5fc7`. Nothing in `src/` changed except the hidden flag (`src/features.js`, `?features=color` after the hash) and a router change of about six lines. No color UI exists yet. The tables below were regenerated on 2026-10-15 after the gate pass 6 fixes to the script.

## How to run your own photos

1. Convert each photo to PNG. The decoder reads PNG only (8-bit, not interlaced). JPEG and HEIC files must be converted first.
2. Put the PNGs in `research/color/photos/`. The folder is gitignored. Its images form the `photos` group.
3. From the repo root, run `node research/color/run.mjs --preview`. Add `--detail` for one row per image and approach.
4. Read the `photos` tables. Counts are printed beside percentages. The `deg` column counts puzzles that are blank, nearly blank or completely filled; they are left out of the fair and line figures.
5. Contact sheets land in `research/color/out/` (gitignored), one per image, named `<group>-<image>-<size>.png`, at the largest grid size. Panels, left to right: source cells, A mono, F dither, E gray4, B1 k3w, B1 k4a, C rgb3.

Color caveat: colors are read as sRGB. A PNG with an embedded color profile, such as a Display-P3 export from a phone, prints a `warning` line and its colors shift. Convert such photos to sRGB first. Transparent pixels are composited over white. Photos that are not square are center-cropped.

## The question

The maintainer found that photos make weak puzzles. Most photos are not high contrast. With two shades (filled or blank) and heavy downsampling, the picture does not read. Average-per-cell sampling is fine; drawn puzzles were fine.

Two ideas were proposed, and both are treated here as hypotheses:

1. **Layered RGB filters with thresholds.** Threshold R, G and B separately. Each gives one monochrome puzzle. Stacked, they give up to 8 colors.
2. **Palette layering.** Pick 2 to 4 colors by closest match, with white and black as implied blanks.

"White and black as implied blanks" can mean two things. This doc calls them:

- **Reading (a):** white is the blank background. Black is an extra ink that is always available, outside the 2 to 4 chosen colors.
- **Reading (b):** white and black both count as "not a colored cell" in every layer. Cells nearest to either one are blank.

Reading (a) works with any approach. Reading (b) throws away dark pixels, so the picture's outline and shadows vanish (see the results).

A third approach came up while reading: one single color nonogram (colored clues, one grid). It is the standard color nonogram. It is called B below.

## What the research found

About 15 pages were read or searched. Several are search-engine summaries, not full reads, and are marked "snippet".

**Standard color nonograms.**
- Each clue carries a color. Runs of the same color need a gap. Runs of different colors may touch, or may not, so clues can be ambiguous about spacing. ([Wikipedia: Nonogram](https://en.wikipedia.org/wiki/Nonogram))
- The webpbn format defines colors with a name, a character and an RGB value. White is the default background. Black and white are predefined. ([webpbn format](https://webpbn.com/pbn_fmt.html))
- Conceptis' Pic-a-Pix Color uses colored clues on grids from 5x5 up to 20x20. Its touching rules are not confirmed. (snippet: [Nintendo 3DS listing, South Africa store page](https://www.nintendo.com/en-za/Games/Nintendo-3DS-download-software/Pic-a-Pix-Colour-1210586.html))

**Difficulty and solvability of color puzzles.**
- Jan Wolter's survey of solvers says color puzzles are generally easier, because the clues of different colors constrain each other. The exception is rare puzzles where touching runs leave many arrangements. webpbn allows at most five colors counting white. On its full sets, pbnsolve solved about 99.9% of black-and-white and about 99.5% of multicolor puzzles in under 0.1 s. Many multicolor puzzles there are poorly designed. ([webpbn survey](https://www.webpbn.com/survey))
- Solving colored nonograms is usually done by extending black-and-white methods, not by a different algorithm. (snippet: [Leiden thesis on colored nonograms](https://theses.liacs.nl/pdf/2019-2020-BorsPP.pdf))
- For black-and-white, plain thresholding of a gray image usually does not give a hand-solvable puzzle. It gives either several solutions or one that needs branching. The fix is a solver loop: modify cells, check again. ([Henstra, Leiden 2011](https://liacs.leidenuniv.nl/assets/Masterscripties/2011-04SjoerdHenstra.pdf), also cited in PLAN.md)

**Layered or multi-layer variants.** There is no formal standard; the name is informal. Three games use it:
- *Depixtion* (Switch, Steam). Three layers per image, each with its own color. In each layer you fill either a light or a dark shade of that color. Where filled cells of different layers overlap, the colors blend. You can switch between layers freely. Grids go up to 24x24. ([review](https://vooks.net/depixtion-switch-review))
- *Thousands of Chroma* (Steam). Classic rules unchanged. One small puzzle per color, each no larger than 16x16. Solving one finishes one color layer and the preview image builds up. (snippet: [Steam listing](https://store.steampowered.com/app/4751060))
- *Colour Cross* (DS). Multi-layered: you fill in about three grids to complete one picture. (snippet: [Games Asylum](https://www.gamesasylum.com/?p=1796))

The pattern in all three: layers are separate puzzles, one per color, played independently, and the picture builds as layers finish. This is close to the maintainer's idea 2.

**Image to palette.**
- Median cut (Heckbert, SIGGRAPH 1982) repeatedly splits the color box with the longest side at the median. It is simple and widely used. ([Microsoft Learn, archived devdev blog: Color quantization](https://learn.microsoft.com/en-us/archive/blogs/devdev/color-quantization))
- k-means is the other common choice. Seeded k-means++ starts give deterministic results.
- Lab is meant to be perceptually even, so Euclidean distance there (delta E) tracks how the eye judges difference. CIE76 is plain Euclidean distance in Lab. CIEDE2000 is more accurate and slower. ([imgix](https://imgix.com/blog/color-search))
- A study of k-means color quantization on 148 images found that the best color space depends on the image. RGB gave the best result in about half the cases. So test on real images. ([arXiv 2601.19117, "Optimized k-means color quantization of digital images in machine-based and human perception-based colorspaces"](https://arxiv.org/abs/2601.19117))
- Dithering (for example Floyd-Steinberg, the Pillow default) turns tone into scattered pixel patterns. It helps photos on screen. For nonograms it produces many short runs. The experiment below measures this.

Not tested: a fixed palette (such as the 16 named web colors), median cut, CIEDE2000, and k-means in RGB. Only seeded k-means in Lab was run.

## Experiment setup

Command, from the repo root:

```
node research/color/run.mjs
```

Optional flags: `--detail` (one row per image and approach), `--preview` (writes side-by-side PNG sheets to `research/color/out/`, gitignored), `--sizes=10,15,20`, `--no-synthetic`, and a first argument that is an image folder. Your own images go in `research/color/photos/` (gitignored); they are picked up as a separate group. See "How to run your own photos" above.

How it works:
- It imports the real `src/clues.js`, `src/solver.js` and `src/image.js` (for approach A). Everything else (cell color averages, Lab, k-means, dithering, PNG decoding) is in `research/color/` and would move into `src/image.js` in a build.
- Each image is center-cropped to a square and averaged per cell at 10, 15 and 20. Averaging is in sRGB, like the current luminance code.
- k-means runs in CIELAB with seed 1 and k-means++ starts. White is a fixed centroid that never moves; black is a second fixed centroid for readings (a) and (b).
- Solver budget is 300 search nodes per puzzle, the same for every approach. A result of `unknown` means the budget ran out. It is counted in the `unk` column and is not counted as fair.
- A sanity check throws if a `unique-line-solvable` result does not reproduce the source grid. It never fired.
- Two runs give identical output except for the final `elapsed` line. Runtime is about 3 s.

Image groups:
- **samples**: the 6 AI pixel-art PNGs in `sample-images/` (cat 10, 15, 20, 25; banana 10; spider 20).
- **synthetic**: 6 images generated in code with fixed seeds. Soft landscape and soft portrait (low contrast, photo-like gradients). A 3-color flag. Colored shapes on a light ground. Textured terrain and textured clouds (fractal noise; busy, low contrast, the hard case).
- **photos**: empty here. Your images go in this group.

Approaches (the keys in the tables):
- **A mono**: current luminance plus Otsu, drawn black on white.
- **A mono-mean**: the same puzzle as A mono, drawn in the mean source color of its inked cells and of its blank cells. A fair baseline for color error, because pure black on white loses to any approach that has a hue.
- **F dither**: Floyd-Steinberg on the cell luminance.
- **B1 kNx**: one color puzzle, white blank plus N colors, colored clues.
- **C rgb3**: the maintainer's idea 1. Otsu threshold per channel, 3 layers. An inked cell removes that channel from white paper, so the stack shows up to 8 colors.
- **D kNx**: the maintainer's idea 2. Same palette as B1, but one 0/1 layer puzzle per color.
- **E grayN**: white blank plus N-1 gray shades as one color puzzle. This is B with a palette of grays; the gray shades are a choice of palette, not a separate method.
- Suffix: `w` is white only as the fixed blank (black is just another candidate color). `a` is reading (a): black is an extra ink, so N+1 inks. `b` is reading (b): white and black are both blank, so N inks.

Metrics. Counts are printed as `n/d (p%)`, where d is the number of non-degenerate puzzles and `-` means d is 0.
- A layer is trivial when every cell has the same value. A puzzle is **degenerate** (`deg`, a count) when it has no non-trivial layer, or its inked cells cover under 5% of the grid, or all of it. A blank or fully filled grid is trivially line-solvable, so counting it as fair would reward a puzzle with no picture.
- **fair**: a unique solution was found. For layer stacks, every non-trivial layer must have one. **line**: unique and solvable by line logic alone, with no guessing. **layerfair**: fair non-trivial layers over all non-trivial layers.
- **unk**: non-degenerate puzzles where the solver budget ran out on some layer. They are not fair, so this column shows how far the budget leans against an approach.
- Degenerate puzzles are left out of fair, line, layerfair, unk, clues, max/line and sweeps. **dE** counts every puzzle: it is the mean CIE76 delta E between each cell's source color and the color the finished puzzle shows (smaller is closer). A delta E of about 2 to 3 is a just-noticeable difference (a common rule of thumb, not from the sources above).
- **clues**, **max/line** and **sweeps** are at size 15, summed or maximized over layers.

## Results

Output of `node research/color/run.mjs`, copied as printed.

### samples (6 images)

| approach | layers | fair 10 | fair 15 | fair 20 | line 10 | line 15 | line 20 | layerfair 10 | layerfair 15 | layerfair 20 | unk 10 | unk 15 | unk 20 | deg 10 | deg 15 | deg 20 | dE 10 | dE 15 | dE 20 | clues 15 | max/line 15 | sweeps 15 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A mono | 1.0 | 6/6 (100%) | 6/6 (100%) | 5/6 (83%) | 6/6 (100%) | 6/6 (100%) | 5/6 (83%) | 6/6 (100%) | 6/6 (100%) | 5/6 (83%) | 0 | 0 | 0 | 0 | 0 | 0 | 25.9 | 23.7 | 20.4 | 46 | 2.8 | 2.3 |
| A mono-mean | 1.0 | 6/6 (100%) | 6/6 (100%) | 5/6 (83%) | 6/6 (100%) | 6/6 (100%) | 5/6 (83%) | 6/6 (100%) | 6/6 (100%) | 5/6 (83%) | 0 | 0 | 0 | 0 | 0 | 0 | 7.1 | 6.3 | 2.6 | 46 | 2.8 | 2.3 |
| F dither | 1.0 | 3/6 (50%) | 5/6 (83%) | 5/6 (83%) | 3/6 (50%) | 5/6 (83%) | 5/6 (83%) | 3/6 (50%) | 5/6 (83%) | 5/6 (83%) | 0 | 0 | 0 | 0 | 0 | 0 | 27.8 | 25.9 | 23.8 | 77 | 5.3 | 3.0 |
| B1 k2w | 1.0 | 3/3 (100%) | 3/3 (100%) | 1/1 (100%) | 3/3 (100%) | 3/3 (100%) | 1/1 (100%) | 3/3 (100%) | 3/3 (100%) | 1/1 (100%) | 0 | 0 | 0 | 3 | 3 | 5 | 5.1 | 4.9 | 1.9 | 105 | 7.0 | 2.7 |
| B1 k3w | 1.0 | 2/2 (100%) | 3/3 (100%) | 1/1 (100%) | 2/2 (100%) | 3/3 (100%) | 1/1 (100%) | 2/2 (100%) | 3/3 (100%) | 1/1 (100%) | 0 | 0 | 0 | 4 | 3 | 5 | 3.2 | 2.5 | 1.1 | 127 | 9.0 | 2.3 |
| B1 k4w | 1.0 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 0/1 (0%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 0 | 0 | 0 | 5 | 5 | 5 | 2.0 | 1.7 | 0.7 | 135 | 9.0 | 3.0 |
| B1 k2a | 1.0 | 1/1 (100%) | 2/2 (100%) | 2/2 (100%) | 1/1 (100%) | 2/2 (100%) | 2/2 (100%) | 1/1 (100%) | 2/2 (100%) | 2/2 (100%) | 0 | 0 | 0 | 5 | 4 | 4 | 6.7 | 6.6 | 1.7 | 119 | 8.0 | 2.5 |
| B1 k3a | 1.0 | 1/1 (100%) | 2/2 (100%) | 1/1 (100%) | 1/1 (100%) | 2/2 (100%) | 1/1 (100%) | 1/1 (100%) | 2/2 (100%) | 1/1 (100%) | 0 | 0 | 0 | 5 | 4 | 5 | 2.9 | 2.5 | 1.2 | 125 | 9.0 | 2.0 |
| B1 k4a | 1.0 | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 0/1 (0%) | 1/1 (100%) | - | 1/1 (100%) | 0 | 0 | 0 | 5 | 6 | 5 | 1.5 | 1.5 | 0.7 | - | - | - |
| B1 k2b | 1.0 | 3/4 (75%) | 1/4 (25%) | 2/2 (100%) | 1/4 (25%) | 1/4 (25%) | 2/2 (100%) | 3/4 (75%) | 1/4 (25%) | 2/2 (100%) | 0 | 0 | 0 | 2 | 2 | 4 | 18.7 | 17.3 | 1.7 | 113 | 7.5 | 3.3 |
| B1 k3b | 1.0 | 1/1 (100%) | 2/2 (100%) | 1/1 (100%) | 1/1 (100%) | 2/2 (100%) | 1/1 (100%) | 1/1 (100%) | 2/2 (100%) | 1/1 (100%) | 0 | 0 | 0 | 5 | 4 | 5 | 2.9 | 2.5 | 1.2 | 125 | 9.0 | 2.0 |
| B1 k4b | 1.0 | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 0/1 (0%) | 1/1 (100%) | - | 1/1 (100%) | 0 | 0 | 0 | 5 | 6 | 5 | 1.5 | 1.5 | 0.7 | - | - | - |
| C rgb3 | 3.0 | 6/6 (100%) | 6/6 (100%) | 5/6 (83%) | 6/6 (100%) | 6/6 (100%) | 5/6 (83%) | 18/18 (100%) | 18/18 (100%) | 15/18 (83%) | 0 | 0 | 0 | 0 | 0 | 0 | 25.9 | 23.7 | 20.4 | 139 | 2.8 | 7.0 |
| D k2w | 2.0 | 1/3 (33%) | 0/3 (0%) | 0/1 (0%) | 1/3 (33%) | 0/3 (0%) | 0/1 (0%) | 4/6 (67%) | 2/6 (33%) | 1/2 (50%) | 0 | 0 | 0 | 3 | 3 | 5 | 5.1 | 4.9 | 1.9 | 105 | 4.3 | 5.7 |
| D k3w | 2.6 | 0/2 (0%) | 0/3 (0%) | 0/1 (0%) | 0/2 (0%) | 0/3 (0%) | 0/1 (0%) | 4/6 (67%) | 4/9 (44%) | 1/3 (33%) | 0 | 0 | 0 | 4 | 3 | 5 | 3.2 | 2.5 | 1.1 | 127 | 4.0 | 8.0 |
| D k4w | 3.2 | 0/1 (0%) | 0/1 (0%) | 0/1 (0%) | 0/1 (0%) | 0/1 (0%) | 0/1 (0%) | 3/4 (75%) | 2/4 (50%) | 1/4 (25%) | 0 | 0 | 0 | 5 | 5 | 5 | 2.0 | 1.7 | 0.7 | 135 | 4.0 | 8.0 |
| D k2a | 2.4 | 0/1 (0%) | 0/2 (0%) | 0/2 (0%) | 0/1 (0%) | 0/2 (0%) | 0/2 (0%) | 2/3 (67%) | 2/5 (40%) | 2/4 (50%) | 0 | 0 | 0 | 5 | 4 | 4 | 6.7 | 6.6 | 1.7 | 119 | 4.0 | 6.5 |
| D k3a | 2.6 | 0/1 (0%) | 0/2 (0%) | 0/1 (0%) | 0/1 (0%) | 0/2 (0%) | 0/1 (0%) | 2/3 (67%) | 3/6 (50%) | 1/3 (33%) | 0 | 0 | 0 | 5 | 4 | 5 | 2.9 | 2.5 | 1.2 | 125 | 4.0 | 9.0 |
| D k4a | 3.2 | 0/1 (0%) | - | 0/1 (0%) | 0/1 (0%) | - | 0/1 (0%) | 2/4 (50%) | - | 1/4 (25%) | 0 | 0 | 0 | 5 | 6 | 5 | 1.5 | 1.5 | 0.7 | - | - | - |
| D k2b | 2.0 | 0/4 (0%) | 0/4 (0%) | 0/2 (0%) | 0/4 (0%) | 0/4 (0%) | 0/2 (0%) | 4/8 (50%) | 2/8 (25%) | 2/4 (50%) | 0 | 0 | 0 | 2 | 2 | 4 | 18.7 | 17.3 | 1.7 | 113 | 4.3 | 5.0 |
| D k3b | 2.6 | 0/1 (0%) | 0/2 (0%) | 0/1 (0%) | 0/1 (0%) | 0/2 (0%) | 0/1 (0%) | 2/3 (67%) | 3/6 (50%) | 1/3 (33%) | 0 | 0 | 0 | 5 | 4 | 5 | 2.9 | 2.5 | 1.2 | 125 | 4.0 | 9.0 |
| D k4b | 3.2 | 0/1 (0%) | - | 0/1 (0%) | 0/1 (0%) | - | 0/1 (0%) | 2/4 (50%) | - | 1/4 (25%) | 0 | 0 | 0 | 5 | 6 | 5 | 1.5 | 1.5 | 0.7 | - | - | - |
| E gray3 | 1.0 | 4/4 (100%) | 4/4 (100%) | 1/2 (50%) | 4/4 (100%) | 4/4 (100%) | 1/2 (50%) | 4/4 (100%) | 4/4 (100%) | 1/2 (50%) | 0 | 0 | 0 | 2 | 2 | 4 | 11.7 | 11.3 | 10.5 | 107 | 7.0 | 2.5 |
| E gray4 | 1.0 | 4/4 (100%) | 4/4 (100%) | 2/2 (100%) | 4/4 (100%) | 4/4 (100%) | 1/2 (50%) | 4/4 (100%) | 4/4 (100%) | 2/2 (100%) | 0 | 0 | 0 | 2 | 2 | 4 | 10.9 | 10.5 | 10.0 | 131 | 9.0 | 2.5 |

### synthetic (6 images)

| approach | layers | fair 10 | fair 15 | fair 20 | line 10 | line 15 | line 20 | layerfair 10 | layerfair 15 | layerfair 20 | unk 10 | unk 15 | unk 20 | deg 10 | deg 15 | deg 20 | dE 10 | dE 15 | dE 20 | clues 15 | max/line 15 | sweeps 15 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A mono | 1.0 | 5/6 (83%) | 4/6 (67%) | 6/6 (100%) | 4/6 (67%) | 3/6 (50%) | 4/6 (67%) | 5/6 (83%) | 4/6 (67%) | 6/6 (100%) | 0 | 0 | 0 | 0 | 0 | 0 | 44.2 | 44.2 | 44.4 | 52 | 3.0 | 3.0 |
| A mono-mean | 1.0 | 5/6 (83%) | 4/6 (67%) | 6/6 (100%) | 4/6 (67%) | 3/6 (50%) | 4/6 (67%) | 5/6 (83%) | 4/6 (67%) | 6/6 (100%) | 0 | 0 | 0 | 0 | 0 | 0 | 16.1 | 16.5 | 17.0 | 52 | 3.0 | 3.0 |
| F dither | 1.0 | 4/6 (67%) | 3/6 (50%) | 1/6 (17%) | 4/6 (67%) | 3/6 (50%) | 1/6 (17%) | 4/6 (67%) | 3/6 (50%) | 1/6 (17%) | 0 | 0 | 2 | 0 | 0 | 0 | 46.3 | 46.2 | 46.7 | 122 | 7.2 | 3.0 |
| B1 k2w | 1.0 | 2/2 (100%) | 2/2 (100%) | 1/1 (100%) | 2/2 (100%) | 2/2 (100%) | 1/1 (100%) | 2/2 (100%) | 2/2 (100%) | 1/1 (100%) | 0 | 0 | 0 | 4 | 4 | 5 | 9.5 | 8.5 | 9.8 | 38 | 2.0 | 3.0 |
| B1 k3w | 1.0 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 0 | 0 | 0 | 5 | 5 | 5 | 6.7 | 5.6 | 6.4 | 46 | 3.0 | 2.0 |
| B1 k4w | 1.0 | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 0 | 0 | 0 | 5 | 6 | 5 | 4.6 | 4.5 | 3.7 | - | - | - |
| B1 k2a | 1.0 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 0 | 0 | 0 | 5 | 5 | 5 | 9.5 | 8.5 | 9.5 | 40 | 2.0 | 1.0 |
| B1 k3a | 1.0 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 0 | 0 | 0 | 5 | 5 | 5 | 6.7 | 5.6 | 6.4 | 46 | 3.0 | 2.0 |
| B1 k4a | 1.0 | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 0 | 0 | 0 | 5 | 6 | 5 | 4.7 | 4.5 | 3.7 | - | - | - |
| B1 k2b | 1.0 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 0 | 0 | 0 | 4 | 4 | 4 | 9.6 | 8.6 | 9.6 | 51 | 3.0 | 1.0 |
| B1 k3b | 1.0 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 0 | 0 | 0 | 5 | 5 | 5 | 6.7 | 5.6 | 6.4 | 46 | 3.0 | 2.0 |
| B1 k4b | 1.0 | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 0 | 0 | 0 | 5 | 6 | 5 | 4.7 | 4.5 | 3.7 | - | - | - |
| C rgb3 | 3.0 | 4/6 (67%) | 4/6 (67%) | 5/6 (83%) | 3/6 (50%) | 3/6 (50%) | 3/6 (50%) | 13/18 (72%) | 14/18 (78%) | 16/18 (89%) | 0 | 0 | 0 | 0 | 0 | 0 | 51.0 | 49.9 | 50.4 | 135 | 3.0 | 9.0 |
| D k2w | 2.0 | 2/2 (100%) | 2/2 (100%) | 1/1 (100%) | 2/2 (100%) | 2/2 (100%) | 1/1 (100%) | 4/4 (100%) | 4/4 (100%) | 2/2 (100%) | 0 | 0 | 0 | 4 | 4 | 5 | 9.5 | 8.5 | 9.8 | 38 | 1.5 | 4.0 |
| D k3w | 3.0 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 3/3 (100%) | 3/3 (100%) | 3/3 (100%) | 0 | 0 | 0 | 5 | 5 | 5 | 6.7 | 5.6 | 6.4 | 46 | 1.0 | 3.0 |
| D k4w | 4.0 | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 4/4 (100%) | - | 4/4 (100%) | 0 | 0 | 0 | 5 | 6 | 5 | 4.6 | 4.5 | 3.7 | - | - | - |
| D k2a | 2.2 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 0 | 0 | 0 | 5 | 5 | 5 | 9.5 | 8.5 | 9.5 | 40 | 1.0 | 2.0 |
| D k3a | 3.0 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 3/3 (100%) | 3/3 (100%) | 3/3 (100%) | 0 | 0 | 0 | 5 | 5 | 5 | 6.7 | 5.6 | 6.4 | 46 | 1.0 | 3.0 |
| D k4a | 4.0 | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 4/4 (100%) | - | 4/4 (100%) | 0 | 0 | 0 | 5 | 6 | 5 | 4.7 | 4.5 | 3.7 | - | - | - |
| D k2b | 2.0 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 4/4 (100%) | 4/4 (100%) | 4/4 (100%) | 0 | 0 | 0 | 4 | 4 | 4 | 9.6 | 8.6 | 9.6 | 51 | 2.0 | 2.5 |
| D k3b | 3.0 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) | 3/3 (100%) | 3/3 (100%) | 3/3 (100%) | 0 | 0 | 0 | 5 | 5 | 5 | 6.7 | 5.6 | 6.4 | 46 | 1.0 | 3.0 |
| D k4b | 4.0 | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 4/4 (100%) | - | 4/4 (100%) | 0 | 0 | 0 | 5 | 6 | 5 | 4.7 | 4.5 | 3.7 | - | - | - |
| E gray3 | 1.0 | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 0 | 0 | 0 | 5 | 6 | 5 | 22.5 | 23.0 | 23.3 | - | - | - |
| E gray4 | 1.0 | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 1/1 (100%) | - | 1/1 (100%) | 0 | 0 | 0 | 5 | 6 | 5 | 22.2 | 22.6 | 23.0 | - | - | - |

### Layer status counts

Over all images and the three grid sizes, non-trivial layers only. L is line-solvable, G needs guessing, M multiple solutions, ? budget ran out, X none. The last column counts trivial layers (every cell the same value), which are left out of the other columns.

samples:

| approach | layers | L | G | M | ? | X | trivial |
|---|---:|---:|---:|---:|---:|---:|---:|
| A mono | 18 | 17 | 0 | 1 | 0 | 0 | 0 |
| A mono-mean | 18 | 17 | 0 | 1 | 0 | 0 | 0 |
| F dither | 18 | 13 | 0 | 5 | 0 | 0 | 0 |
| B1 k2w | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k3w | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k4w | 18 | 17 | 1 | 0 | 0 | 0 | 0 |
| B1 k2a | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k3a | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k4a | 18 | 17 | 1 | 0 | 0 | 0 | 0 |
| B1 k2b | 18 | 12 | 2 | 4 | 0 | 0 | 0 |
| B1 k3b | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k4b | 18 | 17 | 1 | 0 | 0 | 0 | 0 |
| C rgb3 | 54 | 51 | 0 | 3 | 0 | 0 | 0 |
| D k2w | 36 | 24 | 2 | 10 | 0 | 0 | 0 |
| D k3w | 47 | 25 | 4 | 18 | 0 | 0 | 0 |
| D k4w | 58 | 31 | 5 | 22 | 0 | 0 | 0 |
| D k2a | 43 | 26 | 2 | 15 | 0 | 0 | 0 |
| D k3a | 47 | 28 | 2 | 17 | 0 | 0 | 0 |
| D k4a | 58 | 32 | 3 | 23 | 0 | 0 | 0 |
| D k2b | 36 | 20 | 1 | 15 | 0 | 0 | 0 |
| D k3b | 47 | 28 | 2 | 17 | 0 | 0 | 0 |
| D k4b | 58 | 32 | 3 | 23 | 0 | 0 | 0 |
| E gray3 | 18 | 17 | 0 | 1 | 0 | 0 | 0 |
| E gray4 | 18 | 17 | 1 | 0 | 0 | 0 | 0 |

synthetic:

| approach | layers | L | G | M | ? | X | trivial |
|---|---:|---:|---:|---:|---:|---:|---:|
| A mono | 18 | 11 | 4 | 3 | 0 | 0 | 0 |
| A mono-mean | 18 | 11 | 4 | 3 | 0 | 0 | 0 |
| F dither | 18 | 8 | 0 | 8 | 2 | 0 | 0 |
| B1 k2w | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k3w | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k4w | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k2a | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k3a | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k4a | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k2b | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k3b | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| B1 k4b | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| C rgb3 | 54 | 36 | 7 | 11 | 0 | 0 | 0 |
| D k2w | 36 | 28 | 2 | 6 | 0 | 0 | 0 |
| D k3w | 54 | 40 | 1 | 12 | 1 | 0 | 0 |
| D k4w | 72 | 48 | 1 | 18 | 5 | 0 | 0 |
| D k2a | 39 | 31 | 2 | 6 | 0 | 0 | 0 |
| D k3a | 54 | 40 | 1 | 12 | 1 | 0 | 0 |
| D k4a | 72 | 48 | 1 | 18 | 5 | 0 | 0 |
| D k2b | 36 | 28 | 2 | 6 | 0 | 0 | 0 |
| D k3b | 54 | 40 | 1 | 12 | 1 | 0 | 0 |
| D k4b | 72 | 48 | 1 | 18 | 5 | 0 | 0 |
| E gray3 | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| E gray4 | 18 | 18 | 0 | 0 | 0 | 0 | 0 |

### What the numbers say

All figures are at grid size 15 unless stated. Every group has 6 images, so one image moves a percentage by 17 points. Read the counts.

- **Most color-palette puzzles here are degenerate, and the likely cause is the blank rule.** In B, D and E the blank is a fixed pure-white centroid. The sample images have a cream background, and most synthetic images have no pure white. In the degenerate puzzles no cell is assigned to white, so the grid has no blank cell at all. In B1 k3w, 3 of 6 samples and 5 of 6 synthetic images are degenerate; in B1 k4w, 5 of 6 and 6 of 6. Gray shades (E gray4) are degenerate in 2 of 6 samples and 6 of 6 synthetic images. The earlier version of this doc counted those full grids as fair. The `--detail` output shows `ink% 100` for them. The fair figures for B, D and E below therefore rest on very few puzzles (often 1 to 3), and on the synthetic images B k4 and E have none at size 15.
- **Where B has a non-degenerate puzzle, it was usually fair.** B1 k3w: 3/3 on samples, 1/1 on synthetic. Two exceptions: reading (b) at k=2 on samples (1/4 fair at size 15), and one B1 k4w puzzle on samples at size 20 that was unique but needed guessing (line 0/1). This is a small sample, and the non-degenerate puzzles are the ones where the image had a light background.
- **Color match favors B over every two-tone variant, including the fair baseline.** Mean delta E at k=3: 2.5 on samples and 5.6 on synthetic, against 6.3 and 16.5 for A mono-mean, and 23.7 and 44.2 for A mono. Most of the gap between B and plain mono on synthetic (5.6 against 44.2) is closed by drawing mono in its own mean colors (16.5), so the A mono rows overstate B's lead. dE counts every puzzle, including degenerate ones, so for B it partly measures a k-color reduction of the picture with no blank.
- **The same colors split into independent layers (D) are less fair on samples.** At k=3: 0/3 stacks fair against 3/3 for B, and 4/9 (44%) layers fair. The clue count is the same as in B (127). What D loses is the information that crosses colors: which cell holds which color, and in what order runs sit. A layer alone cannot use it. A solver that treated the stack as one puzzle would recover it, but `src/solver.js` does not do that. On synthetic, D k3w has one non-degenerate puzzle (1/1 fair), so there is no comparison.
- **RGB threshold layers (C) are the worst on fidelity.** Mean delta E is about 50 on synthetic (49.9 at size 15), above plain mono (44.2) and far above A mono-mean (16.5). Per-channel Otsu on soft images gives saturated, arbitrary hues, and only 3 layers of 0/1. Fairness is no better than mono: 4/6 (67%) for both.
- **C equals A on the two-color samples, and the reason is the images.** The samples are dark ink on cream. Every inked cell is dark in all three channels and every blank cell is light in all three, so the three layers are identical copies of the mono puzzle. Fair, line and dE match A mono exactly (6/6, 6/6, 23.7). Only the clue count differs (139 against 46), because the same clues are repeated three times.
- **Gray shades (E) cost the same clues as color, but the hue is gone.** On the samples E gray4 has dE 10.5, against 2.5 for B1 k3w and 6.3 for A mono-mean. On synthetic it is 22.6 against 5.6 for B1 k3w, with every puzzle degenerate at size 15 (the deg column), so its fairness there is not measured at that size. E is a palette choice inside B, not a separate method.
- **Dithering (F) hurts.** Clues at size 15 go from 52 to 122 on synthetic (77 against 46 on samples). Fair falls to 1/6 (17%) at size 20 on synthetic, with 2 puzzles where the budget ran out. A dithered portrait is a checkerboard on the preview sheet. Do not dither.
- **Black rule.** Readings (a) and (b) only differ where dark pixels exist. On the samples (dark ink on cream) at k=2, (b) turns the ink blank: delta E 17.3 against 6.6 for (a), and 1/4 fair against 2/2 (the deg column shows 2 degenerate puzzles for (b) and 4 for (a)). On the synthetic images there is almost no dark ink, so the two readings give the same dE (for example 5.6 at k=3). Reading (b) loses outlines. Reading (a) costs one extra ink (a layer, or a palette slot) and keeps them.
- **Layer count.** Layers in D grow with k (3.0 at k=3 and 4.0 at k=4 on synthetic, 3.2 at k=4 on samples). More layers means more places for a stack to fail.
- **Solver budget.** `unk` is 0 for every approach except dithering (2 puzzles at size 20, synthetic). In the layer counts, `?` also appears for D on synthetic (1 at k=3w, 5 at k=4w). Those layers sit in degenerate puzzles, which `unk` leaves out. Larger color puzzles were not tested.

### What the samples and synthetic images can and cannot show

The 6 sample images are AI pixel art with exactly two colors each (dark ink on cream; the banana is ochre on cream). They are already monochrome puzzles. They show how the approaches behave on clean art and how they handle near-black ink. They say nothing about photos. Where k-means splits a two-color image into extra clusters (the D layer failures), that is a limit of forcing k colors on an image that has fewer.

The synthetic images are a stand-in for photos. They are generated gradients and fractal noise, and real photos have faces, edges and fine texture. No photos have been tested. Nothing in this doc is a claim about photos. "Fair" also does not measure whether the picture reads well. The `--preview` sheets let a person judge that.

**The real test is your own photos in `research/color/photos/`.** Run the script with 5 to 10 PNGs, read the `photos` tables, check the `deg` column first, and open the sheets from `--preview`.

## The approaches, one by one

### B. One color puzzle, palette of 2 to 4 colors plus white

- **Play.** One grid. The player picks a color from a small palette, then fills. Clues are colored numbers. Different colors may touch.
- **Palette picker.** Needed in Play and in Create: 2 to 5 swatches, a selected color, keyboard keys 1 to 5. Left-click fills the selected color, right-click crosses. The existing backlog item "left-clear removes any filled color, not just the start cell's color" must be decided.
- **Hearts.** A wrong color counts like a wrong fill. A cross on a colored cell is a mistake, as now.
- **Clue rendering.** Colored numbers need readable contrast on the page background and in each theme. Colors should also be told apart without color vision (letter, pattern or number on the swatch). This is a gap that was not tested.
- **Personas.** `src/personas.js` reads run lengths only and returns no tier for multi-color puzzles. B needs color-aware line techniques (already a backlog item), or a stopgap label such as "color, unrated". The solver verdict (fair, line-solvable) already works for color.
- **Data model.** Fits as is. D2 already has `palette: [{name, hex}]` and an index grid, and `MAX_PALETTE` is 30. `src/clues.js`, `src/solver.js`, `src/webpbn.js` (color export) and `src/clue-progress.js` are color-aware. No new record kind.
- **Blank cells.** With a fixed white blank, an image without white gets a full grid and no blank cell (see the first bullet under "What the numbers say"). A build needs a rule for the blank: take the most common cluster as blank, let the user pick it, or allow full-grid color puzzles on purpose.
- **Fairness and fidelity.** Fair in most non-degenerate runs, which are few (see above); the exception is reading (b) at k=2 on samples. Mean delta E 4.9, 2.5 and 1.7 for k=2, 3, 4 on samples and 8.5, 5.6 and 4.5 on synthetic at size 15, against 16.5 for A mono-mean and 44.2 for A mono on synthetic.
- **Costs.** Palette picker and color painting in Play and Create; color clues in `src/views/grid.js`; color-aware personas; Create's cell editor needs a color brush; image creation needs the quantizer from `research/color/`. Tile sets share one palette in `src/tiles.js` (backlog); that works if the whole image is quantized once.

### E. Gray shades (a palette choice inside B)

Same machinery as B with a palette of grays. It adds no code once B exists. Fidelity is no better than 22.6 on synthetic (10.5 on samples), because the hue is gone. Most of its puzzles are degenerate under the white-blank rule, so its fairness is not established. It fits drawn puzzles and photos where hue does not matter.

### D. Palette layers, one 0/1 puzzle per color

- **Play.** A stack of monochrome puzzles, solved one after another or switched between freely (as in Depixtion). Each layer is the current play UI with its own color. The combined picture appears as layers finish.
- **Relation to tile sets.** Today a set groups puzzles that tile one picture side by side (`set: {id, row, col}`) and D24 reveals the combined photo when the set is finished. A layer stack has the same footprint stacked on top of each other, so tiling logic does not fit. It needs a new relation (for example `set.kind = 'layers'` with `layer` index) and a compositing reveal instead of a tiling one. The reveal code was not read in detail.
- **Palette picker.** Not needed inside a layer. Needed only to show which layer is active.
- **Hearts.** Per layer, or shared across the stack: a decision for the maintainer.
- **Clue rendering.** Existing, one color per layer.
- **Personas.** Work unchanged per layer. A stack's tier would be the hardest layer's tier.
- **Data model.** Layers could be ordinary 1-color puzzles with a palette of one color, grouped by a new set kind. Validators in `src/format.js` and the store's record kinds need to learn the new kind.
- **Fairness and fidelity.** Fidelity equals B (same palette). Fairness is lower on samples: 0/3 stacks fair at k=3, 4/9 layers fair. On synthetic the evidence is one puzzle. A stack could be made fair by checking it as one puzzle, which needs a solver change.
- **Costs.** New record kind, new reveal, a layer switcher, a joint solver check to make fairness honest. Larger than B.

### C. RGB threshold layers

- **Play.** Same as D with three layers (cyan, magenta, yellow ink on white in this experiment).
- **Fairness and fidelity.** Worst of all approaches on fidelity (delta E 49.9 on synthetic at size 15; mono is 44.2). Fairness 4/6 (67%) at size 15 on synthetic, the same as mono. The hues are decided by the channel thresholds, not by the picture, so a green leaf and a grey wall can end up the same.
- **Costs.** Same as D. No reason to prefer it. Not recommended.

### F. Dithering

Not a layering approach, but tested because it is the usual answer to "two shades". It makes puzzles harder and noisier (see numbers above). Not recommended.

## Recommendation

B is still the first candidate to build, but with less certainty than the first version of this doc claimed, and with one open design question that comes first.

**Build B first: one color nonogram with a 2 to 4 color palette plus white, quantized by k-means in CIELAB, with black as an optional extra ink (reading (a)).** The reasons that still hold: it has the closest color match of the variants tested (delta E 5.6 at k=3 on synthetic, against 16.5 for mono drawn in its own mean colors and 44.2 for mono drawn in black), it needs no new data model, and it is the standard color nonogram that players already know. Gray shades (E) come free as a palette choice of B.

What changed: B is not "the only approach that stayed fair". Gray shades (E gray4) were fair in every non-degenerate sample puzzle (4/4, 4/4 and 2/2 at sizes 10, 15, 20), and mono was fair in 6/6 sample puzzles at size 15. The earlier B fairness figures also counted full grids with no blank cell, so B has been tested on few puzzles that have a real blank. The gray shades are a palette choice of B, so this is a result about one variant of B, not a different method. No claim is made about photos, since none were tested.

What must be settled before a build: the blank rule. A fixed white blank gives full grids on images without a white background, which is most photos. Choose one of: the most common cluster is the blank; the user picks the blank in Create; full-grid color puzzles are allowed on purpose. Then re-run the experiment on photos and check that the `deg` column is low.

Drop RGB threshold layers (C), drop dithering (F), and do not use reading (b).

Treat palette layers (D) as an optional second stage. They follow a real pattern in layered games, and they would reuse the monochrome UI and personas. But they need a new set kind, a new reveal and a joint solver check, and on the samples they were less fair as independent layers (0/3 stacks at k=3). Do not start them until B has been played on real photos.

## Risks

- **Weak evidence for photos.** No photos were tested. The photo-like images here are synthetic, and most of their color-palette puzzles are degenerate. Run on real photos first.
- **Tiny counts.** Every group has 6 images, and after degenerate puzzles are removed many cells rest on 1 to 3 puzzles. Percentages from them are not stable.
- **Fair does not mean pleasant.** More colors means more clues per line (max per line at size 15 on the samples is 9.0 for B1 k4w and 2.8 for A mono). The per-puzzle effort for a player is higher than the fair figures suggest.
- **Palette legibility.** k-means can pick colors that are close in Lab or hard to tell apart for some players. A minimum distance between palette colors and a non-color cue is not built or measured.
- **Color profiles.** Photos from phones may carry a Display-P3 profile. The script reads them as sRGB, so their colors shift slightly.
- **Personas lag.** Color puzzles have no difficulty tier until the personas learn color. The library label needs a stopgap.
- **Solver budget.** 300 nodes left almost no `unknown` here (see the `unk` column). Larger color puzzles (25x25, 5 colors) are not tested.
- **Scope of the flag.** `?features=color` stores a pref in this browser only and reveals nothing in the UI. Nothing reads it yet.

## D25: most common color as the blank (2026-10-22)

The maintainer chose decision 2: the most common color is the blank, with 3 to 5 colors in total. The script now has two more approaches:

- **G kN**: N colors in total, seeded k-means in Lab with no fixed anchor. The largest cluster is the blank; the others are inks. The finished picture shows blank cells in the blank cluster's own color.
- **Gm kN**: the shipped quantizer, `quantizeColors` in `src/color.js`. G plus one step: any two colors closer than delta E 15 (`MERGE_DE`) are merged, so N is a maximum.

The `--detail` table has a `minpal` column: the smallest delta E between two colors of the palette, blank included. Run `node research/color/run.mjs` for the full tables; the rows below are copied from it (sizes 10, 15, 20).

| group | approach | fair 10 | fair 15 | fair 20 | line 15 | deg 15 | dE 15 | clues 15 | max/line 15 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| samples | A mono-mean | 6/6 (100%) | 6/6 (100%) | 5/6 (83%) | 6/6 (100%) | 0 | 6.3 | 46 | 2.8 |
| samples | G k3 | 4/6 (67%) | 4/6 (67%) | 3/6 (50%) | 3/6 (50%) | 0 | 3.1 | 77 | 5.0 |
| samples | G k5 | 5/6 (83%) | 5/6 (83%) | 3/6 (50%) | 3/6 (50%) | 0 | 0.7 | 109 | 7.3 |
| samples | Gm k3 | 4/6 (67%) | 4/6 (67%) | 3/6 (50%) | 4/6 (67%) | 0 | 2.6 | 85 | 5.2 |
| samples | Gm k4 | 5/6 (83%) | 5/6 (83%) | 3/6 (50%) | 4/6 (67%) | 0 | 1.6 | 98 | 6.3 |
| samples | Gm k5 | 5/6 (83%) | 4/6 (67%) | 3/6 (50%) | 3/6 (50%) | 0 | 1.0 | 104 | 7.0 |
| synthetic | A mono-mean | 5/6 (83%) | 4/6 (67%) | 6/6 (100%) | 3/6 (50%) | 0 | 16.5 | 52 | 3.0 |
| synthetic | G k3 | 5/6 (83%) | 4/6 (67%) | 4/6 (67%) | 4/6 (67%) | 0 | 6.2 | 64 | 3.8 |
| synthetic | G k5 | 5/6 (83%) | 4/6 (67%) | 5/6 (83%) | 4/6 (67%) | 0 | 3.9 | 110 | 7.2 |
| synthetic | Gm k3 | 4/5 (80%) | 4/5 (80%) | 4/5 (80%) | 4/5 (80%) | 1 | 6.5 | 57 | 3.4 |
| synthetic | Gm k4 | 4/5 (80%) | 5/5 (100%) | 4/5 (80%) | 4/5 (80%) | 1 | 5.3 | 69 | 4.6 |
| synthetic | Gm k5 | 4/5 (80%) | 4/5 (80%) | 4/5 (80%) | 4/5 (80%) | 1 | 4.9 | 79 | 5.2 |

What it shows:

- **The blank problem is gone.** No G puzzle is degenerate (0 of 6 at every size), against 4 to 6 of 6 for B with the white blank. The blank holds at least 1/N of the cells by construction, so a grid is never fully inked.
- **Fairness on photo-like images is about two-tone's.** On synthetic at size 15, Gm is fair in 4/5 to 5/5 non-degenerate puzzles against 4/6 for mono. On the samples it is lower than mono (4/6 or 5/6 against 6/6): those images have two colors, and extra clusters split the antialiased edges into short runs. Two-tone stays the right choice for them.
- **Color match is much closer.** dE 4.9 to 6.5 on synthetic at size 15 against 16.5 for mono drawn in its own mean colors.
- **The merge is needed.** Without it, k-means at k=5 put two colors of the clouds image 2.4 apart (`minpal`), which no player could tell apart in a cell. With it, every kept pair is at least 15 apart (the smallest on the samples is 16.2). The cost: the clouds image, low contrast all over, merges to one color and gives an empty grid at every k (the 1 in `deg`). Create says so and suggests Two-tone.
- **More colors means more clues.** At size 15 the max per line rises from 3.0 (mono) to 5.2 (Gm k5) on synthetic, and the terrain texture reaches 11 at k=5 (Gm). Expect busier lines than two-tone.

Still not tested on real photos (none are in the repo). The verdicts above are the solver's; how the puzzles feel is the hands-on test.

## Decisions for the maintainer before a build plan

1. Is B (one color puzzle) the first build, with layers (D) deferred?
2. How is the blank cell chosen: the most common cluster, picked by the user, or no blank on purpose? This comes before the build plan. **Decided 2026-10-22 (D25): the most common color, 3 to 5 colors in total.**
3. How many colors by default and at most per puzzle: 2 to 4 plus white, as researched, or more? (webpbn caps at 5 counting white; the format here allows 30.)
4. Black: reading (a), an extra ink that is always available. Confirm, and confirm reading (b) is out.
5. Is the palette chosen automatically from the image with a short editor in Create, or must the user pick it by hand?
6. Difficulty for color puzzles: build color-aware personas first, or ship with a stopgap label?
7. Hearts and mistakes: is a wrong color a mistake like a wrong fill?
8. Color-blind support: add a letter or pattern on swatches and clues now, or later?
9. Left-clear rule in Play (backlog): does clearing remove any color or only the start cell's color?
10. Run the experiment on 5 to 10 real photos before the build plan is written?
11. Layers (D): drop, or revisit after B has been used?
