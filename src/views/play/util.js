// Play view: small pure helpers shared by several modules.

/** Crosses are hidden and unknowns shown empty once the puzzle is solved. */
export const reveal = (cells) => cells.map((row) => row.map((v) => (v >= 1 ? v : 0)));
export const sameGrid = (a, b) => a.every((row, r) => row.every((v, c) => v === b[r][c]));
