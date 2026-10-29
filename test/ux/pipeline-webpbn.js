// Pipeline check D: create a puzzle from an image, export it as webpbn XML from
// the Library, and compare the parsed XML with the stored solution. Expected
// clues are derived here from the stored grid, independent of src/clues.js.
import { captureDownload, createAndSave, resetStore, waitFor } from './harness.js';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

/** Run lengths of the non-zero cells in `line`; a run ends at a gap or a value change. */
function runs(line) {
  const out = [];
  let prev = 0;
  for (const v of line) {
    if (v !== 0 && v === prev) out[out.length - 1] += 1;
    else if (v !== 0) out.push(1);
    prev = v;
  }
  return out;
}

const lineValues = (lineEl) =>
  [...lineEl.querySelectorAll('count')].map((c) => Number(c.textContent));

export const WEBPBN_CHECKS = [
  {
    id: 'pipeline-webpbn-export',
    name: 'A created puzzle exports webpbn XML whose size and clues match its solution',
    async run(app) {
      resetStore(app);
      const id = await createAndSave(app, 'sample-images/cat-15x15.png');
      await app.open('#/library');
      const row = await waitFor(
        () =>
          app
            .$$('.nng-lib-row')
            .find((r) => r.querySelector(`a[href$="${encodeURIComponent(id)}"]`)),
        'library row for the saved puzzle',
        5000,
      );
      const stored = JSON.parse(app.win().localStorage.getItem(`nng:puzzle:${id}`));
      const solution = stored.solution;
      assert(solution.length === 15 && solution[0].length === 15, 'stored solution is not 15 x 15');

      row.querySelector('summary').click();
      const exportBtn = [...row.querySelectorAll('button')].find((b) =>
        b.textContent.includes('webpbn'),
      );
      assert(exportBtn, 'no webpbn export item in the More menu');
      /** @type {{ name: string, text: () => Promise<string> }} */
      const dl = await captureDownload(app, () => exportBtn.click());
      assert(dl.name.endsWith('.xml'), `download name should end in .xml, got "${dl.name}"`);

      const xml = new (app.win().DOMParser)().parseFromString(await dl.text(), 'application/xml');
      assert(!xml.querySelector('parsererror'), 'the exported XML does not parse');
      assert(xml.documentElement.tagName === 'puzzleset', 'root element is not <puzzleset>');
      const puzzle = xml.documentElement.querySelector(':scope > puzzle');
      assert(puzzle && puzzle.getAttribute('type') === 'grid', 'no <puzzle type="grid">');

      const cols = [...puzzle.querySelectorAll('clues[type="columns"] > line')];
      const rows = [...puzzle.querySelectorAll('clues[type="rows"] > line')];
      assert(cols.length === 15, `expected 15 column clue lines, got ${cols.length}`);
      assert(rows.length === 15, `expected 15 row clue lines, got ${rows.length}`);
      const image = puzzle.querySelector('solution > image').textContent.trim().split('\n');
      assert(image.length === 15, `solution image has ${image.length} rows, expected 15`);
      assert(
        image.every((l) => l.trim().length === 17),
        'solution image rows are not 15 cells wide',
      );

      for (let r = 0; r < 15; r += 1) {
        const want = runs(solution[r]).join(',');
        const got = lineValues(rows[r]).join(',');
        assert(got === want, `row ${r + 1} clues: expected [${want}], got [${got}]`);
      }
      for (let c = 0; c < 15; c += 1) {
        const want = runs(solution.map((row) => row[c])).join(',');
        const got = lineValues(cols[c]).join(',');
        assert(got === want, `column ${c + 1} clues: expected [${want}], got [${got}]`);
      }
    },
  },
];
