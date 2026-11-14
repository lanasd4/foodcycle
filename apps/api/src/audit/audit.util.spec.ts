import { diff, redact } from './audit.util.js';

describe('redact', () => {
  it('hides secrets at any depth and keeps everything else', () => {
    const out = redact({
      email: 'a@b.c',
      password: 'x',
      nested: { passwordHash: 'h', qrToken: 't', keep: 1 },
      list: [{ token: 'z', ok: true }],
    });
    expect(out).toEqual({
      email: 'a@b.c',
      password: '[REDACTED]',
      nested: { passwordHash: '[REDACTED]', qrToken: '[REDACTED]', keep: 1 },
      list: [{ token: '[REDACTED]', ok: true }],
    });
  });
});

describe('diff', () => {
  it('returns only changed fields', () => {
    expect(diff({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ before: { b: 2 }, after: { b: 3 } });
  });
  it('returns null when nothing changed', () => {
    expect(diff({ a: 1 }, { a: 1 })).toBeNull();
  });
  it('redacts secrets in the diff', () => {
    expect(diff({ passwordHash: 'old' }, { passwordHash: 'new' })).toEqual({
      before: { passwordHash: '[REDACTED]' },
      after: { passwordHash: '[REDACTED]' },
    });
  });
});
