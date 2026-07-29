import { describe, it, expect } from 'vitest';
import { IMPORT_CONFIGS, autoDetect, transformValue } from './importConfig';

// Real headers from a Tally form export
const TALLY_HEADERS = [
  '#',
  'Are you applying alone or with someone else? ',
  'First name',
  'Last name',
  'Phone number',
  'Email',
  'Company',
  'What is your date of birth?',
  'What is your nationality?',
  'Where do you currently live?',
  'What are you looking for?',
  'Are you interested in a specific property? (select property from dropdown)',
  'Is this for long-term rent (12+ months) or short-term rent (3–11 months)?',
  'Is it a house, an apartment, or a studio?',
  'What is your current employment status?',
  "What's your annual salary before tax?",
  'Please specify your current occupation and employer',
  'What is your monthly income before tax?',
  'How did you hear about Fleminglettings?',
  'Please provide any additional information or questions you have for us',
  'Consent to process your personal data for rental application purposes',
  'Response Type',
  'Submit Date (UTC)',
];

describe('autoDetect', () => {
  it('maps Tally export headers to enquiry fields', () => {
    const mapping = autoDetect(TALLY_HEADERS, IMPORT_CONFIGS['tenant-enquiries'].fields);
    expect(mapping.first_name_1).toBe(TALLY_HEADERS.indexOf('First name'));
    expect(mapping.last_name_1).toBe(TALLY_HEADERS.indexOf('Last name'));
    expect(mapping.email_1).toBe(TALLY_HEADERS.indexOf('Email'));
    expect(mapping.phone_1).toBe(TALLY_HEADERS.indexOf('Phone number'));
    expect(mapping.date_of_birth_1).toBe(TALLY_HEADERS.indexOf('What is your date of birth?'));
    expect(mapping.nationality_1).toBe(TALLY_HEADERS.indexOf('What is your nationality?'));
    expect(mapping.current_address_1).toBe(TALLY_HEADERS.indexOf('Where do you currently live?'));
    expect(mapping.employment_status_1).toBe(TALLY_HEADERS.indexOf('What is your current employment status?'));
    expect(mapping.preferred_property_type).toBe(TALLY_HEADERS.indexOf('Is it a house, an apartment, or a studio?'));
    expect(mapping.preferred_tenancy_type).toBe(TALLY_HEADERS.indexOf('Is this for long-term rent (12+ months) or short-term rent (3–11 months)?'));
    expect(mapping.notes).toBe(TALLY_HEADERS.indexOf('Please provide any additional information or questions you have for us'));
    expect(mapping.income_1).toBe(TALLY_HEADERS.indexOf("What's your annual salary before tax?"));
  });

  it('prefers occupation/employer text over Company for employer', () => {
    const mapping = autoDetect(TALLY_HEADERS, IMPORT_CONFIGS['tenant-enquiries'].fields);
    expect(mapping.employer_1).toBe(TALLY_HEADERS.indexOf('Please specify your current occupation and employer'));
  });

  it('claims each column at most once', () => {
    // landlords: name matches "Name"; email matches "Email" — no double claims
    const mapping = autoDetect(['Name', 'Email', 'Phone'], IMPORT_CONFIGS.landlords.fields);
    expect(mapping.name).toBe(0);
    expect(mapping.email).toBe(1);
    expect(mapping.phone).toBe(2);
    expect(new Set(Object.values(mapping)).size).toBe(Object.values(mapping).length);
  });

  it('leaves unmatched fields unmapped', () => {
    const mapping = autoDetect(['Something', 'Else'], IMPORT_CONFIGS.landlords.fields);
    expect(mapping.name).toBeUndefined();
  });

  it('requires a postcode for property imports', () => {
    const postcode = IMPORT_CONFIGS.properties.fields.find(f => f.key === 'postcode');
    expect(postcode?.required).toBe(true);
  });
});

describe('transformValue', () => {
  const phoneField = IMPORT_CONFIGS['tenant-enquiries'].fields.find(f => f.key === 'phone_1')!;
  const dateField = IMPORT_CONFIGS['tenant-enquiries'].fields.find(f => f.key === 'date_of_birth_1')!;
  const plainField = IMPORT_CONFIGS['tenant-enquiries'].fields.find(f => f.key === 'first_name_1')!;

  it('strips leading apostrophe from phones', () => {
    expect(transformValue("'+447123456789", phoneField)).toBe('+447123456789');
  });

  it('trims ISO datetimes to date part', () => {
    expect(transformValue('1990-08-22T00:00:00.000Z', dateField)).toBe('1990-08-22');
  });

  it('leaves plain dates alone', () => {
    expect(transformValue('1990-08-22', dateField)).toBe('1990-08-22');
  });

  it('trims whitespace', () => {
    expect(transformValue('  Jo  ', plainField)).toBe('Jo');
  });
});
