import { describe, expect, it, vi } from 'vitest';
import { startPropertyTenantOnboarding } from './propertyTenantOnboarding';

const applicant = { first_name_1: ' Alex ', last_name_1: ' Smith ', email_1: ' alex@example.com ', phone_1: ' +447700900123 ' };

describe('property tenant onboarding', () => {
  it('saves a property-linked applicant and opens onboarding without activating a tenancy or sending messages', async () => {
    const api = { post: vi.fn().mockResolvedValue({ id: 42 }) };
    const destination = await startPropertyTenantOnboarding(api, 25, applicant);
    expect(api.post.mock.calls).toEqual([['/api/tenant-enquiries', {
      first_name_1: 'Alex', last_name_1: 'Smith', email_1: 'alex@example.com', phone_1: '+447700900123', linked_property_id: 25, status: 'new',
    }]]);
    expect(destination).toBe('/enquiries/42?onboarding=1');
  });

  it.each(['first_name_1', 'last_name_1', 'email_1', 'phone_1'] as const)('rejects missing %s before saving', async field => {
    const api = { post: vi.fn() };
    await expect(startPropertyTenantOnboarding(api, 25, { ...applicant, [field]: ' ' })).rejects.toThrow('Enter the applicant');
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each([0, NaN, 2.5])('rejects invalid property id %s before saving', async id => {
    const api = { post: vi.fn() };
    await expect(startPropertyTenantOnboarding(api, id, applicant)).rejects.toThrow('Choose a property');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('rejects an invalid email before saving', async () => {
    const api = { post: vi.fn() };
    await expect(startPropertyTenantOnboarding(api, 25, { ...applicant, email_1: 'invalid' })).rejects.toThrow('valid email');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('preserves the API error so the user sees why creation failed', async () => {
    const error = new Error('Session expired — please sign in again');
    const api = { post: vi.fn().mockRejectedValue(error) };
    await expect(startPropertyTenantOnboarding(api, 25, applicant)).rejects.toBe(error);
    expect(applicant.first_name_1).toBe(' Alex ');
  });
});
