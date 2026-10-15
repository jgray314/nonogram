// Minimal PNG decoder for the color research script. Non-interlaced, 8-bit
// grayscale / gray+alpha / RGB / RGBA / palette only; anything else throws.
// Transparency (alpha, tRNS) is returned as alpha and composited over white by
// the caller. An embedded color profile (iCCP) is not applied: colors are read
// as sRGB. Both that and an out-of-range palette index come back as warnings.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decode a PNG buffer to {width, height, rgba: Uint8ClampedArray, warnings: string[]}. */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');
  let pos = 8;
  let header = null;
  let palette = null;
  let trns = null;
  const warnings = [];
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'iCCP') {
      warnings.push(
        'has an embedded color profile (iCCP); colors are read as sRGB, so wide-gamut images (for example Display-P3 phone exports) will shift',
      );
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (!header) throw new Error('PNG has no IHDR chunk');
  const { width, height, depth, colorType, interlace } = header;
  if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth} (need 8)`);
  if (interlace !== 0) throw new Error('unsupported PNG: interlaced');
  if (!Object.hasOwn(CHANNELS, colorType))
    throw new Error(`unsupported PNG color type ${colorType}`);
  if (colorType === 3 && !palette) throw new Error('palette PNG without PLTE chunk');

  const bpp = CHANNELS[colorType];
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('PNG pixel data is truncated');

  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0;
      const b = y > 0 ? px[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      else if (filter !== 0) throw new Error(`bad PNG filter type ${filter}`);
      px[dst + x] = v & 255;
    }
  }

  // Color-key transparency (tRNS for color types 0 and 2): samples are 16-bit
  // big-endian; at 8 bits per sample the value is in the low byte.
  const key =
    colorType === 0 && trns && trns.length >= 2
      ? [trns.readUInt16BE(0)]
      : colorType === 2 && trns && trns.length >= 6
        ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)]
        : null;
  const palSize = palette ? Math.floor(palette.length / 3) : 0;
  let badIndex = false;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const s = i * bpp;
    if (colorType === 0) {
      rgba.set([px[s], px[s], px[s], key && px[s] === key[0] ? 0 : 255], o);
    } else if (colorType === 2) {
      const hit = key && px[s] === key[0] && px[s + 1] === key[1] && px[s + 2] === key[2];
      rgba.set([px[s], px[s + 1], px[s + 2], hit ? 0 : 255], o);
    } else if (colorType === 3) {
      if (px[s] >= palSize) {
        badIndex = true;
        rgba.set([0, 0, 0, 255], o);
        continue;
      }
      const p = px[s] * 3;
      rgba.set(
        [
          palette[p],
          palette[p + 1],
          palette[p + 2],
          trns && px[s] < trns.length ? trns[px[s]] : 255,
        ],
        o,
      );
    } else if (colorType === 4) {
      rgba.set([px[s], px[s], px[s], px[s + 1]], o);
    } else {
      rgba.set([px[s], px[s + 1], px[s + 2], px[s + 3]], o);
    }
  }
  if (badIndex) {
    warnings.push(
      `has palette indexes past the end of PLTE (PLTE has ${palSize}); those pixels are read as black`,
    );
  }
  return { width, height, rgba, warnings };
}

// ---- encoder (for the --preview contact sheets) --------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Encode 8-bit RGB pixels (Uint8Array, 3 bytes per pixel) as a PNG buffer. */
export function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(
      raw,
      y * (width * 3 + 1) + 1,
    );
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
