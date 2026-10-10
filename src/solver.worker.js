// Thin Web Worker shell over solveAndRate(): { id, input, opts } in, { id, result } out.
// The result is solve()'s plus the persona tier, so the Expert's trials stay
// off the main thread.
import { solveAndRate } from './personas.js';

self.onmessage = (event) => {
  const { id, input, opts } = event.data;
  self.postMessage({ id, result: solveAndRate(input, opts) });
};
