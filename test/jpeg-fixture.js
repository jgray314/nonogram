import { ART_PREFIX } from '../src/format.js';

/** A data URL for a JPEG header only: SOI, an APP0, a frame header of the given size, EOI. */
export function jpegHeader(width, height, marker = 0xc0) {
  const bytes = [
    ...[0xff, 0xd8],
    ...[0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46], // APP0, length 4 (two payload bytes)
    ...[0xff, marker, 0x00, 0x0b, 0x08, height >> 8, height & 255, width >> 8, width & 255],
    ...[0x01, 0x01, 0x11, 0x00],
    ...[0xff, 0xd9],
  ];
  return ART_PREFIX + Buffer.from(bytes).toString('base64');
}
