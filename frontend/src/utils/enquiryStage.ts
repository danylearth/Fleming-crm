export function enquiryStageLabel(stage: string, enquiry: {existing_tenancy_application?: unknown; source_tenant_id?: unknown}) {
  const existing = enquiry.existing_tenancy_application === true || Number(enquiry.existing_tenancy_application) === 1 || Number(enquiry.source_tenant_id) > 0;
  return existing && stage.trim().toLowerCase() === 'new' ? 'Existing Tenant - New Onboarding' : stage;
}

export interface OnboardingCardRecord {
  status?: string;
  onboarding_stage?: string;
  application_form_completed?: number | boolean;
  application_review_status?: string;
  application_changes_sent_at?: string;
  joint_partner_id?: number;
  tenancy_agreement_status?: string;
  tenancy_agreement_completed?: number | boolean;
  balance_payment_requested?: number | boolean;
  balance_payment_received?: number | boolean;
}

export function onboardingCardStage(enquiry: OnboardingCardRecord, partner?: OnboardingCardRecord) {
  if (enquiry.status !== 'onboarding') return undefined;
  if (enquiry.balance_payment_received) return enquiry.onboarding_stage || 'Final Balance Received';
  if (enquiry.balance_payment_requested) return 'Awaiting Final Balance';
  if (enquiry.tenancy_agreement_status === 'completed' || enquiry.tenancy_agreement_completed) return 'Tenancy Agreement Signed';
  const waitingForChanges = (record: OnboardingCardRecord) => record.application_review_status === 'changes_requested' && !!record.application_changes_sent_at;
  if (waitingForChanges(enquiry) || partner && waitingForChanges(partner)) return 'Awaiting Application Changes';
  const submitted = (record?: OnboardingCardRecord) => !!record?.application_form_completed;
  if (submitted(enquiry) && (!enquiry.joint_partner_id || submitted(partner)) &&
    (enquiry.application_review_status !== 'approved' || partner && partner.application_review_status !== 'approved')) return 'Application Ready for Review';
  return enquiry.onboarding_stage && enquiry.onboarding_stage !== 'Onboarding' ? enquiry.onboarding_stage : undefined;
}
