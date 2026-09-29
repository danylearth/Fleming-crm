import {missingApplicationDocuments,requests,type DocumentOverrides} from './application-missing-documents';

type Document = {id:number;doc_type:string;review_status?:string;review_notes?:string};
type Enquiry = {application_review_status?:string;application_changes_sent_at?:unknown;app_form_data?:{employment_status?:unknown};application_section_reviews?:Record<string,{status:string;reason?:string}>;application_document_overrides?:DocumentOverrides};
export function awaitingApplicationResubmission(enquiry:Enquiry):boolean {
  return enquiry.application_review_status==='changes_requested' && Boolean(enquiry.application_changes_sent_at);
}
export function createApplicationReviewRequest(enquiry:Enquiry,documents:Document[],internalNotes:string,changes:string,requestedAt=new Date().toISOString()) {
  const items = [
    ...Object.entries(enquiry.application_section_reviews || {}).filter(([,review])=>review.status==='rejected').map(([label,review])=>({kind:'section',label,reason:review.reason || ''})),
    ...documents.filter(document=>document.review_status==='rejected').map(document=>({kind:'document',label:document.doc_type,reason:document.review_notes || '',document_id:document.id})),
    ...missingApplicationDocuments(enquiry.app_form_data?.employment_status,documents,enquiry.application_document_overrides).map(label=>({kind:'missing_document',label,reason:requests[label]})),
  ];
  return {requested_at:requestedAt,internal_notes:internalNotes.trim(),changes_required:changes,items};
}
