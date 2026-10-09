// Per-number clue progress for the play view. Pure, no DOM.
// A number is done only when its block is closed in at the matching position
// from either edge, as most nonogram apps do it.
// Cell encoding: 0 unknown, -1 crossed, k >= 1 filled.
import { lineSatisfied } from './game.js';

/**
 * Scan a line in one direction and return how many leading clues (in scan
 * order) are done. Crossed cells are skipped, an unknown cell stops the scan,
 * and a filled run counts only if both sides are the line edge or a cross.
 * `limit` caps the count so the two scans never claim the same clue.
 */
function scan(line, clues, limit) {
  let done = 0;
  let i = 0;
  while (i < line.length && done < limit) {
    const v = line[i];
    if (v === -1) {
      i += 1;
      continue;
    }
    if (v === 0) break;
    let j = i;
    while (j < line.length && line[j] === v) j += 1;
    const closed = j === line.length || line[j] === -1; // the start side is an edge or a skipped cross
    const clue = clues[done];
    if (!closed || clue.n !== j - i || clue.c !== v) break;
    done += 1;
    i = j;
  }
  return done;
}

function lineProgress(lineCells, clues) {
  const flags = clues.map(() => false);
  if (clues.length === 0) return flags;
  if (lineSatisfied(lineCells, clues)) return flags.fill(true);
  const fromStart = scan(lineCells, clues, clues.length);
  const fromEnd = scan(
    lineCells.slice().reverse(),
    clues.slice().reverse(),
    clues.length - fromStart,
  );
  for (let k = 0; k < fromStart; k += 1) flags[k] = true;
  for (let k = 0; k < fromEnd; k += 1) flags[clues.length - 1 - k] = true;
  return flags;
}

/** {rows: boolean[][], cols: boolean[][]}: one flag per clue number. */
export function clueProgress(cells, clues) {
  const rows = clues.rows.map((cl, r) => lineProgress(cells[r], cl));
  const cols = clues.cols.map((cl, c) =>
    lineProgress(
      cells.map((row) => row[c]),
      cl,
    ),
  );
  return { rows, cols };
}
