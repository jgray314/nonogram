// Thin Web Worker shell over solve(): { id, input, opts } in, { id, result } out.
import { solve } from './solver.js';

self.onmessage = (event) => {
  const { id, input, opts } = event.data;
  self.postMessage({ id, result: solve(input, opts) });
};
