import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptPortalPassword,
  encryptPortalPassword,
  redactPropertyPortalPasswords,
  redactedPortalCredentialChanges,
} from './portal-credentials';

const secret = crypto.randomBytes(32).toString('base64');

describe('portal credentials', () => {
  it('encrypts and decrypts a portal password without storing plaintext', () => {
    const encrypted = encryptPortalPassword('Correct Horse Battery Staple', secret);
    expect(encrypted).not.toContain('Correct Horse Battery Staple');
    expect(decryptPortalPassword(encrypted, secret)).toBe('Correct Horse Battery Staple');
  });

  it('never returns encrypted values from normal property responses', () => {
    expect(redactPropertyPortalPasswords({
      id: 12,
      leasehold_portal_password_encrypted: 'secret-one',
      management_company_portal_password_encrypted: null,
    })).toEqual({
      id: 12,
      leasehold_portal_password_set: true,
      management_company_portal_password_set: false,
    });
  });

  it('redacts plaintext credentials before audit logging', () => {
    expect(redactedPortalCredentialChanges({ leasehold_portal_password: 'secret', address: '4 Example Road' }))
      .toEqual({ leasehold_portal_password: '[REDACTED]', address: '4 Example Road' });
  });
});
