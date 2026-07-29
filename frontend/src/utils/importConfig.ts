// Per-entity CSV import field definitions + header auto-detection.
// Aliases are matched after normalization (lowercase, alphanumerics only),
// so "What is your date of birth?" matches alias "what is your date of birth".

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
  transform?: 'phone' | 'date';
}

export type ImportEntity = 'tenant-enquiries' | 'landlords' | 'properties';

export const IMPORT_CONFIGS: Record<ImportEntity, { title: string; fields: ImportField[] }> = {
  'tenant-enquiries': {
    title: 'Tenant Enquiries',
    fields: [
      { key: 'first_name_1', label: 'First Name', required: true, aliases: ['first name', 'forename'] },
      { key: 'last_name_1', label: 'Last Name', required: true, aliases: ['last name', 'surname'] },
      { key: 'email_1', label: 'Email', required: true, aliases: ['email', 'email address'] },
      { key: 'phone_1', label: 'Phone', aliases: ['phone', 'phone number', 'mobile', 'contact number'], transform: 'phone' },
      { key: 'date_of_birth_1', label: 'Date of Birth', aliases: ['dob', 'date of birth', 'what is your date of birth'], transform: 'date' },
      { key: 'nationality_1', label: 'Nationality', aliases: ['nationality', 'what is your nationality'] },
      { key: 'current_address_1', label: 'Current Address', aliases: ['address', 'current address', 'where do you currently live'] },
      { key: 'employment_status_1', label: 'Employment Status', aliases: ['employment status', 'what is your current employment status'] },
      { key: 'employer_1', label: 'Employer / Occupation', aliases: ['employer', 'occupation', 'please specify your current occupation and employer', 'company'] },
      { key: 'income_1', label: 'Annual Income', aliases: ['what s your annual salary before tax', 'annual income', 'annual salary', 'salary', 'income'] },
      { key: 'preferred_tenancy_type', label: 'Tenancy Type', aliases: ['tenancy type', 'is this for long term rent 12 months or short term rent 3 11 months'] },
      { key: 'preferred_property_type', label: 'Property Type', aliases: ['property type', 'is it a house an apartment or a studio'] },
      { key: 'notes', label: 'Notes', aliases: ['notes', 'additional information', 'please provide any additional information or questions you have for us'] },
    ],
  },
  landlords: {
    title: 'Landlords',
    fields: [
      { key: 'name', label: 'Name', required: true, aliases: ['name', 'landlord name', 'full name'] },
      { key: 'email', label: 'Email', aliases: ['email', 'email address'] },
      { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'mobile', 'contact number'], transform: 'phone' },
      { key: 'address', label: 'Address', aliases: ['address', 'correspondence address'] },
      { key: 'home_address', label: 'Home Address', aliases: ['home address'] },
      { key: 'entity_type', label: 'Entity Type', aliases: ['entity type', 'landlord type', 'type'] },
      { key: 'company_number', label: 'Company Number', aliases: ['company number', 'companies house number'] },
    ],
  },
  properties: {
    title: 'Properties',
    fields: [
      { key: 'address', label: 'Address', required: true, aliases: ['address', 'property address', 'street address'] },
      { key: 'landlord', label: 'Landlord (name or email)', required: true, aliases: ['landlord', 'landlord name', 'landlord email', 'owner'] },
      { key: 'postcode', label: 'Postcode', required: true, aliases: ['postcode', 'post code', 'zip'] },
      { key: 'property_type', label: 'Property Type', aliases: ['property type', 'type'] },
      { key: 'bedrooms', label: 'Bedrooms', aliases: ['bedrooms', 'beds', 'number of bedrooms'] },
      { key: 'rent_amount', label: 'Rent', aliases: ['rent', 'monthly rent', 'rent amount'] },
      { key: 'notes', label: 'Notes', aliases: ['notes'] },
    ],
  },
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Map field key -> CSV column index. Each column is claimed by at most one field.
export function autoDetect(headers: string[], fields: ImportField[]): Record<string, number> {
  const normalized = headers.map(normalize);
  const claimed = new Set<number>();
  const mapping: Record<string, number> = {};
  for (const field of fields) {
    for (const alias of field.aliases) {
      const target = normalize(alias);
      const idx = normalized.findIndex((h, i) => h === target && !claimed.has(i));
      if (idx !== -1) {
        mapping[field.key] = idx;
        claimed.add(idx);
        break;
      }
    }
  }
  return mapping;
}

// Apply a field's transform to a raw CSV value.
export function transformValue(value: string, field: ImportField): string {
  let v = value.trim();
  if (field.transform === 'phone') v = v.replace(/^'/, '');
  if (field.transform === 'date' && /^\d{4}-\d{2}-\d{2}T/.test(v)) v = v.slice(0, 10);
  return v;
}
