// The only module that touches localStorage. Storage is injectable for tests.
import { validatePuzzle, validateSave, validateSet } from './format.js';

const PREFIX = 'nng:';
const ID_FIELDS = { puzzle: 'id', save: 'puzzleId', set: 'setId' };

const keyFor = (kind, id) => `${PREFIX}${kind}:${id}`;

function checkKind(kind) {
  if (!Object.hasOwn(ID_FIELDS, kind)) throw new Error(`unknown record kind: ${kind}`);
}

export function createStore(storage = globalThis.localStorage) {
  /** Parsed record, or null when missing, unparsable or storage throws. */
  function read(key) {
    try {
      const raw = storage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function get(kind, id) {
    checkKind(kind);
    return read(keyFor(kind, id));
  }

  function put(kind, record) {
    checkKind(kind);
    const id = record?.[ID_FIELDS[kind]];
    if (typeof id !== 'string' || id === '') {
      throw new Error(`${kind} record needs a string ${ID_FIELDS[kind]}`);
    }
    storage.setItem(keyFor(kind, id), JSON.stringify(record));
  }

  function remove(kind, id) {
    checkKind(kind);
    storage.removeItem(keyFor(kind, id));
    if (kind === 'puzzle') storage.removeItem(keyFor('save', id));
  }

  function list(kind) {
    checkKind(kind);
    const prefix = `${PREFIX}${kind}:`;
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (typeof k === 'string' && k.startsWith(prefix)) keys.push(k);
    }
    keys.sort();

    const records = [];
    let skipped = 0;
    for (const key of keys) {
      const rec = read(key);
      let ok = false;
      if (rec !== null) {
        if (kind === 'puzzle') ok = validatePuzzle(rec).ok;
        else if (kind === 'set') ok = validateSet(rec).ok;
        else {
          const puzzle = read(keyFor('puzzle', key.slice(prefix.length)));
          ok = puzzle !== null && validatePuzzle(puzzle).ok && validateSave(rec, puzzle).ok;
        }
      }
      if (ok) records.push(rec);
      else skipped += 1;
    }
    return { records, skipped };
  }

  // Small UI preferences (e.g. theme). Not records: no validator, never listed.
  function getPref(key, fallback) {
    try {
      const raw = storage.getItem(`nng:pref:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function setPref(key, value) {
    storage.setItem(`nng:pref:${key}`, JSON.stringify(value));
  }

  return { get, put, list, remove, getPref, setPref };
}
