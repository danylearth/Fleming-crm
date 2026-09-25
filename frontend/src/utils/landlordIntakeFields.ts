export type IntakeField = { key: string; label: string; options?: string[]; multiline?: boolean };
const field = (key: string, label: string, options?: string[]): IntakeField => ({ key, label, options });
const person = (suffix = '') => [
  field('firstName' + suffix, 'First Name'), field('surname' + suffix, 'Surname'), field('email' + suffix, 'Email'), field('phone' + suffix, 'Phone'),
  field('dob' + suffix, 'Date of Birth'), field('nationality' + suffix, 'Nationality'), field('address' + suffix, 'Address Line 1'),
  field('address_line_2' + suffix, 'Address Line 2'), field('city' + suffix, 'City / Town'), field('postcode' + suffix, 'Postcode'), field('yearsAtAddress' + suffix, 'Years at Address'),
];
export const landlordIntakeSections: { title: string; fields: IntakeField[]; readonly?: boolean }[] = [
  { title: 'Registration', fields: [field('registration_type', 'Registration Type', ['Sole', 'Joint', 'Limited Company'])] },
  { title: 'Landlord / Company Contact', fields: person() },
  { title: 'Joint Landlord', fields: person('2') },
  { title: 'Company Details', fields: [field('company_name', 'Company Name'), field('company_number', 'Company Number'), field('company_address', 'Registered Address'), field('companyCity', 'City / Town'), field('companyPostcode', 'Postcode'), { key: 'beneficial_owners', label: 'Ultimate Beneficial Owners', multiline: true }] },
  { title: 'Property Details', fields: [field('propertyAddress', 'Address Line 1'), field('propertyAddress2', 'Address Line 2'), field('propertyCity', 'City / Town'), field('propertyPostcode', 'Postcode'), field('bedrooms', 'Bedrooms'), field('offroadParking', 'Off-road Parking', ['Yes', 'No']), field('alreadyLet', 'Already Let', ['Yes', 'No']), field('mortgageAttached', 'Mortgage Attached', ['Yes', 'No']), field('ownershipStructure', 'Ownership Structure', ['Owned outright', 'Mortgaged', 'Commercial investment', 'Sub-let', 'Other']), field('propertyCondition', 'Property Condition', ['Newly refurbished', 'Very good', 'Good', 'Average', 'Poor', 'Needs improvement', 'Unsure'])] },
  { title: 'Current Tenancy', fields: [field('tenancyType', 'Tenancy Type', ['Ad-hoc', 'Contractual', 'Fixed Term', 'Monthly Rolling', 'No Contract']), field('currentManagement', 'Current Management', ['Independently', 'Estate Agent', 'Letting Agency', 'Housing Association', 'Unsure']), field('lengthOfLet', 'Length of Let (months)'), field('monthlyRentalIncome', 'Monthly Rental Income (£)'), field('consideringRentIncrease', 'Considering a Rent Increase', ['Yes', 'No']), field('newRentAmount', 'Proposed Rent (£)'), field('lookingForNewTenant', 'Looking for a New Tenant', ['Yes', 'No']), field('newTenantReason', 'Reason for a New Tenant')] },
  { title: 'Certificates Reported by Landlord', fields: [field('epcCertificate', 'EPC Certificate', ['Yes', 'No', 'Unsure']), field('eicrCertificate', 'EICR Certificate', ['Yes', 'No', 'Unsure']), field('gasCertificate', 'Gas Certificate', ['Yes', 'No', 'Unsure', 'N/A (No Gas)'])] },
  { title: 'Additional Information', fields: [{ key: 'additionalNotes', label: 'Additional Notes / Questions', multiline: true }] },
  { title: 'Submitted Consent & Preferences', readonly: true, fields: [field('marketing_email', 'Marketing Email'), field('marketing_sms', 'Marketing SMS'), field('marketing_phone', 'Marketing Phone'), field('marketing_post', 'Marketing Post'), field('marketing_preferences', 'Marketing Preferences'), field('termsConsent', 'Terms Accepted'), field('marketingPolicyConsent', 'Marketing Policy Accepted')] },
];
