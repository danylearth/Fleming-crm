import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken, hasPermission } from './auth';

describe('hasPermission', () => {
  it('admin has permission for all roles', () => {
    expect(hasPermission('admin', 'admin')).toBe(true);
    expect(hasPermission('admin', 'manager')).toBe(true);
    expect(hasPermission('admin', 'staff')).toBe(true);
    expect(hasPermission('admin', 'viewer')).toBe(true);
  });

  it('manager has permission for manager and below', () => {
    expect(hasPermission('manager', 'admin')).toBe(false);
    expect(hasPermission('manager', 'manager')).toBe(true);
    expect(hasPermission('manager', 'staff')).toBe(true);
    expect(hasPermission('manager', 'viewer')).toBe(true);
  });

  it('staff has permission for staff and viewer only', () => {
    expect(hasPermission('staff', 'admin')).toBe(false);
    expect(hasPermission('staff', 'manager')).toBe(false);
    expect(hasPermission('staff', 'staff')).toBe(true);
    expect(hasPermission('staff', 'viewer')).toBe(true);
  });

  it('viewer only has viewer permission', () => {
    expect(hasPermission('viewer', 'admin')).toBe(false);
    expect(hasPermission('viewer', 'manager')).toBe(false);
    expect(hasPermission('viewer', 'staff')).toBe(false);
    expect(hasPermission('viewer', 'viewer')).toBe(true);
  });

  it('unknown role has no permission', () => {
    expect(hasPermission('unknown', 'viewer')).toBe(false);
  });
});

describe('generateToken / verifyToken', () => {
  const testUser = { id: 1, email: 'admin@fleming.com', role: 'admin', name: 'Admin' };

  it('generates a valid JWT that can be verified', () => {
    const token = generateToken(testUser);
    expect(typeof token).toBe('string');

    const decoded = verifyToken(token);
    expect(decoded.id).toBe(testUser.id);
    expect(decoded.email).toBe(testUser.email);
    expect(decoded.role).toBe(testUser.role);
    expect(decoded.name).toBe(testUser.name);
  });

  it('includes iat and exp claims', () => {
    const token = generateToken(testUser);
    const decoded = verifyToken(token) as any;
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60); // 7 days
  });

  it('rejects an invalid token', () => {
    expect(() => verifyToken('invalid.token.here')).toThrow();
  });

  it('rejects a tampered token', () => {
    const token = generateToken(testUser);
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(() => verifyToken(tampered)).toThrow();
  });
});
