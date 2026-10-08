/**
 * Clue derivation. A line is number[]: 0 is empty, k >= 1 is palette color k.
 * A Clue is {n, c}: run length n, palette color c.
 */

/** Runs in order; a run ends at a gap or a color change. */
export function lineClues(line) {
  const clues = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === 0) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < line.length && line[j] === c) j += 1;
    clues.push({ n: j - i, c });
    i = j;
  }
  return clues;
}

/** Row and column clues for a solution grid (array of rows). */
export function puzzleClues(solution) {
  const rows = solution.map(lineClues);
  const width = solution.length ? solution[0].length : 0;
  const cols = [];
  for (let x = 0; x < width; x += 1) {
    cols.push(lineClues(solution.map((row) => row[x])));
  }
  return { rows, cols };
}
