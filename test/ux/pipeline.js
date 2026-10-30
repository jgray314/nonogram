// Registers the end-to-end pipeline checks (pipeline-*.js) into CHECKS. They
// call resetStore, which wipes every `nng:` key including the seeded puzzles,
// so keep this spread LAST in CHECKS: a check placed after it would lose its seed.
import { BACKUP_CHECKS } from './pipeline-backup.js';
import { COLOR_CHECKS } from './pipeline-color.js';
import { LEAVE_CHECKS } from './pipeline-leave.js';
import { LINECAP_CHECKS } from './pipeline-linecap.js';
import { LINECAP_GRID_CHECKS } from './pipeline-linecap-grid.js';
import { LINECAP_LIBRARY_CHECKS } from './pipeline-linecap-library.js';
import { MONO_CHECKS } from './pipeline-mono.js';
import { SAVEFILE_CHECKS } from './pipeline-savefile.js';
import { WEBPBN_CHECKS } from './pipeline-webpbn.js';

export const PIPELINE_CHECKS = [
  ...MONO_CHECKS,
  ...COLOR_CHECKS,
  ...BACKUP_CHECKS,
  ...WEBPBN_CHECKS,
  ...SAVEFILE_CHECKS,
  ...LEAVE_CHECKS,
  ...LINECAP_CHECKS,
  ...LINECAP_GRID_CHECKS,
  ...LINECAP_LIBRARY_CHECKS,
];
