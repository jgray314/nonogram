// Sample puzzles, drawn as string art ('#' filled). All were drawn by the AI
// build assistant for testing, so each title says so (the owner's no-AI-content
// rule). The art for the image-based ones also lives in sample-images/art.json.
import { puzzleId } from './format.js';
import { puzzleClues } from './clues.js';
import { solve } from './solver.js';
import { personaTier } from './personas.js';

const ART = [
  {
    title: 'AI test sample: Plus (5x5)',
    rows: ['..#..', '..#..', '#####', '..#..', '..#..'],
  },
  {
    title: 'AI test sample: Castle (10x10)',
    rows: [
      '#.#.##.#.#',
      '##########',
      '##########',
      '.########.',
      '.########.',
      '.###..###.',
      '.###..###.',
      '.###..###.',
      '.########.',
      '##########',
    ],
  },
  {
    title: 'AI test sample: Heart (5x5)',
    rows: ['.#.#.', '#####', '#####', '.###.', '..#..'],
  },
  {
    title: 'AI test sample: House (10x10)',
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
    title: 'AI test sample: Smiley (15x15)',
    // Solid face with cut-out features: the hollow-outline version had two
    // solutions (symmetric mouth corners), caught by the samples fairness test.
    rows: [
      '....#######....',
      '..###########..',
      '.#############.',
      '.###..###..###.',
      '####..###..####',
      '###############',
      '###############',
      '###############',
      '###.#######.###',
      '####.#####.####',
      '#####.....#####',
      '.#############.',
      '.#############.',
      '..###########..',
      '....#######....',
    ],
  },
  {
    title: 'AI test sample: Cat (10x10)',
    rows: [
      '#........#',
      '##......##',
      '##########',
      '##########',
      '#..####..#',
      '##########',
      '####..####',
      '##########',
      '.########.',
      '..######..',
    ],
  },
  {
    title: 'AI test sample: Cat (15x15)',
    rows: [
      '...#...#.......',
      '...##.##.......',
      '...#####.......',
      '...#.#.#.......',
      '...#####.......',
      '....###........',
      '...#####.......',
      '..#######......',
      '..#######......',
      '..########.....',
      '..########...#.',
      '..#########..#.',
      '..#########..#.',
      '..##########.#.',
      '..############.',
    ],
  },
  {
    title: 'AI test sample: Cat (20x20)',
    rows: [
      '....##........##....',
      '....###......###....',
      '....####....####....',
      '....############....',
      '....############....',
      '....##..####..##....',
      '....##..####..##....',
      '....#####..#####....',
      '....############....',
      '.....##########.....',
      '......########......',
      '.....##########.....',
      '....############....',
      '...##############...',
      '...##############...',
      '...######..######.##',
      '...######..######..#',
      '...######..######..#',
      '..###############..#',
      '..##################',
    ],
  },
  {
    title: 'AI test sample: Cat (25x25)',
    rows: [
      '...#.................#...',
      '...##...............##...',
      '...###.............###...',
      '...####...........####...',
      '...#####.........#####...',
      '...###################...',
      '...###################...',
      '...####...#####...####...',
      '...####...#####...####...',
      '...####...#####...####...',
      '...###################...',
      '...#########.#########...',
      '##.########...########.##',
      '...###################...',
      '##...###############...##',
      '.....###############.....',
      '.......###########.......',
      '......#############......',
      '.....###############.....',
      '....#################....',
      '....#################....',
      '....#######...#######....',
      '....#######...#######....',
      '...########...########...',
      '...########...########...',
    ],
  },
  {
    title: 'AI test sample: Banana (10x10)',
    rows: [
      '........##',
      '........##',
      '.......###',
      '.......###',
      '......####',
      '.....####.',
      '...######.',
      '########..',
      '.######...',
      '..###.....',
    ],
  },
  {
    title: 'AI test sample: Spider (20x20)',
    rows: [
      '.........##.........',
      '..#......##......#..',
      '..#......##......#..',
      '#.#.....####.....#.#',
      '#.################.#',
      '#......######......#',
      '####################',
      '.......######.......',
      '.##################.',
      '.#...##########...#.',
      '.#...##########...#.',
      '.#.##############.#.',
      '.#.#.##########.#.#.',
      '.#.#.##########.#.#.',
      '.#.#..########..#.#.',
      '##.#...######...#.##',
      '...#....####....#...',
      '...#............#...',
      '..##............##..',
      '....................',
    ],
  },
];

// Color samples (D26): '.' is the blank, drawn in `blank` (D29), and each letter
// is the ink of the same letter in `inks`, in palette order. All three are line-solvable (test/library.test.js).
const COLOR_ART = [
  {
    title: 'AI test sample: Strawberry (10x10)',
    blank: '#fdf1dc', // cream
    inks: [
      ['r', 'red', '#d7263d'],
      ['g', 'green', '#3a9a3f'],
      ['y', 'yellow', '#f2c230'],
    ],
    rows: [
      '....gg....',
      '..gggggg..',
      '.rrggggrr.',
      'rrrrggrrrr',
      'rryrrrryrr',
      'rrrrrrrrrr',
      '.rrryrrrr.',
      '.rrrrrryr.',
      '..ryrrrr..',
      '...rrrr...',
    ],
  },
  {
    title: 'AI test sample: Mushroom (10x10)',
    blank: '#1f2f4f', // night sky: the cream spots stand out, and the cross is white
    inks: [
      ['r', 'red', '#c8322e'],
      ['w', 'cream', '#f4ead2'],
      ['t', 'tan', '#c9a777'],
      ['g', 'green', '#4f9a3a'],
    ],
    rows: [
      '...rrrr...',
      '.rrwwrrrr.',
      'rrwwrrrwwr',
      'rrrrrrrwwr',
      'rwwrrrrrrr',
      '..tttttt..',
      '...tttt...',
      '...tttt...',
      '...tttt...',
      'gggggggggg',
    ],
  },
  {
    title: 'AI test sample: Flower (15x15)',
    blank: '#cde8f6', // soft sky
    inks: [
      ['p', 'pink', '#e85d9e'],
      ['y', 'yellow', '#f5c518'],
      ['g', 'green', '#3f9142'],
      ['b', 'brown', '#9a5b34'],
    ],
    rows: [
      '.....ppppp.....',
      '....ppppppp....',
      '...ppyyyyypp...',
      '...ppyyyyypp...',
      '...ppyyyyypp...',
      '....ppppppp....',
      '.....ppppp.....',
      '.......g.......',
      '.ggg...g.......',
      '..ggggggg..gg..',
      '.......ggggg...',
      '...bbbbbbbbb...',
      '....bbbbbbb....',
      '....bbbbbbb....',
      '.....bbbbb.....',
    ],
  },
];

/** The two-tone samples as full puzzle records, ids computed. */
export async function samplePuzzles() {
  const out = [];
  for (const { title, rows } of ART) {
    out.push(
      await sampleRecord(title, rows, [{ name: 'black', hex: '#000000' }], (ch) =>
        ch === '#' ? 1 : 0,
      ),
    );
  }
  return out;
}

/** The color samples as full puzzle records, ids computed. */
export async function colorSamplePuzzles() {
  const out = [];
  for (const { title, blank, inks, rows } of COLOR_ART) {
    const palette = inks.map(([, name, hex]) => ({ name, hex }));
    const value = (ch) => inks.findIndex(([letter]) => letter === ch) + 1; // '.' -> 0
    // The blank is display only (D29), so adding it after the id keeps the id.
    out.push({ ...(await sampleRecord(title, rows, palette, value)), blank });
  }
  return out;
}

/** One sample record: solved here so its verdict is honest, then hashed for its id. */
async function sampleRecord(title, rows, palette, value) {
  const puzzle = {
    v: 1,
    id: '',
    title,
    width: rows[0].length,
    height: rows.length,
    palette,
    solution: rows.map((row) => Array.from(row, value)),
    verdict: null,
  };
  // Samples are tiny, so solving here is instant and keeps the verdict honest.
  const problem = { width: puzzle.width, height: puzzle.height, ...puzzleClues(puzzle.solution) };
  const { status, sweeps } = solve(problem, {});
  puzzle.verdict = { status, sweeps };
  // On the main thread, which is fine here: every sample is line-solvable,
  // so the slow Expert trials never run (test/personas.test.js pins their labels).
  const tier = personaTier(problem, status);
  if (tier) puzzle.verdict.tier = tier;
  puzzle.id = await puzzleId(puzzle);
  return puzzle;
}

/** Put the two-tone and color samples in the store, skipping any already there. */
export async function loadSamples(store) {
  let added = 0;
  let skipped = 0;
  for (const puzzle of [...(await samplePuzzles()), ...(await colorSamplePuzzles())]) {
    if (store.get('puzzle', puzzle.id)) skipped += 1;
    else {
      store.put('puzzle', puzzle);
      added += 1;
    }
  }
  return { added, skipped };
}
