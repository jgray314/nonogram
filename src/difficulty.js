// Difficulty label from a cached solver verdict ({status, sweeps}).
// Thresholds are provisional; PLAN.md step 13 calibrates them by play.
const EASY_MAX_SWEEPS = 3;

export function isFair(verdict) {
  return Boolean(verdict) && verdict.status.startsWith('unique');
}

export function difficultyLabel(verdict) {
  if (!verdict) return 'Unchecked';
  if (verdict.status === 'unique-line-solvable') {
    return verdict.sweeps <= EASY_MAX_SWEEPS ? 'Easy' : 'Medium';
  }
  if (verdict.status === 'unique-needs-guessing') return 'Hard';
  return 'Not fair';
}
