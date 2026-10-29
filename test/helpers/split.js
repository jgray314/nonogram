// Helpers for test/split_<name>.test.js: source-text checks on a file split.
// Source text is checked (not imports) so a stub file, or a definition or
// re-export that only exists inside a comment or a string, cannot pass.

const REGEX_PREV = new Set([...'(,=:[!&|?{};+-*%<>~^']);

/**
 * One pass over JS source. Comments are always removed (a line comment keeps
 * its newline, a block comment becomes one space). Strings, template literals
 * and regex literals are kept as written, or with their contents emptied when
 * `blankStrings` is set, so a `//` inside a string is never taken for a comment.
 * @param {string} src
 * @param {boolean} blankStrings
 */
function scan(src, blankStrings) {
  let out = '';
  let prev = ''; // last significant (non-space, non-comment) character
  let i = 0;
  const n = src.length;
  const quoted = (end) => {
    // Copy from i through the closing `end` character, honoring backslash escapes.
    let j = i + 1;
    while (j < n && src[j] !== end) j += src[j] === '\\' ? 2 : 1;
    const text = src.slice(i, j + 1);
    out += blankStrings ? src[i] + end : text;
    i = j + 1;
    prev = end;
  };
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
    } else if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      out += ' ';
    } else if (ch === '"' || ch === "'") {
      quoted(ch);
    } else if (ch === '`') {
      // Template literal: skip ${ ... } by counting braces; text inside is kept.
      let j = i + 1;
      let depth = 0;
      while (j < n && !(src[j] === '`' && depth === 0)) {
        if (src[j] === '\\') j += 2;
        else {
          if (src[j] === '$' && src[j + 1] === '{') {
            depth++;
            j++;
          } else if (src[j] === '}' && depth > 0) depth--;
          j++;
        }
      }
      out += blankStrings ? '``' : src.slice(i, j + 1);
      i = j + 1;
      prev = '`';
    } else if (ch === '/' && (prev === '' || REGEX_PREV.has(prev))) {
      // A regex literal (division would follow an identifier, number or closer).
      let j = i + 1;
      let inClass = false;
      while (j < n && (inClass || src[j] !== '/') && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        j++;
      }
      out += blankStrings ? '/ /' : src.slice(i, j + 1);
      i = j + 1;
      prev = '/';
    } else {
      out += ch;
      if (!/\s/.test(ch)) prev = ch;
      i++;
    }
  }
  return out;
}

/** Source with comments removed; strings and regex literals untouched. */
export function stripComments(src) {
  return scan(src, false);
}

// Index of the bracket matching the opener at `open` (strings already blanked).
function matching(text, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const close = pairs[text[open]];
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === text[open]) depth++;
    else if (text[i] === close && --depth === 0) return i;
  }
  return -1;
}

const escape = (name) => name.replace(/[$]/g, '\\$&');
const isEmptyBlock = (text, open) => {
  const close = matching(text, open);
  return close > 0 && text.slice(open + 1, close).trim() === '';
};

/**
 * True when `src` really defines `name`: a function, class, or const/let/var
 * declaration outside comments. Empty stubs do not count: `function f() {}`,
 * `const f = () => {}`, `class C {}`, `const x = null` or `= undefined`.
 * @param {string} src
 * @param {string} name
 */
export function definesFunction(src, name) {
  const text = scan(src, true);
  const id = escape(name);
  const decls = [
    new RegExp(String.raw`(?<![\w$.])function\s*\*?\s*${id}\s*\(`, 'g'),
    new RegExp(String.raw`(?<![\w$.])class\s+${id}(?![\w$])`, 'g'),
    new RegExp(String.raw`(?<![\w$.])(?:const|let|var)\s+${id}\s*=\s*`, 'g'),
  ];
  for (const [kind, re] of decls.entries()) {
    for (const m of text.matchAll(re)) {
      const at = m.index + m[0].length;
      if (kind === 0) {
        const close = matching(text, at - 1);
        const open = close < 0 ? -1 : text.indexOf('{', close);
        if (open > 0 && !isEmptyBlock(text, open)) return true;
      } else if (kind === 1) {
        const open = text.indexOf('{', at);
        if (open > 0 && !isEmptyBlock(text, open)) return true;
      } else {
        const rest = text.slice(at);
        if (/^(?:null|undefined)\s*(?:;|$)/m.test(rest.slice(0, 20))) continue;
        const arrow = rest.match(/^(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>\s*/);
        if (arrow) {
          const body = rest.slice(arrow[0].length);
          if (body[0] === '{') {
            if (!isEmptyBlock(rest, arrow[0].length)) return true;
          } else if (!/^(?:null|undefined|\(\s*\))\s*(?:;|$)/m.test(body.slice(0, 20))) return true;
          continue;
        }
        if (!/^;/.test(rest)) return true;
      }
    }
  }
  return false;
}

/**
 * True when `src` has a real `export * from '<specifier>';` line (not inside a
 * comment or a string).
 * @param {string} src
 * @param {string} specifier
 */
export function reExports(src, specifier) {
  const text = stripComments(src);
  const quote = escape(specifier).replace(/[.*+?^()|[\]\\/{}]/g, '\\$&');
  return new RegExp(String.raw`^[ \t]*export\s*\*\s*from\s*(['"])${quote}\1\s*;?[ \t]*$`, 'm').test(
    text,
  );
}
