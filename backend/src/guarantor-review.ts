import {guarantorEvidenceCategories,guarantorCreditCategory} from './guarantor-evidence';
export const guarantorReviewSections=['Personal Details','Address & Landlord','Employment & Income','Financial Details','Bank Details','References'];

export function guarantorReviewDecision(g:any,section:string,status:string,reason:string,userId:number){
 if(!guarantorReviewSections.includes(section)&&section!=='Application Details')throw Error('Choose an application section');
 if(!['pending','approved','rejected'].includes(status)||reason.length>4000||(status==='rejected'&&!reason.trim()))throw Error('Choose a decision and explain any rejection');
 const workflow={...g.workflow},reviews={...(workflow.sections||{})};
 for(const title of section==='Application Details'?guarantorReviewSections:[section])reviews[title]={status,reason:status==='rejected'?reason.trim():null,reviewed_at:new Date().toISOString(),reviewed_by:userId};
 return {...workflow,sections:reviews,reviewStatus:'pending'};
}

export function guarantorRequestedChanges(g:any,files:any[]){
 const sections=g.workflow?.sections||{};
 return [
  ...guarantorReviewSections.filter(title=>sections[title]?.status==='rejected').map(title=>`${title==='Address & Landlord'?'Current Address':title}: ${sections[title].reason||''}`),
  ...files.filter(file=>file.category!==guarantorCreditCategory&&file.review_status==='rejected').map(file=>`${file.category}: ${file.review_notes||''}`),
  ...guarantorEvidenceCategories.slice(0,4).filter(category=>!files.some(file=>file.category===category)).map(category=>'Please provide '+category.toLowerCase()+'.'),
 ].join('\n\n');
}

export function assertGuarantorReviewComplete(g:any,files:any[]){
 if(!g.signature||g.workflow?.deedNeedsResigning)throw Error('Complete the current deed signing before approving the application');
 if(guarantorReviewSections.some(title=>g.workflow?.sections?.[title]?.status!=='approved'))throw Error('Approve each application section');
 if(guarantorEvidenceCategories.slice(0,4).some(category=>!files.some(file=>file.category===category&&file.review_status==='approved'))||files.some(file=>file.category!==guarantorCreditCategory&&file.review_status!=='approved'))throw Error('Approve the required evidence and every uploaded supporting document');
}

export function resubmitGuarantorCorrections(g:any,files:any[]){
 if(!g.signature||g.status!=='changes_requested'||g.workflow?.reviewStatus!=='changes_requested'||!g.workflow?.changesSent)throw Error('There is no sent correction request to resubmit');
 const workflow={...g.workflow},sections={...workflow.sections};
 const rejected=guarantorReviewSections.filter(title=>sections[title]?.status==='rejected');
 if(rejected.some(title=>!workflow.revisionEdits?.includes(title)))throw Error('Update every requested application section first');
 if(guarantorEvidenceCategories.slice(0,4).some(category=>!files.some(file=>file.category===category))||files.some(file=>file.category!==guarantorCreditCategory&&file.review_status==='rejected'))throw Error('Replace every requested supporting document first');
 for(const title of rejected)sections[title]={status:'pending'};
 return {...workflow,sections,reviewStatus:'pending',changesSent:null,revisionEdits:[],revisionUploads:[],events:[...(workflow.events||[]),{action:'resubmitted',at:new Date().toISOString()}]};
}
