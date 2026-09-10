export interface CompletionOverride { reason: string; by: string; at: string }
export interface CompletionItem { key: string; label: string; done: boolean; recorded: boolean; override?: CompletionOverride }
export function tenantCompletion(form: Record<string, unknown>, linkedTenantId?: number, overrides: Record<string, CompletionOverride> = {}): CompletionItem[] {
  const yes = (key: string) => form[key] === true || form[key] === 1;
  const fields = [
    ['authority_to_contact','Authority to Contact'], ['kyc_primary_id','Primary ID'], ['kyc_secondary_id','Secondary ID'],
    ['kyc_address_verification','Address Verification'], ['kyc_personal_verification','In-person Identity Check'],
  ];
  if (yes('is_joint_tenancy') && !linkedTenantId && (form.first_name_2 || form.last_name_2 || form.email_2)) fields.push(['kyc_completed_2','KYC — Applicant 2']);
  fields.push(['application_forms_completed','Application Forms'], ['proof_of_income','Proof of Income']);
  if (yes('guarantor_required')) fields.push(['guarantor_kyc_completed','Guarantor KYC'], ['guarantor_deed_received','Deed of Guarantee']);
  return fields.map(([key,label]) => {
    const recorded = key === 'proof_of_income' ? Boolean(form.income_amount || form.proof_of_income) : yes(key);
    return { key, label, recorded, done: recorded || Boolean(overrides[key]), override: overrides[key] };
  });
}
