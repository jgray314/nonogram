// Pure pixel-array helpers for turning an image into a nonogram grid.
// No DOM: the browser passes in canvas ImageData.data.

// Luminance of pixel i (index into rgba / 4), composited over white by alpha.
function pixelLuminance(rgba, i) {
  const o = i * 4;
  const a = rgba[o + 3] / 255;
  const r = rgba[o] * a + 255 * (1 - a);
  const g = rgba[o + 1] * a + 255 * (1 - a);
  const b = rgba[o + 2] * a + 255 * (1 - a);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Pixel range [start, end) of cell k out of n over a span of `len` pixels.
// When the span is smaller than n the range can be empty; then it collapses to
// the single pixel nearest the cell's center.
export function cellRange(k, n, len) {
  const start = Math.floor((k * len) / n);
  const end = Math.floor(((k + 1) * len) / n);
  if (end > start) return [start, end];
  const p = Math.min(Math.floor(((k + 0.5) * len) / n), len - 1);
  return [p, p + 1];
}

export function cellLuminance(rgba, imgW, imgH, crop, cols, rows) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    const [y0, y1] = cellRange(r, rows, crop.h);
    const row = [];
    for (let c = 0; c < cols; c++) {
      const [x0, x1] = cellRange(c, cols, crop.w);
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += pixelLuminance(rgba, (crop.y + y) * imgW + crop.x + x);
        }
      }
      row.push(sum / ((y1 - y0) * (x1 - x0)));
    }
    out.push(row);
  }
  return out;
}

// Otsu threshold over rounded 0..255 values. Class 0 is values < t.
// Returns the smallest t in 1..255 maximizing between-class variance, or 128
// when no split separates the values.
export function otsu(values) {
  const hist = new Array(256).fill(0);
  for (const v of values) {
    hist[Math.min(255, Math.max(0, Math.round(v)))]++;
  }
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let best = -1;
  let bestT = 128;
  let w0 = 0;
  let sum0 = 0;
  for (let t = 1; t < 256; t++) {
    w0 += hist[t - 1];
    sum0 += (t - 1) * hist[t - 1];
    const w1 = total - w0;
    if (w0 === 0 || w1 === 0) continue;
    const diff = sum0 / w0 - (sumAll - sum0) / w1;
    const variance = w0 * w1 * diff * diff;
    if (variance > best * (1 + 1e-12)) {
      best = variance;
      bestT = t;
    }
  }
  return bestT;
}

// Dark (below threshold) is filled. `invert` flips the result.
export function binarize(lum, t, invert = false) {
  return lum.map((row) =>
    row.map((v) => {
      const filled = v < t;
      return (invert ? !filled : filled) ? 1 : 0;
    }),
  );
}
