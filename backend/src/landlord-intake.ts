export const editableLandlordIntakeFields = [
  'registration_type', 'company_name', 'company_number', 'company_address', 'companyCity', 'companyPostcode', 'beneficial_owners',
  'firstName', 'surname', 'email', 'phone', 'dob', 'nationality', 'address', 'address_line_2', 'city', 'postcode', 'yearsAtAddress',
  'firstName2', 'surname2', 'email2', 'phone2', 'dob2', 'nationality2', 'address2', 'address_line_22', 'city2', 'postcode2', 'yearsAtAddress2',
  'propertyAddress', 'propertyAddress2', 'propertyCity', 'propertyPostcode', 'bedrooms', 'offroadParking', 'alreadyLet', 'mortgageAttached',
  'tenancyType', 'currentManagement', 'lengthOfLet', 'monthlyRentalIncome', 'ownershipStructure', 'propertyCondition',
  'epcCertificate', 'eicrCertificate', 'gasCertificate', 'additionalNotes', 'consideringRentIncrease', 'newRentAmount', 'lookingForNewTenant', 'newTenantReason',
];

export function landlordIntakePatch(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid enquiry fields');
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!editableLandlordIntakeFields.includes(key)) throw new Error(`This enquiry field cannot be changed: ${key}`);
    if (typeof entry !== 'string' || entry.length > 10000) throw new Error(`Invalid value for ${key}`);
    result[key] = entry.trim();
  }
  if ('registration_type' in result && !['Sole', 'Individual', 'Joint', 'Limited Company'].includes(result.registration_type)) throw new Error('Choose a valid registration type');
  for (const key of ['email', 'email2']) if (result[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result[key])) throw new Error('Enter a valid email address');
  return result;
}
