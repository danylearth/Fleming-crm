const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: unknown): boolean {
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}

export function isValidUkMobile(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const compact = value.replace(/[\s()-]/g, '');
  return /^07\d{9}$/.test(compact) || /^\+447\d{9}$/.test(compact);
}

export function normalizePropertyTypes(value: unknown): string | null {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const cleaned = values.map((item) => String(item).trim()).filter(Boolean);
  return cleaned.length ? [...new Set(cleaned)].join(', ') : null;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

export function applicationFormIssues(data: Record<string, any>): string[] {
  const required = [
    'first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'ni_number',
    'current_address_line_1', 'current_address_city', 'current_address_postcode', 'years_at_current_address',
    'residency_status', 'marital_status', 'gross_annual_income', 'employment_status',
    'bank_account_name', 'bank_sort_code', 'bank_account_number',
    'property_address', 'preferred_start_date', 'rental_period', 'tenancy_duration', 'rental_amount',
    'deposit_amount', 'next_of_kin_name', 'next_of_kin_address',
    'next_of_kin_phone', 'next_of_kin_relationship', 'legal_proceedings',
  ];
  const issues = required.filter((key) => isBlank(data[key]));
  const requiredChoices = [
    'has_joint_applicants', 'has_employer_reference', 'has_landlord_reference',
    'has_personal_reference', 'has_additional_income', 'has_loans', 'has_credit_cards',
    'has_other_occupants', 'has_pets', 'deposit_contributor', 'has_guarantor',
  ];
  for (const key of requiredChoices) if (typeof data[key] !== 'boolean') issues.push(key);

  if (!Number.isInteger(Number(data.years_at_current_address)) || Number(data.years_at_current_address) < 0) {
    issues.push('years_at_current_address');
  }
  const previousAddressKeys = ['previous_address_line_1', 'previous_address_city', 'previous_address_postcode', 'years_at_previous_address'];
  if (previousAddressKeys.some((key) => !isBlank(data[key]))) {
    for (const key of previousAddressKeys) if (isBlank(data[key])) issues.push(key);
    if (!Number.isInteger(Number(data.years_at_previous_address)) || Number(data.years_at_previous_address) < 0) {
      issues.push('years_at_previous_address');
    }
  }
  if (!isValidEmail(data.email)) issues.push('email');

  if (['Employed', 'Part-time Employed'].includes(data.employment_status)) {
    for (const key of ['employer_name', 'job_title', 'employment_start_date', 'employer_department', 'employer_address']) {
      if (isBlank(data[key])) issues.push(key);
    }
    if (typeof data.has_employment_further_info !== 'boolean') issues.push('has_employment_further_info');
    if (data.has_employment_further_info && isBlank(data.employment_further_info)) issues.push('employment_further_info');
  }
  if (data.employment_status === 'Self-Employed') {
    if (!['sole_trader', 'contractor', 'limited_company'].includes(data.self_employed_type)) issues.push('self_employed_type');
    if (typeof data.has_previous_self_assessments !== 'boolean') issues.push('has_previous_self_assessments');
    if (typeof data.provide_accountant_details !== 'boolean') issues.push('provide_accountant_details');
    if (data.self_employed_type === 'contractor') {
      for (const key of ['contractor_annual_income', 'contractor_length_of_employment']) if (isBlank(data[key])) issues.push(key);
    } else {
      for (const key of ['business_name', 'self_employed_annual_income', 'years_trading']) if (isBlank(data[key])) issues.push(key);
      if (data.self_employed_type === 'limited_company' && isBlank(data.company_number)) issues.push('company_number');
    }
    if (data.provide_accountant_details && isBlank(data.accountant_details)) issues.push('accountant_details');
  }
  if (data.employment_status === 'Student') {
    for (const key of ['student_institution', 'student_address', 'student_course', 'student_graduation_year']) {
      if (isBlank(data[key])) issues.push(key);
    }
  }
  if (['Private tenant', 'Housing association tenant', 'Council tenant'].includes(data.residency_status)) {
    for (const key of ['current_landlord_name', 'current_landlord_phone', 'current_landlord_email', 'current_monthly_rent']) {
      if (isBlank(data[key])) issues.push(key);
    }
    if (typeof data.landlord_contact_authority !== 'boolean') issues.push('landlord_contact_authority');
  }
  if (data.has_joint_applicants && isBlank(data.joint_applicants)) issues.push('joint_applicants');
  if (data.has_additional_income && isBlank(data.additional_income_details)) issues.push('additional_income_details');
  if (data.has_loans && isBlank(data.loans)) issues.push('loans');
  if (data.has_credit_cards && isBlank(data.credit_cards)) issues.push('credit_cards');
  if (data.has_other_occupants && isBlank(data.other_occupants)) issues.push('other_occupants');
  if (data.has_pets && isBlank(data.pets)) issues.push('pets');
  if (String(data.legal_proceedings).toLowerCase() === 'yes' && isBlank(data.legal_proceedings_details)) issues.push('legal_proceedings_details');
  if (data.has_employer_reference) {
    for (const key of ['employer_reference_name', 'employer_reference_phone', 'employer_reference_email']) if (isBlank(data[key])) issues.push(key);
    if (typeof data.employer_reference_consent !== 'boolean') issues.push('employer_reference_consent');
  }
  if (data.has_landlord_reference) {
    for (const key of ['landlord_reference_name', 'landlord_reference_phone', 'landlord_reference_email']) if (isBlank(data[key])) issues.push(key);
    if (typeof data.landlord_reference_consent !== 'boolean') issues.push('landlord_reference_consent');
  }
  if (data.has_personal_reference) {
    for (const key of ['personal_reference_name', 'personal_reference_phone', 'personal_reference_email', 'personal_reference_address']) {
      if (isBlank(data[key])) issues.push(key);
    }
  }
  if (!/^\d{2}-\d{2}-\d{2}$/.test(String(data.bank_sort_code || ''))) issues.push('bank_sort_code');
  if (!/^\d{8}$/.test(String(data.bank_account_number || ''))) issues.push('bank_account_number');
  if (data.deposit_contributor && isBlank(data.deposit_contributor_details)) issues.push('deposit_contributor_details');
  if (data.has_guarantor) {
    for (const key of ['guarantor_name', 'guarantor_phone', 'guarantor_email', 'guarantor_address', 'guarantor_annual_income', 'guarantor_employment_status']) {
      if (isBlank(data[key])) issues.push(key);
    }
    if (typeof data.guarantor_contact_consent !== 'boolean') issues.push('guarantor_contact_consent');
  }
  return [...new Set(issues)];
}
