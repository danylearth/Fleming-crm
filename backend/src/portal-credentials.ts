import crypto from 'crypto';

const PREFIX = 'v1';

function encryptionKey(secret = process.env.PORTAL_CREDENTIALS_KEY) {
  if (!secret) throw new Error('PORTAL_CREDENTIALS_KEY is not configured');
  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32) throw new Error('PORTAL_CREDENTIALS_KEY must be a base64-encoded 32-byte key');
  return key;
}

export function encryptPortalPassword(value: string, secret?: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptPortalPassword(value: string, secret?: string) {
  const [version, iv, tag, ciphertext] = value.split(':');
  if (version !== PREFIX || !iv || !tag || !ciphertext) throw new Error('Stored portal password is invalid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

export function redactPropertyPortalPasswords<T extends Record<string, any>>(property: T) {
  const redacted = {
    ...property,
    leasehold_portal_password_set: Boolean(property.leasehold_portal_password_encrypted),
    management_company_portal_password_set: Boolean(property.management_company_portal_password_encrypted),
  };
  delete redacted.leasehold_portal_password_encrypted;
  delete redacted.management_company_portal_password_encrypted;
  return redacted;
}

export function redactedPortalCredentialChanges(body: Record<string, any>) {
  const redacted = { ...body };
  if ('leasehold_portal_password' in redacted) redacted.leasehold_portal_password = '[REDACTED]';
  if ('management_company_portal_password' in redacted) redacted.management_company_portal_password = '[REDACTED]';
  delete redacted.leasehold_portal_password_encrypted;
  delete redacted.management_company_portal_password_encrypted;
  return redacted;
}
