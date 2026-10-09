// webpbn XML (format v0.3) export. https://webpbn.com/pbn_fmt.html
import { puzzleClues } from './clues.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
// Control characters (except tab, LF, CR) are not allowed in XML 1.0, so they
// are dropped before escaping.
const allowedInXml = (ch) => ch >= ' ' || '\t\n\r'.includes(ch);
const esc = (s) =>
  Array.from(String(s))
    .filter(allowedInXml)
    .join('')
    .replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

/** "#RRGGBB" to hex without '#', shortened to 3 digits when every pair repeats. */
function hexOf(hex) {
  const h = String(hex).replace(/^#/, '').toLowerCase();
  return /^([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3$/.test(h) ? h[0] + h[2] + h[4] : h;
}

const FALLBACK_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWYZ0123456789abcdefghijklmnopqrstuvwxyz';

/** Distinct names (not "white", unique) and distinct chars (not "."), one per palette entry. */
function colorDefs(palette) {
  const names = new Set(['white']);
  const chars = new Set(['.']);
  return palette.map((p, i) => {
    let name = String(p.name);
    for (let n = 2; names.has(name); n += 1) name = `${p.name}-${n}`;
    names.add(name);
    let char;
    if (i === 0 && name === 'black') char = 'X';
    else {
      const own = [...name.toUpperCase()].filter((ch) => /[A-Z]/.test(ch) && ch !== 'X');
      char = [...own, ...FALLBACK_CHARS].find((ch) => !chars.has(ch));
      if (char === undefined) throw new Error('palette too large for webpbn export');
    }
    chars.add(char);
    return { name, char, hex: hexOf(p.hex) };
  });
}

/** Export a puzzle record as webpbn XML. */
export function toWebpbn(puzzle) {
  const defs = colorDefs(puzzle.palette);
  const def = defs[0].name;
  const clueLine = (clues) => {
    const counts = clues.map(({ n, c }) => {
      const name = defs[c - 1].name;
      return `<count${name === def ? '' : ` color="${esc(name)}"`}>${n}</count>`;
    });
    return `<line>${counts.join('')}</line>`;
  };
  const { rows, cols } = puzzleClues(puzzle.solution);
  const out = [
    '<?xml version="1.0"?>',
    '<!DOCTYPE pbn SYSTEM "https://webpbn.com/pbn-0.3.dtd">',
    '<puzzleset>',
    `<puzzle type="grid" defaultcolor="${esc(def)}">`,
    `<title>${esc(puzzle.title)}</title>`,
    '<color name="white" char=".">fff</color>',
    ...defs.map((d) => `<color name="${esc(d.name)}" char="${d.char}">${d.hex}</color>`),
    '<clues type="columns">',
    ...cols.map(clueLine),
    '</clues>',
    '<clues type="rows">',
    ...rows.map(clueLine),
    '</clues>',
    '<solution type="goal">',
    '<image>',
    ...puzzle.solution.map(
      (row) => `|${row.map((v) => (v === 0 ? '.' : defs[v - 1].char)).join('')}|`,
    ),
    '</image>',
    '</solution>',
    '</puzzle>',
    '</puzzleset>',
  ];
  return `${out.join('\n')}\n`;
}
