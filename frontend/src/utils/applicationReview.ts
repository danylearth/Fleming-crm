const present = (value: unknown): boolean => value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '');

export const missingDocumentRequest: Record<string,string> = {
  'Primary Identification':'Please also provide your primary identification document.',
  'Secondary Identification':'Please also provide your secondary identification document.',
  'Bank Statements':'Please also provide three months’ bank statements.',
  'Proof of Income or Employment':'Please also provide proof of income or employment.',
};

export function applicationAnswerLabel(key: string): string {
  return key === 'ni_number' ? 'National Insurance Number' : key.replace(/^declaration_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function applicationAnswerValue(value: unknown, key = ''): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(item=>applicationAnswerValue(item,key)).join('\n');
  if (value && typeof value === 'object') return Object.entries(value).filter(([,v])=>present(v)).map(([k,v])=>`${applicationAnswerLabel(k)}: ${applicationAnswerValue(v,k)}`).join('\n');
  if (/income/.test(key) && /^-?\d+(?:\.\d+)?$/.test(String(value).trim()) && Number.isFinite(Number(value))) return Number(value).toLocaleString('en-GB',{maximumFractionDigits:20});
  return present(value) ? String(value) : '—';
}

function sectionFor(key: string): string {
  if (/guarantor/.test(key)) return 'Guarantor';
  if (/next_of_kin|^nok/.test(key)) return 'Next of Kin';
  if (/^bank|^sort_code|^account_/.test(key)) return 'Bank Details';
  if (/^declaration|signature|^signed_|marketing_consent/.test(key)) return 'Declaration';
  if (/reference|^personal_ref/.test(key)) return 'References';
  if (/income|loans|credit_cards|legal_proceedings/.test(key)) return 'Financial Details';
  if (/employ|^job_|self_assessments|business_|company_number|years_trading|contractor_|accountant|student_/.test(key)) return 'Employment & Income';
  if (/^current_|^previous_|^years_at_|^landlord_contact/.test(key)) return 'Address & Landlord';
  if (/^property_|^rent|^deposit|^preferred_|^tenancy|^forwarding_|parking|pets|occupants|smoking/.test(key)) return 'Tenancy Details';
  if (/supporting_information|further_info/.test(key)) return 'Additional Information';
  return 'Personal Details';
}

export function applicationReviewSections(enquiry: Record<string, unknown>) {
  const submitted = enquiry.app_form_data && typeof enquiry.app_form_data === 'object' ? enquiry.app_form_data as Record<string, unknown> : {};
  const answers: Record<string, unknown> = {...submitted};
  const fallback: Record<string,string> = {
    first_name:'first_name_1',last_name:'last_name_1',email:'email_1',phone:'phone_1',date_of_birth:'date_of_birth_1',
    employment_status:'employment_status_1',employer_name:'employer_1',gross_annual_income:'income_1',
    ni_number:'app_ni_number',previous_address_line_1:'app_previous_address_1',years_at_current_address:'app_years_at_current',
    bank_name:'app_bank_name',bank_sort_code:'app_bank_sort_code',bank_account_number:'app_bank_account_number',
    next_of_kin_name:'app_next_of_kin_name',next_of_kin_phone:'app_next_of_kin_phone',next_of_kin_relationship:'app_next_of_kin_relationship',next_of_kin_address:'app_next_of_kin_address',
    next_of_kin_2_name:'app_next_of_kin_2_name',next_of_kin_2_phone:'app_next_of_kin_2_phone',next_of_kin_2_relationship:'app_next_of_kin_2_relationship',next_of_kin_2_address:'app_next_of_kin_2_address',
    guarantor_name:'app_guarantor_name',guarantor_phone:'app_guarantor_phone',guarantor_email:'app_guarantor_email',guarantor_address:'app_guarantor_address',
    supporting_information:'app_further_info',signature_name:'app_signature_name',signed_at:'app_signed_at',
  };
  for (const [answer,field] of Object.entries(fallback)) if (!(answer in submitted) && present(enquiry[field])) answers[answer]=enquiry[field];
  const sections=['Personal Details','Address & Landlord','Employment & Income','Financial Details','References','Bank Details','Tenancy Details','Next of Kin','Guarantor','Additional Information','Declaration'];
  return sections.map(title=>({title,answers:Object.entries(answers).filter(([key,value])=>present(value)&&sectionFor(key)===title).map(([key,value])=>({key,label:applicationAnswerLabel(key),value:applicationAnswerValue(value,key)}))})).filter(section=>section.answers.length>0);
}

export type OnboardingReviewNote = {id:string;text:string;author:string;created_at:string};
export function onboardingReviewNotes(rawNotes:unknown,request?:{internal_notes?:string;requested_at?:string}):OnboardingReviewNote[] {
  let parsed:unknown=rawNotes;
  if(typeof rawNotes==='string'){try{parsed=JSON.parse(rawNotes);}catch{parsed=[];}}
  const notes:OnboardingReviewNote[]=Array.isArray(parsed)?parsed.filter(note=>note && typeof note.id==='string' && note.id.startsWith('application-review-') && typeof note.text==='string' && note.text.trim()).map(note=>({id:note.id,text:note.text,author:note.author||'Agent',created_at:note.created_at||''})):[];
  if(request?.internal_notes?.trim()&&!notes.some(note=>note.text.trim()===request.internal_notes?.trim()&&(!request.requested_at||Math.abs(Date.parse(note.created_at)-Date.parse(request.requested_at))<60000))){
    notes.push({id:'saved-request',text:request.internal_notes,author:'Agent',created_at:request.requested_at||''});
  }
  return notes.sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0));
}
