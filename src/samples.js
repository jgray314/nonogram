// Three hand-authored sample puzzles, drawn as string art ('#' filled).
import { puzzleId } from './format.js';

const ART = [
  {
    title: 'Sample: Heart (5x5)',
    rows: ['.#.#.', '#####', '#####', '.###.', '..#..'],
  },
  {
    title: 'Sample: House (10x10)',
    rows: [
      '....##....',
      '...####...',
      '..######..',
      '.########.',
      '##########',
      '.##....##.',
      '.##.##.##.',
      '.##.##.##.',
      '.##.##.##.',
      '.########.',
    ],
  },
  {
    title: 'Sample: Smiley (15x15)',
    rows: [
      '....#######....',
      '..###.....###..',
      '.##.........##.',
      '.#...#...#...#.',
      '##...#...#...##',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#..#.......#..#',
      '##..#.....#..##',
      '.#...#####...#.',
      '.##.........##.',
      '..###.....###..',
      '....#######....',
    ],
  },
];

/** The samples as full puzzle records, ids computed. */
export async function samplePuzzles() {
  const out = [];
  for (const { title, rows } of ART) {
    const puzzle = {
      v: 1,
      id: '',
      title,
      width: rows[0].length,
      height: rows.length,
      palette: [{ name: 'black', hex: '#000000' }],
      solution: rows.map((row) => Array.from(row, (ch) => (ch === '#' ? 1 : 0))),
      verdict: null,
    };
    puzzle.id = await puzzleId(puzzle);
    out.push(puzzle);
  }
  return out;
}

/** Put the samples in the store, skipping any already there. */
export async function loadSamples(store) {
  let added = 0;
  let skipped = 0;
  for (const puzzle of await samplePuzzles()) {
    if (store.get('puzzle', puzzle.id)) skipped += 1;
    else {
      store.put('puzzle', puzzle);
      added += 1;
    }
  }
  return { added, skipped };
}
