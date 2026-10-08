export interface CompletionOverride { reason: string; by: string; at: string }
export interface CompletionDocument { doc_type: string; original_name?: string; review_status?: string }
export interface CompletionItem { key: string; label: string; done: boolean; recorded: boolean; override?: CompletionOverride; evidence?: string }
export function tenantCompletion(form: Record<string, unknown>, linkedTenantId?: number, overrides: Record<string, CompletionOverride> = {}, documents: CompletionDocument[] = []): CompletionItem[] {
  const yes = (key: string) => form[key] === true || form[key] === 1;
  const fields = [
    ['kyc_primary_id','Primary ID'], ['kyc_secondary_id','Secondary ID'],
    ['kyc_address_verification','Address Verification'],
  ];
  if (yes('is_joint_tenancy') && !linkedTenantId && (form.first_name_2 || form.last_name_2 || form.email_2)) fields.push(['kyc_completed_2','KYC — Applicant 2']);
  fields.push(['application_forms_completed','Application Forms'], ['proof_of_income','Proof of Income']);
  if (yes('guarantor_required')) fields.push(['guarantor_kyc_completed','Guarantor KYC'], ['guarantor_deed_received','Deed of Guarantee']);
  return fields.map(([key,label]) => {
    const recorded = key === 'proof_of_income' ? Boolean(form.income_amount || form.proof_of_income) : yes(key);
    const evidence = documents.find(document => {
      if (document.review_status === 'rejected') return false;
      const type = document.doc_type.toLowerCase().replace(/[_-]/g, ' ').trim();
      switch (key) {
        case 'kyc_primary_id': return ['primary identification', 'primary id'].includes(type);
        case 'kyc_secondary_id': return ['secondary identification', 'secondary id', 'bank statement', 'bank statements'].includes(type);
        case 'kyc_address_verification': return ['proof of address', 'address verification', 'utility bill', 'bank statement', 'bank statements'].includes(type)
          // Legacy imports filed utility bills under secondary identification.
          || (type === 'secondary identification' && /\butility bill\b/i.test(document.original_name || ''));
        case 'application_forms_completed': return ['application form(s)', 'application form', 'application forms'].includes(type);
        case 'proof_of_income': return type === 'proof of income';
        case 'guarantor_deed_received': return ['guarantor deed', 'deed of guarantee', 'guarantor deed of guarantee'].includes(type);
        default: return false;
      }
    });
    return { key, label, recorded, done: recorded || Boolean(evidence) || Boolean(overrides[key]), override: overrides[key], evidence: evidence ? evidence.original_name || evidence.doc_type : undefined };
  });
}
