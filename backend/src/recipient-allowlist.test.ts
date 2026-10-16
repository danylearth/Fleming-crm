import {describe,expect,it} from 'vitest';
import {emailRecipientAllowed,smsRecipientAllowed} from './recipient-allowlist';

describe('recipient allowlist',()=>{
 it('allows everyone when no allowlist is set (production)',()=>{
  expect(emailRecipientAllowed('someone@example.com','')).toBe(true);
  expect(emailRecipientAllowed('someone@example.com',undefined)).toBe(true);
  expect(smsRecipientAllowed('07700 900123','')).toBe(true);
 });
 it('matches listed addresses and whole domains, ignoring case and display names',()=>{
  const list='danyl@example.com, @staging.test';
  expect(emailRecipientAllowed('Danyl@Example.com',list)).toBe(true);
  expect(emailRecipientAllowed('Sam <sam@staging.test>',list)).toBe(true);
  expect(emailRecipientAllowed('real.tenant@gmail.com',list)).toBe(false);
  expect(emailRecipientAllowed('danyl@example.com.evil.test',list)).toBe(false);
 });
 it('matches phone numbers across UK formats and WhatsApp addresses',()=>{
  const list='07700 900123';
  expect(smsRecipientAllowed('+447700900123',list)).toBe(true);
  expect(smsRecipientAllowed('whatsapp:+447700900123',list)).toBe(true);
  expect(smsRecipientAllowed('447700900123',list)).toBe(true);
  expect(smsRecipientAllowed('+447700900999',list)).toBe(false);
 });
});
