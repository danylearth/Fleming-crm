const fs=require('fs'),path=require('path');
module.exports=()=>{
 // Use the exact standard onboarding wizard, including Guarantor Review.
 let code=fs.readFileSync('tmp/guarantor-crm-preview/frontend/src/components/ui/OnboardingWizard.tsx','utf8');
 const fields='/@fs/'+path.resolve('prototypes/reapplication-review/current-fields.tsx').replaceAll('\\','/');
 const guarantor='/@fs/'+path.resolve('prototypes/guarantor-crm-review/GuarantorReview.tsx').replaceAll('\\','/');
 code=code.replace("'../GuarantorReview'",JSON.stringify(guarantor));
 code=`import {ReapplicationInvite} from '${fields}';\n`+code;
 code=code.replace('useState(3);','useState(-1);');
 code=code.replace('if (!guarantor || guarantor.required===null) setActiveStep(3);','if (!enquiry.application_form_completed) setActiveStep(-1);\n    else if (!guarantor || guarantor.required===null) setActiveStep(3);');
 code=code.replace('else if (!enquiry.holding_deposit_requested) setActiveStep(0);','').replace('else if (!enquiry.holding_deposit_received) setActiveStep(1);','');
 code=code.replace('for (let i = 0; i < stepIdx; i++) {','for (let i = 2; i < stepIdx; i++) {\n      if (i===6||i===7) continue;');
 code=code.replace(/const navigationSteps: .*? = .*?;\r?\n/,`const applicationStage={...steps[2],index:-1};
  const navigationSteps: {label:string;index:number;icon:React.ElementType;getStatus:()=>string;desc:string;readyForApproval?:boolean}[] = [applicationStage,{...steps[3],index:3},{...steps[4],index:4},{...steps[5],index:5,label:'Tenancy Agreement'},{...steps[8],index:8}];\n`);
 code=code.replace('navigationSteps.splice(3,0,','navigationSteps.splice(2,0,');
 code=code.replace('{/* Step 1: Request Holding Deposit */}',`<StepCard idx={-1} step={applicationStage} activeStep={displayedStep} actions={!enquiry.application_form_sent&&!enquiry.application_form_completed?<ReapplicationInvite embedded/>:undefined}><section aria-label="Application form progress" className="rounded-xl border border-[var(--border-input)] p-4 space-y-4"><h5 className="font-semibold text-base">Application Form</h5>{applicationContent}</section></StepCard>{/* Step 1: Request Holding Deposit */}`);
 code=code.replaceAll('Complete the handover stage to finish onboarding','Complete the application, checks and agreement to finish onboarding');
 code=code.replace('Handover is saved. Tenant records still need to be created.','The new application is ready for completion.');
 code=code.replace("`${name}'s record now exists in the Tenant module.`","`${name}'s new tenancy is linked to the existing tenant record. The previous tenancy is retained in history.`");
 code=code.replaceAll('https://apply.fleminglettings.co.uk/','http://127.0.0.1:8989/application.html?token=');
 code=code.replace(/if \(await confirmAction\('Send each applicant their own application link\?'\)\) void sendApplicationEmail\(\{subject:'',bodyHtml:''\}\);/,"notify('Test preview — no invitation sent.');");
 // Existing-tenant onboarding has no holding-deposit, balance or handover stages.
 code=code.replace('else if (!enquiry.balance_payment_received) setActiveStep(6);','');
 code=code.replace('else if (!enquiry.handover_date && !enquiry.handover_not_required) setActiveStep(7);','');
 code=code.replace("desc: onboardingComplete ? 'Tenant records created successfully'", "desc: onboardingComplete ? 'New tenancy scheduled; previous tenancy retained'");
 code=code.replace('  const issueAgreement = async () => {',`  const completionAttempt = useRef<number | null>(null);
  useEffect(()=>{
    if(onboardingComplete||!agreement?.id||agreement.status!=='completed'||!allPreviousComplete(8)||completionAttempt.current===agreement.id)return;
    completionAttempt.current=agreement.id;
    setReviewError('');setSaving(true);
    void completeOnboarding().catch(error=>setReviewError(error instanceof Error?error.message:'Could not complete test onboarding.')).finally(()=>setSaving(false));
  },[agreement?.id,agreement?.status,onboardingComplete,enquiry.credit_check_completed,guarantorReady,guarantor?.record?.credit_check_completed]);

  const issueAgreement = async () => {`);
 code=code.replace('The agreed tenancy start date is retained. Future tenancies appear as scheduled until their start date.','The joint tenancy and its billing end on 5 November 2026. Zoe’s sole tenancy and billing start on 6 November 2026; Mathew moves to archived tenants on that date. Previous documents and payments remain in history.');
 return code;
};
