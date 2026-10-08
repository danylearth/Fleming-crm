// Public invitation holders receive their application and requested corrections,
// never the office review record or the company's saved agreement configuration.
export function publicGuarantorState(state: any) {
 const g = state.g;
 const application = {
  required:g.required,status:g.status,contact:g.contact,form:g.form,uploads:g.uploads,docs:g.docs,
  signed:g.signed,witnessed:g.witnessed,signatureImage:g.signatureImage,witnessSignatureImage:g.witnessSignatureImage,
  submittedAt:g.submittedAt,introAcceptedAt:g.introAcceptedAt,
  revisionEdits:g.revisionEdits,revisionUploads:g.revisionUploads,deedNeedsResigning:g.deedNeedsResigning,
  reason:g.reason,
 };
 const statuses = (reviews: any) => Object.fromEntries(Object.entries(reviews || {}).map(([key, value]: [string, any]) => [key, {status:value.status,...(state.data.changesSent&&value.status==='rejected'?{reason:value.reason||value.notes||''}:{})}]));
 const delivery = (message: any) => message ? {status:message.status,at:message.at} : null;
 const tenancy = state.tenancy;
 return {
  ...application,g:application,
  data:{
   reviewStatus:state.data.reviewStatus,reviews:statuses(state.data.reviews),documentReviews:statuses(state.data.documentReviews),
   changes:state.data.changesSent ? {message:state.data.changes?.message||''} : null,changesSent:state.data.changesSent || null,
  },
  executionId:state.executionId,sourceHash:state.sourceHash,
  witnessInvitationDelivery:delivery(state.witnessInvitationDelivery),completionEmail:delivery(state.completionEmail),
  tenancy:{tenantNames:tenancy.tenantNames,propertyAddress:tenancy.propertyAddress,startDate:tenancy.startDate,
   landlord:tenancy.landlord,landlordAddress:tenancy.landlordAddress,serviceType:tenancy.serviceType,monthlyRent:tenancy.monthlyRent,deposit:tenancy.deposit,tenants:tenancy.tenants,property:tenancy.property,rent:tenancy.rent},
 };
}
