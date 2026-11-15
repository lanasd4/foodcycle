import { InitIdentityAndAudit1731600000000 } from './1731600000000-InitIdentityAndAudit.js';
import { OffersAndSettings1731700000000 } from './1731700000000-OffersAndSettings.js';
import { Claims1731800000000 } from './1731800000000-Claims.js';

/** Every migration, in order. Listed explicitly (no globs) so it works the same in ESM, tests and builds. */
export const MIGRATIONS = [InitIdentityAndAudit1731600000000, OffersAndSettings1731700000000, Claims1731800000000];
