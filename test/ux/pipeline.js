// Registry for the end-to-end pipeline checks. Each lane adds its own
// test/ux/pipeline-*.js and ONE import plus ONE spread line here, e.g.
//   import { MONO_CHECKS } from './pipeline-mono.js';
//   export const PIPELINE_CHECKS = [...MONO_CHECKS];
import { COLOR_CHECKS } from './pipeline-color.js';
export const PIPELINE_CHECKS = [...COLOR_CHECKS];
