// Solver verdicts and the report text for the creator view. No DOM. A leaf: imports nothing from this family.
import { difficultyLabel } from './difficulty.js';

const STATUS_TEXT = {
  'unique-line-solvable': 'One solution, solvable by line logic alone.',
  'unique-needs-guessing': 'One solution, but solving needs guessing.',
  multiple: 'More than one solution. Highlighted cells differ between two of them.',
  none: 'No solution fits these clues.',
  unknown: 'Could not decide: the search ran out of budget.',
};

/** The verdict to store for a solver result: status, sweeps, and the persona tier when there is one. */
export function verdictOf(result) {
  const verdict = { status: result.status, sweeps: result.sweeps };
  if (result.tier) verdict.tier = result.tier;
  return verdict;
}

/**
 * Turn a solver result (or null while checking) into what the report shows:
 * {text, label, highlight}. `highlight` is the cells to mark: the differing
 * cells for `multiple`, the unresolved cells for `unique-needs-guessing`.
 * `size` ({width, height}) lets a large grid's label step up (D23).
 */
export function reportView(result, size = null) {
  if (!result) return { text: 'Checking...', label: 'Unchecked', highlight: [] };
  const label = difficultyLabel(verdictOf(result), size);
  let highlight = [];
  if (result.status === 'multiple') highlight = result.differing;
  else if (result.status === 'unique-needs-guessing') highlight = result.unresolved;
  return {
    text: STATUS_TEXT[result.status] ?? result.status,
    label,
    highlight: highlight.map(([r, c]) => [r, c]),
  };
}

export const DEFAULT_PALETTE = [{ name: 'black', hex: '#000000' }];
