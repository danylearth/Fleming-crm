export interface PropertyApplicant {
  first_name_1: string;
  last_name_1: string;
  email_1: string;
  phone_1: string;
}

export async function startPropertyTenantOnboarding(
  api: { post: (endpoint: string, body: Record<string, unknown>) => Promise<{ id: number }> },
  propertyId: number,
  applicant: PropertyApplicant,
) {
  const details = {
    first_name_1: applicant.first_name_1.trim(),
    last_name_1: applicant.last_name_1.trim(),
    email_1: applicant.email_1.trim(),
    phone_1: applicant.phone_1.trim(),
  };
  if (!Number.isInteger(propertyId) || propertyId <= 0) throw new Error('Choose a property before adding an applicant.');
  if (Object.values(details).some(value => !value)) throw new Error('Enter the applicant’s first name, last name, email and phone.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email_1)) throw new Error('Enter a valid email address.');

  // Save the applicant before onboarding; the wizard enforces the service
  // agreement and conversion checks before a tenancy can be created.
  const enquiry = await api.post('/api/tenant-enquiries', {
    ...details,
    linked_property_id: propertyId,
    status: 'new',
  });
  return `/enquiries/${enquiry.id}?onboarding=1`;
}
