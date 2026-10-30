// Size bound on a puzzle's optional `art` image (see format.js). Imports
// format-keys.js only.

import { ART_PREFIX, MAX_ART_SIDE } from './format-keys.js';

// JPEG start-of-frame markers: SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC).
const isSof = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/**
 * Pixel size {width, height} a JPEG data URL declares in its frame header, or
 * null when it isn't a parseable JPEG. Reads the header only; it does not decode.
 */
export function jpegSize(dataUrl) {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(ART_PREFIX)) return null;
    const bin = globalThis.atob(dataUrl.slice(ART_PREFIX.length));
    const b = (i) => bin.charCodeAt(i);
    if (bin.length < 4 || b(0) !== 0xff || b(1) !== 0xd8) return null;
    let i = 2;
    while (i + 3 < bin.length) {
      if (b(i) !== 0xff) return null;
      const marker = b(i + 1);
      if (marker === 0xff) {
        i += 1; // fill byte
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return null; // end or scan data before any frame
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        i += 2; // markers with no length
        continue;
      }
      const length = (b(i + 2) << 8) | b(i + 3);
      if (isSof(marker)) {
        if (length < 8 || i + 8 >= bin.length) return null;
        const height = (b(i + 5) << 8) | b(i + 6);
        const width = (b(i + 7) << 8) | b(i + 8);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      if (length < 2) return null;
      i += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Import-time bound on `art`: {puzzle, dropped}. A puzzle whose art isn't a
 * readable JPEG, or declares a side over MAX_ART_SIDE, comes back without the
 * art and with dropped true. It stays in the library, just with no picture
 * reveal. validatePuzzle does not check this, so stored puzzles never vanish.
 */
export function boundArt(puzzle) {
  if (puzzle.art === undefined) return { puzzle, dropped: false };
  const size = jpegSize(puzzle.art);
  if (size && Math.max(size.width, size.height) <= MAX_ART_SIDE) return { puzzle, dropped: false };
  const rest = { ...puzzle };
  delete rest.art;
  return { puzzle: rest, dropped: true };
}
