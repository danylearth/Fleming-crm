// Review-only state machine. It cannot send mail, execute a deed or update the CRM.
export const evidence = ['Photo ID', 'Proof of address', 'Bank statements', 'Proof of income', 'Employment reference'];
export const checks = ['Identity and address verified', 'Employment reference verified', 'Financial evidence reviewed', 'Office credit report reviewed', 'Deed and witness evidence reviewed'];
export const initialState = () => ({tenantComplete:true, required:null, step:'application', status:'draft', contact:{name:'Robin Taylor',email:'robin.taylor@example.test',phone:'07700 900123'}, docs:[], form:{}, signed:null, witnessed:null, review:[], documentReviews:{}, sectionReviews:{}, events:[]});
const clean = value => String(value || '').trim();
export function transition(current, action, data = {}) {
 const s = structuredClone(current);
 const assert = (ok, message) => { if (!ok) throw Error(message); };
 if (action === 'require') {
  assert(s.tenantComplete, 'Complete and approve the tenant application first.');
  assert(s.status === 'draft', 'The guarantor decision is locked after the invitation is sent.');
  assert(typeof data.value === 'boolean', 'Choose Yes or No.');
  s.required = data.value; s.step = data.value ? 'guarantor' : 'credit';
 } else if (action === 'navigate') {
  assert(['application','guarantor','credit'].includes(data.step), 'That stage is not part of this review.');
  if(data.step === 'guarantor') assert(s.required === true, 'A guarantor must be required to open this stage.');
  if(data.step === 'credit') assert(s.required === false || s.status === 'verified', 'Answer the guarantor question and complete any required guarantor review first.');
  s.step = data.step;
 } else if (action === 'contact') {
  assert(s.status === 'draft', 'Contact details are locked after sending.');
  s.contact = {name:clean(data.name),email:clean(data.email),phone:clean(data.phone)};
 } else if (action === 'invite') {
  assert(s.tenantComplete && s.required === true && s.status === 'draft', 'Confirm that a guarantor is required first.');
  assert(s.contact.name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.contact.email) && s.contact.phone, 'Enter the guarantor name, email and phone number.');
  s.form = {...s.form,...s.contact}; s.status = 'invited';
 } else if (action === 'save') {
  assert(s.status === 'invited', 'This application version is locked.');
  s.form = {...s.form, ...data};
 } else if (action === 'documents') {
  assert(s.status === 'invited', 'Documents are locked for this signed version.');
  s.docs = [...evidence];
 } else if (action === 'sign') {
  assert(s.status === 'invited', 'This version has already been signed or is not open.');
  const f = {...s.form, ...data};
  for (const field of ['name','email','address','dob','employment','employer','reference','referenceEmail','income','witnessName','witnessEmail','witnessAddress','signature']) assert(clean(f[field]), 'Complete all applicant, employment and witness details.');
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  assert([f.email,f.referenceEmail,f.witnessEmail].every(x=>email.test(clean(x))), 'Enter valid email addresses.');
  assert(Number(f.income) > 0 && Number.isFinite(Number(f.income)), 'Enter annual income above zero.');
  const birth = new Date(f.dob + 'T12:00:00Z'); const adult = new Date(); adult.setUTCFullYear(adult.getUTCFullYear()-18);
  assert(Number.isFinite(birth.getTime()) && birth <= adult, 'The guarantor must be at least 18.');
  assert(clean(f.witnessEmail).toLowerCase() !== clean(f.email).toLowerCase() && clean(f.witnessName).toLowerCase() !== clean(f.name).toLowerCase(), 'The witness must be a different person with their own email address.');
  assert(evidence.every(x=>s.docs.includes(x)), 'Add all five evidence categories before signing.');
  assert(f.readDeed && f.readTenancy && f.consent && f.accurate, 'Read the documents and confirm the application declarations.');
  assert(f.present, 'Your witness must be physically with you and watch you sign.');
  assert(f.witnessEligible, 'Confirm the witness meets the stated requirements.');
  assert(clean(f.signature).toLowerCase() === clean(f.name).toLowerCase(), 'Your typed signature must match your full name.');
  s.form = f; s.signed = {name:clean(f.name),at:new Date().toISOString(),version:'APT-G-2026-09-30 / review 1',witness:clean(f.witnessName)}; s.status = 'awaiting_witness';
 } else if (action === 'witness') {
  assert(s.status === 'awaiting_witness' && s.signed, 'The guarantor must sign before the witness.');
  assert(data.present === true, 'Only attest if you were physically present and saw the guarantor sign.');
  assert(data.identity && data.independent && data.attest, 'Confirm each witness declaration before signing.');
  assert(clean(data.signature).toLowerCase() === clean(s.form.witnessName).toLowerCase(), 'The signature must match the nominated witness.');
  s.witnessed = {name:clean(data.signature),at:new Date().toISOString(),version:s.signed.version}; s.status = 'office_review';
 } else if (action === 'decline') {
  assert(s.status === 'awaiting_witness', 'There is no pending witness request.');
  assert(clean(data.reason), 'Please give a reason so the office can help.');
  s.status = 'witness_declined'; s.reason = clean(data.reason);
 } else if (action === 'restart') {
  assert(['witness_declined','awaiting_witness','office_review'].includes(s.status), 'There is no signed version to replace.');
  s.signed = null; s.witnessed = null; s.status = 'invited'; s.reason = ''; s.review = [];
  for (const key of ['signature','present','witnessEligible','readDeed','readTenancy']) s.form[key] = key==='signature' ? '' : false;
 } else if (action === 'review_item') {
  assert(s.signed && s.status !== 'verified', 'The application must be returned before review.');
  assert(['approved','rejected','pending'].includes(data.status), 'Choose a review status.');
  const items = data.kind === 'document' ? evidence : ['Personal details','Employment & reference','Financial information'];
  assert(items.includes(data.item), 'Unknown review item.');
  assert(data.status !== 'rejected' || clean(data.reason), 'Add a reason before rejecting this item.');
  const target = data.kind === 'document' ? 'documentReviews' : 'sectionReviews';
  s[target][data.item] = {status:data.status,reason:clean(data.reason)};
 } else if (action === 'verify') {
  assert(s.status === 'office_review' && s.signed && s.witnessed, 'Both signing steps must be complete before office verification.');
  assert(checks.every(x=>data.checks?.includes(x)), 'Complete all five office checks, including the credit report.');
  assert(evidence.every(x=>s.documentReviews[x]?.status==='approved') && ['Personal details','Employment & reference','Financial information'].every(x=>s.sectionReviews[x]?.status==='approved'), 'Approve each application section and supporting document first.');
  s.review = [...checks]; s.status = 'verified';
 } else throw Error('Unknown action');
 if (!['save','documents'].includes(action)) s.events.push({action,at:new Date().toISOString()});
 return s;
}
