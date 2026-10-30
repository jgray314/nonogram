// Registers the end-to-end pipeline checks (pipeline-*.js) and the pin checks
// (pins-*.js) into CHECKS. Both call resetStore or seed their own records, which
// wipes every `nng:` key including the seeded puzzles, so keep this spread LAST
// in CHECKS: a check placed after it would lose its seed.
//
// The pipeline checks go end to end from an upload or a file. The pin checks are
// narrower: each seeds records, mounts one view (or `renderGrid` alone) and pins
// behavior that no other check covers. Their ids start with `pin-` and are listed
// in test/ux_registry.test.js, so deleting one fails the fast suite.
import { BACKUP_CHECKS } from './pipeline-backup.js';
import { COLOR_CHECKS } from './pipeline-color.js';
import { LEAVE_CHECKS } from './pipeline-leave.js';
import { MONO_CHECKS } from './pipeline-mono.js';
import { SAVEFILE_CHECKS } from './pipeline-savefile.js';
import { WEBPBN_CHECKS } from './pipeline-webpbn.js';
import { PINS_BACKUP_CHECKS } from './pins-backup.js';
import { PINS_GRID_CHECKS } from './pins-grid.js';
import { PINS_LIBRARY_CHECKS } from './pins-library.js';
import { PINS_SETS_CHECKS } from './pins-sets.js';

export const PIPELINE_CHECKS = [
  ...MONO_CHECKS,
  ...COLOR_CHECKS,
  ...BACKUP_CHECKS,
  ...WEBPBN_CHECKS,
  ...SAVEFILE_CHECKS,
  ...LEAVE_CHECKS,
  ...PINS_GRID_CHECKS,
  ...PINS_LIBRARY_CHECKS,
  ...PINS_BACKUP_CHECKS,
  ...PINS_SETS_CHECKS,
];
