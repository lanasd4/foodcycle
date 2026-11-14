import { registerSchema } from './auth.schemas.js';

const valid = {
  email: '  Owner@Yasmin.SY ',
  password: 'a-strong-password',
  role: 'DONOR',
  organization: {
    name: 'مطعم الياسمين',
    type: 'RESTAURANT',
    phone: '+963 11 123 4567',
    address: 'شارع المزة الرئيسي',
    area: 'المزة',
    location: { lat: 33.5, lng: 36.25 },
  },
};

describe('registerSchema', () => {
  it('accepts a valid donor and normalizes the email', () => {
    const r = registerSchema.safeParse(valid);
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe('owner@yasmin.sy');
  });
  it('rejects an org type that does not match the role', () => {
    const r = registerSchema.safeParse({ ...valid, role: 'CHARITY' });
    expect(r.success).toBe(false);
  });
  it('does not allow self-registering as ADMIN', () => {
    expect(registerSchema.safeParse({ ...valid, role: 'ADMIN' }).success).toBe(false);
  });
  it('rejects passwords longer than 72 bytes (bcrypt limit)', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'ب'.repeat(40) }).success).toBe(false);
  });
});
