import { describe, expect, it } from 'vitest';
import { applicationFormIssues, isValidEmail, isValidUkMobile, normalizePropertyTypes } from './public-form-validation';

function validApplication(overrides: Record<string, unknown> = {}) {
  return {
    first_name: 'Alex', last_name: 'Smith', email: 'alex@example.test', phone: '07700900123',
    date_of_birth: '20/08/1990', ni_number: 'QQ 12 34 56 C', current_address_line_1: '1 High Street',
    current_address_city: 'Wolverhampton', current_address_postcode: 'WV1 1AA', years_at_current_address: '0',
    residency_status: 'Lodger', marital_status: 'Single', gross_annual_income: '30000', employment_status: 'Unemployed',
    bank_account_name: 'Alex Smith', bank_sort_code: '11-12-14', bank_account_number: '01234567',
    property_address: '2 High Street', preferred_start_date: '01/09/2026', rental_period: 'Monthly',
    tenancy_duration: '12 months', rental_amount: '900', deposit_amount: '1038', next_of_kin_name: 'Sam Smith',
    next_of_kin_address: '3 High Street', next_of_kin_postcode: 'WV1 1AA', next_of_kin_phone: '07700900124', next_of_kin_email: 'kin@example.com', next_of_kin_relationship: 'Sibling',
    legal_proceedings: 'No', has_joint_applicants: false, has_employer_reference: false,
    has_landlord_reference: false, has_personal_reference: false, has_additional_income: false,
    has_loans: false, has_credit_cards: false, has_other_occupants: false, has_pets: false,
    deposit_contributor: false, has_guarantor: false,
    ...overrides,
  };
}

describe('public form validation', () => {
  it('accepts UK mobile formats and rejects malformed values', () => {
    expect(isValidUkMobile('07700 900123')).toBe(true);
    expect(isValidUkMobile('+44 7700 900123')).toBe(true);
    expect(isValidUkMobile('07845111')).toBe(false);
    expect(isValidEmail('alex@example.test')).toBe(true);
    expect(isValidEmail('alex.example.test')).toBe(false);
  });

  it('stores multiple property types as one CRM value', () => {
    expect(normalizePropertyTypes(['House', 'Studio', 'House'])).toBe('House, Studio');
    expect(normalizePropertyTypes('House')).toBe('House');
  });

  it('does not force a previous address or landlord details for a lodger', () => {
    expect(applicationFormIssues(validApplication())).toEqual([]);
  });

  it('requires conditional details only after a Yes answer', () => {
    const issues = applicationFormIssues(validApplication({ has_loans: true, has_personal_reference: true }));
    expect(issues).toContain('loans');
    expect(issues).toContain('personal_reference_name');
    expect(issues).toContain('personal_reference_email');
  });

  it('requires the revised employed fields', () => {
    const issues = applicationFormIssues(validApplication({ employment_status: 'Employed' }));
    expect(issues).toEqual(expect.arrayContaining([
      'employer_name', 'job_title', 'employment_start_date', 'employer_department',
      'employer_address', 'has_employment_further_info',
    ]));
  });

  it('rejects malformed bank details and fractional address years', () => {
    const issues = applicationFormIssues(validApplication({
      bank_sort_code: '111214', bank_account_number: '123', years_at_current_address: '1.5',
    }));
    expect(issues).toEqual(expect.arrayContaining(['bank_sort_code', 'bank_account_number', 'years_at_current_address']));
  });
});
