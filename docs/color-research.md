# Color mode research: how to layer color into puzzles

Date: 2026-10-14. Branch `color-research`. Nothing in `src/` changed except the hidden flag (`src/features.js`, `?features=color` after the hash) and a one-line router change. No color UI exists yet.

## The question

The owner found that photos make weak puzzles. Most photos are not high contrast. With two shades (filled or blank) and heavy downsampling, the picture does not read. Average-per-cell sampling is fine; drawn puzzles were fine.

Two ideas were proposed, and both are treated here as hypotheses:

1. **Layered RGB filters with thresholds.** Threshold R, G and B separately. Each gives one monochrome puzzle. Stacked, they give up to 8 colors.
2. **Palette layering.** Pick 2 to 4 colors by closest match, with white and black as implied blanks.

"White and black as implied blanks" can mean two things. This doc calls them:

- **Reading (a):** white is the blank background. Black is an extra ink that is always available, outside the 2 to 4 chosen colors.
- **Reading (b):** white and black both count as "not a colored cell" in every layer. Cells nearest to either one are blank.

Reading (a) works with any approach. Reading (b) throws away dark pixels, so the picture's outline and shadows vanish (see the results).

A third approach came up while reading: one single color nonogram (colored clues, one grid). It is the standard color nonogram. It is called B below.

## What the research found

I read or searched about 15 pages. Several are search-engine summaries, not full reads, and are marked "snippet". Easybrain's help page returned 403 and was dropped.

**Standard color nonograms.**
- Each clue carries a color. Runs of the same color need a gap. Runs of different colors may touch, or may not, so clues can be ambiguous about spacing. ([Wikipedia: Nonogram](https://en.wikipedia.org/wiki/Nonogram))
- The webpbn format defines colors with a name, a character and an RGB value. White is the default background. Black and white are predefined. ([webpbn format](https://webpbn.com/pbn_fmt.html))
- Conceptis' Pic-a-Pix Color uses colored clues on grids from 5x5 up to 20x20. I could not confirm its touching rules. (snippet: [Nintendo listing](https://www.nintendo.com/en-za/Games/Nintendo-3DS-download-software/Pic-a-Pix-Colour-1210586.html))

**Difficulty and solvability of color puzzles.**
- Jan Wolter's survey of solvers says color puzzles are generally easier, because the clues of different colors constrain each other. The exception is rare puzzles where touching runs leave many arrangements. webpbn allows at most five colors counting white. On its full sets, pbnsolve solved about 99.9% of black-and-white and about 99.5% of multicolor puzzles in under 0.1 s. Many multicolor puzzles there are poorly designed. ([webpbn survey](https://www.webpbn.com/survey))
- Solving colored nonograms is usually done by extending black-and-white methods, not by a different algorithm. (snippet: [Leiden thesis on colored nonograms](https://theses.liacs.nl/pdf/2019-2020-BorsPP.pdf))
- For black-and-white, plain thresholding of a gray image usually does not give a hand-solvable puzzle. It gives either several solutions or one that needs branching. The fix is a solver loop: modify cells, check again. ([Henstra, Leiden 2011](https://liacs.leidenuniv.nl/assets/Masterscripties/2011-04SjoerdHenstra.pdf), also cited in PLAN.md)

**Layered or multi-layer variants.** There is no formal standard; the name is informal. Three games use it:
- *Depixtion* (Switch, Steam). Three layers per image, each with its own color. In each layer you fill either a light or a dark shade of that color. Where filled cells of different layers overlap, the colors blend. You can switch between layers freely. Grids go up to 24x24. ([review](https://vooks.net/depixtion-switch-review))
- *Thousands of Chroma* (Steam). Classic rules unchanged. One small puzzle per color, each no larger than 16x16. Solving one finishes one color layer and the preview image builds up. (snippet: [Steam listing](https://store.steampowered.com/app/4751060?l=malay))
- *Colour Cross* (DS). Multi-layered: you fill in about three grids to complete one picture. (snippet: [Games Asylum](https://www.gamesasylum.com/?p=1796))

The pattern in all three: layers are separate puzzles, one per color, played independently, and the picture builds as layers finish. This is close to the owner's idea 2.

**Image to palette.**
- Median cut (Heckbert, 1980) repeatedly splits the color box with the longest side at the median. It is simple and widely used. ([Microsoft devblog summary](https://learn.microsoft.com/it-it/archive/blogs/devdev/color-quantization))
- k-means is the other common choice. Seeded k-means++ starts give deterministic results.
- Lab is meant to be perceptually even, so Euclidean distance there (delta E) tracks how the eye judges difference. CIE76 is plain Euclidean distance in Lab. CIEDE2000 is more accurate and slower. ([imgix](https://imgix.com/blog/color-search))
- A recent study found the best color space for k-means quantization depends on the image. About half the time RGB won. So test on real images. ([arXiv 2601.19117 summary](https://fugumt.com/fugumt/paper_check/2601.19117v2))
- Dithering (for example Floyd-Steinberg, the Pillow default) turns tone into scattered pixel patterns. It helps photos on screen. For nonograms it produces many short runs. The experiment below measures this.

Not tested: a fixed palette (such as the 16 named web colors), median cut, CIEDE2000, and k-means in RGB. Only seeded k-means in Lab was run.

## Experiment setup

Command, from the repo root:

```
node research/color/run.mjs
```

Optional flags: `--detail` (one row per image and approach), `--preview` (writes side-by-side PNG sheets to `research/color/out/`, gitignored), `--sizes=10,15,20`, `--no-synthetic`, and a first argument that is an image folder. The owner's own images go in `research/color/photos/` (gitignored); they are picked up as a separate group. The decoder reads PNG only (8-bit, not interlaced), so convert JPEGs to PNG first.

How it works:
- It imports the real `src/clues.js`, `src/solver.js` and `src/image.js` (for approach A). Everything else (cell color averages, Lab, k-means, dithering, PNG decoding) is in `research/color/` and would move into `src/image.js` in a build.
- Each image is center-cropped to a square and averaged per cell at 10, 15 and 20. Averaging is in sRGB, like the current luminance code.
- k-means runs in CIELAB with seed 1 and k-means++ starts. White is a fixed centroid that never moves; black is a second fixed centroid for readings (a) and (b).
- Solver budget is 300 search nodes per puzzle, the same for every approach. A result of `unknown` would mean the budget ran out. The status tables below show it almost never happens.
- A sanity check throws if a `unique-line-solvable` result does not reproduce the source grid. It never fired.
- Two runs give byte-identical output (checked with `--detail`). Runtime is about 4 s.

Image groups:
- **samples**: the 6 AI pixel-art PNGs in `sample-images/` (cat 10, 15, 20, 25; banana 10; spider 20).
- **synthetic**: 6 images generated in code with fixed seeds. Soft landscape and soft portrait (low contrast, photo-like gradients). A 3-color flag. Colored shapes on a light ground. Textured terrain and textured clouds (fractal noise; busy, low contrast, the hard case).
- **photos**: empty here. The owner's images go in this group.

Approaches (the keys in the tables):
- **A mono**: current luminance plus Otsu.
- **F dither**: Floyd-Steinberg on the cell luminance.
- **B1 kNx**: one color puzzle, white blank plus N colors, colored clues.
- **C rgb3**: owner idea 1. Otsu threshold per channel, 3 layers. An inked cell removes that channel from white paper, so the stack shows up to 8 colors.
- **D kNx**: owner idea 2. Same palette as B1, but one 0/1 layer puzzle per color.
- **E grayN**: white blank plus N-1 gray shades as one color puzzle.
- Suffix: `w` is white only as the fixed blank (black is just another candidate color). `a` is reading (a): black is an extra ink, so N+1 inks. `b` is reading (b): white and black are both blank, so N inks.

Metrics: **fair%** is the share of images whose puzzle has a unique solution (for layer stacks, every layer must). **line%** is unique and solvable by line logic alone, with no guessing. **layerfair%** is the share of individual layers that are fair. **dE** is the mean CIE76 delta E between each cell's source color and the color the finished puzzle shows (smaller is closer). **clues**, **max/line** and **sweeps** are at size 15, summed or maximized over layers. A delta E of about 2 to 3 is a just-noticeable difference (a common rule of thumb, not from the sources above).

## Results

Output of `node research/color/run.mjs`, copied as printed.

### samples (6 images)

| approach | layers | fair% 10 | fair% 15 | fair% 20 | line% 10 | line% 15 | line% 20 | layerfair% 10 | layerfair% 15 | layerfair% 20 | dE 10 | dE 15 | dE 20 | clues 15 | max/line 15 | sweeps 15 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A mono | 1.0 | 100 | 100 | 83 | 100 | 100 | 83 | 100 | 100 | 83 | 25.9 | 23.7 | 20.4 | 46 | 2.8 | 2.3 |
| F dither | 1.0 | 50 | 83 | 83 | 50 | 83 | 83 | 50 | 83 | 83 | 27.8 | 25.9 | 23.8 | 77 | 5.3 | 3.0 |
| B1 k2w | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 5.1 | 4.9 | 1.9 | 98 | 6.3 | 1.8 |
| B1 k3w | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 3.2 | 2.5 | 1.1 | 125 | 8.2 | 1.7 |
| B1 k4w | 1.0 | 100 | 100 | 100 | 100 | 100 | 83 | 100 | 100 | 100 | 2.0 | 1.7 | 0.7 | 142 | 8.8 | 1.3 |
| B1 k2a | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 6.7 | 6.6 | 1.7 | 123 | 7.5 | 1.5 |
| B1 k3a | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 2.9 | 2.5 | 1.2 | 130 | 8.2 | 1.3 |
| B1 k4a | 1.0 | 100 | 100 | 100 | 100 | 100 | 83 | 100 | 100 | 100 | 1.5 | 1.5 | 0.7 | 150 | 9.2 | 1.0 |
| B1 k2b | 1.0 | 83 | 50 | 100 | 50 | 50 | 100 | 83 | 50 | 100 | 18.7 | 17.3 | 1.7 | 103 | 6.7 | 2.5 |
| B1 k3b | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 2.9 | 2.5 | 1.2 | 130 | 8.2 | 1.3 |
| B1 k4b | 1.0 | 100 | 100 | 100 | 100 | 100 | 83 | 100 | 100 | 100 | 1.5 | 1.5 | 0.7 | 150 | 9.2 | 1.0 |
| C rgb3 | 3.0 | 100 | 100 | 83 | 100 | 100 | 83 | 100 | 100 | 83 | 25.9 | 23.7 | 20.4 | 139 | 2.8 | 7.0 |
| D k2w | 2.0 | 50 | 50 | 50 | 50 | 50 | 50 | 75 | 67 | 75 | 5.1 | 4.9 | 1.9 | 98 | 3.8 | 5.2 |
| D k3w | 2.6 | 17 | 17 | 33 | 17 | 17 | 33 | 69 | 56 | 67 | 3.2 | 2.5 | 1.1 | 125 | 3.8 | 7.0 |
| D k4w | 3.2 | 17 | 17 | 33 | 17 | 17 | 33 | 75 | 58 | 63 | 2.0 | 1.7 | 0.7 | 142 | 3.8 | 8.5 |
| D k2a | 2.4 | 17 | 33 | 33 | 17 | 33 | 33 | 69 | 64 | 67 | 6.7 | 6.6 | 1.7 | 123 | 3.8 | 6.0 |
| D k3a | 2.6 | 17 | 17 | 33 | 17 | 17 | 33 | 69 | 61 | 67 | 2.9 | 2.5 | 1.2 | 130 | 3.8 | 7.0 |
| D k4a | 3.2 | 17 | 17 | 33 | 17 | 17 | 33 | 71 | 58 | 63 | 1.5 | 1.5 | 0.7 | 150 | 3.8 | 8.7 |
| D k2b | 2.0 | 17 | 33 | 33 | 17 | 33 | 33 | 58 | 50 | 67 | 18.7 | 17.3 | 1.7 | 103 | 3.8 | 4.8 |
| D k3b | 2.6 | 17 | 17 | 33 | 17 | 17 | 33 | 69 | 61 | 67 | 2.9 | 2.5 | 1.2 | 130 | 3.8 | 7.0 |
| D k4b | 3.2 | 17 | 17 | 33 | 17 | 17 | 33 | 71 | 58 | 63 | 1.5 | 1.5 | 0.7 | 150 | 3.8 | 8.7 |
| E gray3 | 1.0 | 100 | 100 | 83 | 100 | 100 | 83 | 100 | 100 | 83 | 11.7 | 11.3 | 10.5 | 100 | 6.3 | 2.0 |
| E gray4 | 1.0 | 100 | 100 | 100 | 100 | 100 | 83 | 100 | 100 | 100 | 10.9 | 10.5 | 10.0 | 120 | 8.0 | 2.0 |

### synthetic (6 images)

| approach | layers | fair% 10 | fair% 15 | fair% 20 | line% 10 | line% 15 | line% 20 | layerfair% 10 | layerfair% 15 | layerfair% 20 | dE 10 | dE 15 | dE 20 | clues 15 | max/line 15 | sweeps 15 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A mono | 1.0 | 83 | 67 | 100 | 67 | 50 | 67 | 83 | 67 | 100 | 44.2 | 44.2 | 44.4 | 52 | 3.0 | 3.0 |
| F dither | 1.0 | 67 | 50 | 17 | 67 | 50 | 17 | 67 | 50 | 17 | 46.3 | 46.2 | 46.7 | 122 | 7.2 | 3.0 |
| B1 k2w | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 9.5 | 8.5 | 9.8 | 73 | 4.0 | 1.7 |
| B1 k3w | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 6.7 | 5.6 | 6.4 | 111 | 6.3 | 1.2 |
| B1 k4w | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 4.6 | 4.5 | 3.7 | 141 | 7.5 | 1.0 |
| B1 k2a | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 9.5 | 8.5 | 9.5 | 80 | 4.5 | 1.0 |
| B1 k3a | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 6.7 | 5.6 | 6.4 | 112 | 6.2 | 1.2 |
| B1 k4a | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 4.7 | 4.5 | 3.7 | 141 | 7.5 | 1.0 |
| B1 k2b | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 9.6 | 8.6 | 9.6 | 78 | 4.3 | 1.0 |
| B1 k3b | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 6.7 | 5.6 | 6.4 | 112 | 6.2 | 1.2 |
| B1 k4b | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 4.7 | 4.5 | 3.7 | 141 | 7.5 | 1.0 |
| C rgb3 | 3.0 | 67 | 67 | 83 | 50 | 50 | 50 | 72 | 78 | 89 | 51.0 | 49.9 | 50.4 | 135 | 3.0 | 9.0 |
| D k2w | 2.0 | 67 | 83 | 67 | 67 | 67 | 67 | 75 | 92 | 83 | 9.5 | 8.5 | 9.8 | 73 | 2.3 | 6.0 |
| D k3w | 3.0 | 67 | 67 | 67 | 67 | 67 | 67 | 83 | 72 | 72 | 6.7 | 5.6 | 6.4 | 111 | 2.8 | 8.2 |
| D k4w | 4.0 | 50 | 67 | 67 | 50 | 67 | 67 | 67 | 71 | 67 | 4.6 | 4.5 | 3.7 | 141 | 3.2 | 9.3 |
| D k2a | 2.2 | 67 | 83 | 67 | 67 | 67 | 67 | 75 | 92 | 83 | 9.5 | 8.5 | 9.5 | 80 | 2.5 | 5.7 |
| D k3a | 3.0 | 67 | 67 | 67 | 67 | 67 | 67 | 83 | 72 | 72 | 6.7 | 5.6 | 6.4 | 112 | 2.8 | 7.3 |
| D k4a | 4.0 | 50 | 67 | 67 | 50 | 67 | 67 | 67 | 71 | 67 | 4.7 | 4.5 | 3.7 | 141 | 3.2 | 9.3 |
| D k2b | 2.0 | 67 | 83 | 67 | 67 | 67 | 67 | 75 | 92 | 83 | 9.6 | 8.6 | 9.6 | 78 | 2.5 | 5.5 |
| D k3b | 3.0 | 67 | 67 | 67 | 67 | 67 | 67 | 83 | 72 | 72 | 6.7 | 5.6 | 6.4 | 112 | 2.8 | 7.3 |
| D k4b | 4.0 | 50 | 67 | 67 | 50 | 67 | 67 | 67 | 71 | 67 | 4.7 | 4.5 | 3.7 | 141 | 3.2 | 9.3 |
| E gray3 | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 22.5 | 23.0 | 23.3 | 107 | 6.0 | 1.0 |
| E gray4 | 1.0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 22.2 | 22.6 | 23.0 | 139 | 8.0 | 1.0 |

### Layer status counts

Over all images and the three grid sizes. L is line-solvable, G needs guessing, M multiple solutions, ? budget ran out, X none.

samples:

| approach | layers | L | G | M | ? | X |
|---|---:|---:|---:|---:|---:|---:|
| A mono | 18 | 17 | 0 | 1 | 0 | 0 |
| F dither | 18 | 13 | 0 | 5 | 0 | 0 |
| B1 k2w | 18 | 18 | 0 | 0 | 0 | 0 |
| B1 k3w | 18 | 18 | 0 | 0 | 0 | 0 |
| B1 k4w | 18 | 17 | 1 | 0 | 0 | 0 |
| B1 k2b | 18 | 12 | 2 | 4 | 0 | 0 |
| C rgb3 | 54 | 51 | 0 | 3 | 0 | 0 |
| D k2w | 36 | 24 | 2 | 10 | 0 | 0 |
| D k3w | 47 | 25 | 4 | 18 | 0 | 0 |
| D k4w | 58 | 31 | 5 | 22 | 0 | 0 |
| E gray3 | 18 | 17 | 0 | 1 | 0 | 0 |
| E gray4 | 18 | 17 | 1 | 0 | 0 | 0 |

synthetic:

| approach | layers | L | G | M | ? | X |
|---|---:|---:|---:|---:|---:|---:|
| A mono | 18 | 11 | 4 | 3 | 0 | 0 |
| F dither | 18 | 8 | 0 | 8 | 2 | 0 |
| B1 k2w | 18 | 18 | 0 | 0 | 0 | 0 |
| B1 k3w | 18 | 18 | 0 | 0 | 0 | 0 |
| B1 k4w | 18 | 18 | 0 | 0 | 0 | 0 |
| C rgb3 | 54 | 36 | 7 | 11 | 0 | 0 |
| D k2w | 36 | 28 | 2 | 6 | 0 | 0 |
| D k3w | 54 | 40 | 1 | 12 | 1 | 0 |
| D k4w | 72 | 48 | 1 | 18 | 5 | 0 |
| E gray3 | 18 | 18 | 0 | 0 | 0 | 0 |
| E gray4 | 18 | 18 | 0 | 0 | 0 | 0 |

(Status rows for the `a` and `b` variants are in the full script output. Their fair% matches `w` except where noted below.)

### What the numbers say

- **A single color puzzle (B) was fair every time on the synthetic images**, at every k and size, and almost always line-solvable. On samples it failed only at k=4 (one puzzle needing guessing) and in the reading-(b) k=2 case.
- **The same colors split into independent layers (D) are much less fair.** At k=3 and size 15: B is 100% fair on synthetic and 100% on samples; D is 67% and 17%. Every layer has the same runs as in B, so the clue count is the same (111 and 125). What D loses is the information that crosses colors: which cell holds which color, and in what order runs sit. A layer alone cannot use it. A solver that treated the stack as one puzzle would recover it, but `src/solver.js` does not do that.
- **RGB threshold layers (C) are the worst on fidelity.** Mean delta E is about 50 on synthetic, higher than plain mono (44). Per-channel Otsu on soft images gives saturated, arbitrary hues, and only 3 layers of 0/1. Fairness is no better than mono (67% at 15).
- **k-means in Lab gives close color match.** At k=3 mean delta E is 5.6 on synthetic and 2.5 on samples at size 15, against 44.2 and 23.7 for mono. At k=4 it is 4.5 on synthetic at size 15.
- **Gray shades (E) are fair and cost the same clues as color,** but fidelity stays around 22 to 23 on synthetic (the hue is gone). It is a cheap answer to "only 2 shades", not to "photos look flat".
- **Dithering (F) hurts as expected.** Clues at size 15 go from 52 to 122 on synthetic, and fair% at size 20 falls to 17. The sheet for the soft portrait shows a checkerboard. Do not dither.
- **Black rule.** Readings (a) and (b) only differ where dark pixels exist. On the samples (dark ink on cream) at k=2, (b) turns the ink blank: delta E 17.3 against 6.6 for (a) at size 15, and only 50% fair against 100%. On the synthetic images there is almost no dark ink, so the two readings give the same numbers. Reading (b) is not usable for line art. Reading (a) costs one extra ink (a layer, or a palette slot) and keeps outlines.
- **Layer count.** Layers in D grow with k (up to 4, plus one for black in reading (a)), and the share of fair stacks falls as layers are added.

### What the samples can and cannot show

The 6 sample images are AI pixel art with exactly two colors each (dark ink on cream; the banana is ochre on cream). They are already monochrome puzzles. They show how the approaches behave on clean art and how they handle near-black ink. They say nothing about photos. Where they show k-means splitting a two-color image into extra clusters (the D layer failures), that is a limit of forcing k colors on an image that has fewer.

The synthetic images are a stand-in for photos. Smooth gradients and fractal noise are easier to quantize than real photos, which have faces, edges and fine texture. The B results (always fair) may be optimistic for that reason. Also, "fair" does not measure whether the picture reads well. The `--preview` sheets let a person judge that; I looked at two (the soft portrait and the textured terrain). In both, the k=3 and k=4 color versions stay recognizable. Mono keeps little more than an outline and a dark block, the RGB-layer version shows arbitrary saturated hues, and dithering is noise. This is my reading of two images, not a measurement.

**The real test is the owner's own photos in `research/color/photos/`.** Run the script with 5 to 10 PNGs, read the tables, and open the sheets from `--preview`.

## The approaches, one by one

### B. One color puzzle, palette of 2 to 4 colors plus white

- **Play.** One grid. The player picks a color from a small palette, then fills. Clues are colored numbers. Different colors may touch.
- **Palette picker.** Needed in Play and in Create: 2 to 5 swatches, a selected color, keyboard keys 1 to 5. Left-click fills the selected color, right-click crosses. The existing backlog item "left-clear removes any filled color, not just the start cell's color" must be decided.
- **Hearts.** A wrong color counts like a wrong fill. A cross on a colored cell is a mistake, as now.
- **Clue rendering.** Colored numbers need readable contrast on the page background and in each theme. Colors should also be told apart without color vision (letter, pattern or number on the swatch). This is a gap I did not test.
- **Personas.** `src/personas.js` reads run lengths only and returns no tier for multi-color puzzles. B needs color-aware line techniques (already a backlog item), or a stopgap label such as "color, unrated". The solver verdict (fair, line-solvable) already works for color.
- **Data model.** Fits as is. D2 already has `palette: [{name, hex}]` and an index grid, and `MAX_PALETTE` is 30. `src/clues.js`, `src/solver.js`, `src/webpbn.js` (color export) and `src/clue-progress.js` are color-aware. No new record kind.
- **Fairness and fidelity.** 100% fair on all synthetic runs; mean delta E 4.5 to 8.5 for k=2 to 4 at size 15, against 44 for mono.
- **Costs.** Palette picker and color painting in Play and Create; color clues in `src/views/grid.js`; color-aware personas; Create's cell editor needs a color brush; image creation needs the quantizer from `research/color/`. Tile sets share one palette in `src/tiles.js` (backlog); that works if the whole image is quantized once.

### E. Gray shades (a palette choice inside B)

Same machinery as B with a palette of grays. It adds no code once B exists. Fair in all runs, but fidelity is no better than 22. It fits drawn puzzles and photos where hue does not matter.

### D. Palette layers, one 0/1 puzzle per color

- **Play.** A stack of monochrome puzzles, solved one after another or switched between freely (as in Depixtion). Each layer is the current play UI with its own color. The combined picture appears as layers finish.
- **Relation to tile sets.** Today a set groups puzzles that tile one picture side by side (`set: {id, row, col}`) and D24 reveals the combined photo when the set is finished. A layer stack has the same footprint stacked on top of each other, so tiling logic does not fit. It needs a new relation (for example `set.kind = 'layers'` with `layer` index) and a compositing reveal instead of a tiling one. I did not read the reveal code in detail.
- **Palette picker.** Not needed inside a layer. Needed only to show which layer is active.
- **Hearts.** Per layer, or shared across the stack: an owner decision.
- **Clue rendering.** Existing, one color per layer.
- **Personas.** Work unchanged per layer. A stack's tier would be the hardest layer's tier.
- **Data model.** Layers could be ordinary 1-color puzzles with a palette of one color, grouped by a new set kind. Validators in `src/format.js` and the store's record kinds need to learn the new kind.
- **Fairness and fidelity.** Fidelity equals B (same palette). Fairness is much lower: all layers fair in 17% to 67% of runs at k=3. A stack could be made fair by checking it as one puzzle, which needs a solver change.
- **Costs.** New record kind, new reveal, a layer switcher, a joint solver check to make fairness honest. Larger than B.

### C. RGB threshold layers

- **Play.** Same as D with three layers (cyan, magenta, yellow ink on white in this experiment).
- **Fairness and fidelity.** Worst of all approaches on fidelity (delta E about 50 on synthetic; mono is 44). Fairness 67% at size 15 on synthetic, the same as mono. The hues are decided by the channel thresholds, not by the picture, so a green leaf and a grey wall can end up the same.
- **Costs.** Same as D. No reason to prefer it. Not recommended.

### F. Dithering

Not a layering approach, but tested because it is the usual answer to "two shades". It makes puzzles harder and noisier (see numbers above). Not recommended.

## Recommendation

Build **B first: one color nonogram with a 2 to 4 color palette plus white, quantized by k-means in CIELAB, with black as an optional extra ink (reading (a)).** It was the only approach that stayed fair across all runs, it matches the photo's colors best (delta E about 5 against 44 for mono), it needs no new data model, and it is the standard color nonogram that players already know. Gray shades (E) come free as a palette choice. Drop RGB threshold layers (C), drop dithering (F), and do not use reading (b).

Treat palette layers (D) as an optional second stage. They follow a real pattern in layered games, and they would reuse the monochrome UI and personas. But they need a new set kind, a new reveal and a joint solver check, and on the evidence here they are far less fair as independent layers. Do not start them until B has been played on real photos.

## Risks

- **Weak evidence for photos.** The photo-like images here are synthetic. Real photos may behave differently. Run on the owner's photos first.
- **Fair does not mean pleasant.** More colors means more clues per line (max per line at size 15 goes up to 7.5 on synthetic at k=4 against 3.0 for mono). The per-puzzle effort for a player is higher than the fair% suggests.
- **Palette legibility.** k-means can pick colors that are close in Lab or hard to tell apart for some players. A minimum distance between palette colors and a non-color cue is not built or measured.
- **Personas lag.** Color puzzles have no difficulty tier until the personas learn color. The library label needs a stopgap.
- **Solver budget.** 300 nodes was enough here (almost no `unknown`). Larger color puzzles (25x25, 5 colors) are not tested.
- **Scope of the flag.** `?features=color` stores a pref in this browser only and reveals nothing in the UI. Nothing reads it yet.

## Decisions for the owner before a build plan

1. Is B (one color puzzle) the first build, with layers (D) deferred?
2. How many colors by default and at most per puzzle: 2 to 4 plus white, as researched, or more? (webpbn caps at 5 counting white; the format here allows 30.)
3. Black: reading (a), an extra ink that is always available. Confirm, and confirm reading (b) is out.
4. Is the palette chosen automatically from the image with a short editor in Create, or must the owner pick it by hand?
5. Difficulty for color puzzles: build color-aware personas first, or ship with a stopgap label?
6. Hearts and mistakes: is a wrong color a mistake like a wrong fill?
7. Color-blind support: add a letter or pattern on swatches and clues now, or later?
8. Left-clear rule in Play (backlog): does clearing remove any color or only the start cell's color?
9. Run the experiment on 5 to 10 of the owner's photos before the build plan is written?
10. Layers (D): drop, or revisit after B has been used?
