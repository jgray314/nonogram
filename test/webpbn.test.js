import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toWebpbn } from '../src/webpbn.js';

const BLACK = { name: 'black', hex: '#000000' };

function puzzle(over) {
  return {
    v: 1,
    id: 'abc',
    title: 'T',
    width: 2,
    height: 2,
    palette: [BLACK],
    solution: [
      [1, 0],
      [0, 1],
    ],
    verdict: null,
    ...over,
  };
}

const squash = (s) => s.replace(/\s+/g, ' ').trim();

test('xml matches spec 2x2 example', () => {
  const xml = toWebpbn(puzzle({}));
  const expected = `<?xml version="1.0"?>
<!DOCTYPE pbn SYSTEM "https://webpbn.com/pbn-0.3.dtd">
<puzzleset>
<puzzle type="grid" defaultcolor="black">
<title>T</title>
<color name="white" char=".">fff</color>
<color name="black" char="X">000</color>
<clues type="columns">
<line><count>1</count></line>
<line><count>1</count></line>
</clues>
<clues type="rows">
<line><count>1</count></line>
<line><count>1</count></line>
</clues>
<solution type="goal">
<image>
|X.|
|.X|
</image>
</solution>
</puzzle>
</puzzleset>`;
  assert.equal(squash(xml), squash(expected));
});

test('empty line exported', () => {
  const xml = toWebpbn(
    puzzle({
      solution: [
        [1, 0],
        [0, 0],
      ],
    }),
  );
  assert.match(
    xml,
    /<clues type="columns">\n<line><count>1<\/count><\/line>\n<line><\/line>\n<\/clues>/,
  );
  assert.match(
    xml,
    /<clues type="rows">\n<line><count>1<\/count><\/line>\n<line><\/line>\n<\/clues>/,
  );
});

test('title is escaped', () => {
  const xml = toWebpbn(puzzle({ title: `A & B <c> "d" 'e'` }));
  assert.ok(xml.includes('<title>A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;</title>'));
});

test('non-default color count gets color attribute', () => {
  const xml = toWebpbn(
    puzzle({
      palette: [BLACK, { name: 'red', hex: '#ff0000' }],
      solution: [
        [1, 2],
        [2, 2],
      ],
    }),
  );
  assert.ok(xml.includes('<color name="red" char="R">f00</color>'));
  assert.ok(xml.includes('<line><count>1</count><count color="red">1</count></line>'));
  assert.ok(xml.includes('<line><count color="red">2</count></line>'));
  assert.ok(xml.includes('|XR|\n|RR|'));
});
