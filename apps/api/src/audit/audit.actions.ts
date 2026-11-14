/** Every audited action. Keep in sync with section 8.2 of the technical plan. */
export const AUDIT_ACTIONS = [
  'auth.register',
  'auth.login.success',
  'auth.login.failed',
  'org.verified',
  'org.suspended',
  'org.reactivated',
  'org.settings.updated',
  'offer.created',
  'offer.updated',
  'offer.cancelled',
  'offer.expired',
  'claim.created',
  'claim.approved',
  'claim.rejected',
  'claim.approval_timeout',
  'claim.cancelled',
  'claim.expired',
  'claim.picked_up',
  'rating.created',
  'trust_score.changed',
  'settings.weights.updated',
  'settings.updated',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntityType = 'user' | 'organization' | 'offer' | 'claim' | 'rating' | 'settings';
