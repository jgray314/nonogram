// Thin Web Worker shell over solve(): { id, input, opts } in, { id, result } out.
// The result also carries the persona tier, so the Expert's trials stay off
// the main thread.
import { solve } from './solver.js';
import { personaTier } from './personas.js';

self.onmessage = (event) => {
  const { id, input, opts } = event.data;
  const result = solve(input, opts);
  result.tier = personaTier(input, result.status);
  self.postMessage({ id, result });
};
