// Library backup: export, webpbn export and import. Never imports library.js;
// it redraws through lib.render() and reads lib fields at call time.
import { idMatches } from '../format.js';
import { toWebpbn } from '../webpbn.js';
import { buildBackup, parseBackup, planImport, ratePlan, droppedArtCount } from '../backup.js';
import { createSolverClient, ratePuzzleWith } from '../solver-client.js';
import { safeFilename } from '../library-logic.js';
import { lib, say, forThisMount } from './library-state.js';

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportXml(id) {
  const puzzle = lib.store.get('puzzle', id);
  if (!puzzle) return say('That puzzle no longer exists.');
  download(`${safeFilename(puzzle.title)}.xml`, toWebpbn(puzzle), 'application/xml');
}

export function exportLibrary() {
  const puzzles = lib.store.list('puzzle');
  const saves = lib.store.list('save');
  const sets = lib.store.list('set');
  const text = buildBackup({ puzzles: puzzles.records, saves: saves.records, sets: sets.records });
  const stamp = new Date().toISOString().slice(0, 10);
  download(`nonogram-library-${stamp}.json`, text, 'application/json');
  const lost = puzzles.skipped + saves.skipped + sets.skipped;
  // Corrupt records cannot be exported; say so rather than imply a full backup.
  say(
    lost
      ? `Library exported. ${lost} corrupt record${lost === 1 ? ' was' : 's were'} left out.`
      : 'Library exported.',
  );
}

/**
 * Imports re-solve every new puzzle, which can take a while, so the other
 * toolbar actions stay off until it ends. Re-enabling goes
 * through `ui`, so a later mount's fresh buttons are never touched.
 */
export async function importLibrary(file) {
  const ui = forThisMount();
  for (const b of lib.toolbarButtons) b.disabled = true;
  try {
    await runImport(file, ui);
  } finally {
    ui(() => {
      for (const b of lib.toolbarButtons) b.disabled = false;
    });
  }
}

async function runImport(file, ui) {
  // Keep this mount's store: unmount clears `lib.store`.
  const store0 = lib.store;
  const parsed = parseBackup(await file.text(), (id) => store0.get('puzzle', id));
  if (!parsed.ok) return ui(() => say(`Import failed: ${parsed.error}.`));
  // Reject puzzles whose id is not the hash of their content, and their saves.
  const forged = new Set();
  for (const p of parsed.puzzles) if (!(await idMatches(p))) forged.add(p.id);
  if (forged.size) {
    parsed.puzzles = parsed.puzzles.filter((p) => !forged.has(p.id));
    parsed.saves = parsed.saves.filter((s) => !forged.has(s.puzzleId));
    for (const id of forged)
      parsed.skipped.push({ kind: 'puzzle', id, error: 'id does not match content' });
  }
  let plan = planImport(parsed, {
    puzzles: store0.list('puzzle').records.map((p) => p.id),
    saves: store0.list('save').records.map((s) => s.puzzleId),
    sets: store0.list('set').records.map((s) => s.setId),
  });
  // An imported verdict is only a claim: re-solve each puzzle that will be written.
  const toCheck = plan.filter((w) => w.kind === 'puzzle').length;
  if (toCheck) {
    const checking = (done) =>
      ui(() => say(`Checking ${done} of ${toCheck} imported puzzle${toCheck === 1 ? '' : 's'}…`));
    checking(0);
    // Created inside the try: `new Worker` can throw synchronously.
    let solver;
    try {
      solver = createSolverClient();
      plan = await ratePlan(plan, ratePuzzleWith(solver), checking);
    } catch {
      return ui(() =>
        say('Import failed: the solver could not check the puzzles. Nothing was imported.'),
      );
    } finally {
      solver?.terminate();
    }
  }
  let written = 0;
  try {
    for (const { kind, record } of plan) {
      store0.put(kind, record);
      written += 1;
    }
  } catch (e) {
    return ui(() => {
      lib.render();
      say(`Import stopped after ${written} of ${plan.length} records: ${e.message}.`);
    });
  }
  const valid = parsed.puzzles.length + parsed.saves.length + parsed.sets.length;
  const parts = [`Imported ${plan.length} record${plan.length === 1 ? '' : 's'}`];
  if (valid > plan.length) parts.push(`${valid - plan.length} already existed`);
  if (parsed.skipped.length) {
    const why = parsed.skipped
      .slice(0, 3)
      .map((s) => `${s.kind} ${s.id}: ${s.error}`)
      .join('; ');
    parts.push(
      `${parsed.skipped.length} invalid skipped (${why}${parsed.skipped.length > 3 ? '; ...' : ''})`,
    );
  }
  // Only puzzles this import wrote: an existing puzzle keeps its own art.
  const n = droppedArtCount(plan, parsed.artDroppedIds);
  if (n) {
    parts.push(`${n} picture${n === 1 ? '' : 's'} dropped (not a small JPEG)`);
  }
  ui(() => {
    lib.render();
    say(`${parts.join(', ')}.`);
  });
}
