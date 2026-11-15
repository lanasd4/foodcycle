import { InitIdentityAndAudit1731600000000 } from './1731600000000-InitIdentityAndAudit.js';
import { OffersAndSettings1731700000000 } from './1731700000000-OffersAndSettings.js';

/** Every migration, in order. Listed explicitly (no globs) so it works the same in ESM, tests and builds. */
export const MIGRATIONS = [InitIdentityAndAudit1731600000000, OffersAndSettings1731700000000];
