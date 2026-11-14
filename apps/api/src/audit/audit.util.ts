/** Keys that must never reach the audit log, at any depth. */
const SECRET_KEYS = /^(password|passwordHash|password_hash|token|accessToken|qrToken|qr_token|secret)$/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.test(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

/**
 * Returns only the fields that changed between two snapshots,
 * as { before, after } — the shape stored in audit_logs.
 */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  if (Object.keys(a).length === 0) return null;
  return { before: redact(b) as Record<string, unknown>, after: redact(a) as Record<string, unknown> };
}
