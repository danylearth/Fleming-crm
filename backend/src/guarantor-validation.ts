export const guarantorEvidence=['Primary ID','Secondary ID','Bank Statements','Proof of Income','Employment Reference'];
export const guarantorOfficeFiles=['Deed of Guarantee','Proposed Tenancy','Credit Report'];
export function guarantorRequirementReady(enquiry:any){return Boolean(enquiry.application_form_completed)&&['new','viewing_booked','awaiting_response','onboarding'].includes(enquiry.status);}
export function guarantorApplicationReady(enquiry:any){return Boolean(enquiry.application_form_completed)&&enquiry.application_review_status==='approved'&&enquiry.status!=='converted';}
export function guarantorSubmissionIssues(form:any,signature:any,files:{category:string}[],name:string){
 const issues:string[]=[];
 for(const key of ['name','address','date_of_birth','employment_status','employer','reference_name','reference_email'])if(typeof form?.[key]!=='string'||!form[key].trim())issues.push(`Complete ${key.replace(/_/g,' ')}`);
 if(!/^\S+@\S+\.\S+$/.test(form?.reference_email||''))issues.push('Enter a valid employment reference email');
 const dob=new Date(String(form?.date_of_birth||'')+'T12:00:00Z'),adult=new Date();adult.setFullYear(adult.getFullYear()-18);if(!Number.isFinite(dob.getTime())||dob>adult)issues.push('The guarantor must be at least 18');
 if(!Number.isFinite(Number(form?.annual_income))||Number(form?.annual_income)<0||form?.annual_income==='')issues.push('Enter a valid annual income');
 if(form?.credit_consent!==true||form?.information_confirmed!==true)issues.push('Confirm the credit-check authority and application declaration');
 for(const category of [...guarantorEvidence,...guarantorOfficeFiles.filter(c=>c!=='Credit Report')])if(!files.some(f=>f.category===category))issues.push(`${category} is required`);
 if(!signature||signature.signed_name?.trim().toLowerCase()!==name.trim().toLowerCase()||form?.name?.trim().toLowerCase()!==name.trim().toLowerCase())issues.push('Sign using the invited guarantor’s full name');
 for(const field of ['witness_name','witness_address','witness_signature'])if(!String(signature?.[field]||'').trim())issues.push(`Complete ${field.replace(/_/g,' ')}`);
 if(signature?.witness_name?.trim().toLowerCase()===name.trim().toLowerCase())issues.push('The witness must be another person');
 if(signature?.witness_name?.trim().toLowerCase()!==signature?.witness_signature?.trim().toLowerCase())issues.push('The witness must sign using their full name');
 if(signature?.witness_present!==true||signature?.deed_read!==true||signature?.tenancy_read!==true||signature?.execute_deed!==true)issues.push('Read both documents and confirm execution and physical witnessing');
 return issues;
}
export function guarantorVerificationIssues(record:any,files:any[]){
 const issues:string[]=[];
 if(record.status!=='submitted')issues.push('The guarantor must submit their application and witnessed deed');
 if(!record.signature)issues.push('The witnessed signature is missing');
 for(const category of [...guarantorEvidence,'Credit Report'])if(!files.some(f=>f.category===category&&f.review_status==='approved'))issues.push(`Approve ${category}`);
 for(const key of ['identity_verified','employment_verified','financials_verified','credit_reviewed','deed_execution_verified'])if(record.checks?.[key]!==true)issues.push(`Complete ${key.replace(/_/g,' ')}`);
 return issues;
}
