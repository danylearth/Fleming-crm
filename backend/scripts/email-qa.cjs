// User-authorised QA: fictional content, one labelled email per template/signature.
const fs = require('node:fs');
const path = require('node:path');
const {emailTemplateLibrary, fillEmailTemplate} = require('../dist/message-template-library');
const {emailSignatures} = require('../dist/marketing-files');
const {prepareEmailHtml} = require('../dist/email-presentation');
const {sendEmail} = require('../dist/email');
const recipient = process.argv.find(arg=>arg.startsWith('--to='))?.slice(5);
if(process.argv.includes('--send')&&!recipient)throw Error('Supply an explicitly authorised --to=email address');
const revision = process.argv.find(arg=>arg.startsWith('--revision='))?.slice(11) || 'v1';
if(!/^[a-z0-9-]+$/.test(revision))throw Error('Invalid QA revision');
const only = process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
const folder = path.resolve(__dirname, '../../docs/reviews/email-qa-2026-09-25'+(revision==='v1'?'':'-'+revision));
fs.mkdirSync(folder, {recursive:true});
const fixture = {
 FIRST_NAME:'Alex', NAME:'Alex Example', TENANT_NAME:'Alex Example', EMAIL:'alex@example.test',
 REFERENCE:'SAMPLE-ONLY', PROPERTY_ADDRESS:'10 Example Road, Sample Town, AB1 2CD', PROPERTY_SHORT_ADDRESS:'10 Example Road', PROPERTY_ADDRESS_REMAINDER:'Sample Town, AB1 2CD', PROPERTY_SUBJECT:'10 Example Road',
 LANDLORD_NAME:'Sample Landlord', LANDLORD_ADDRESS:'20 Example Lane, Sample Town, AB1 2CD',
 VIEWING_DATE:'1 October 2026 at 10:30am', APPOINTMENT_DATE:'1 October 2026', APPOINTMENT_TIME:'10:30am', APPOINTMENT_WITH:'Sample Agent', TENANCY_START_DATE:'1 October 2026', DUE_DATE:'1 October 2026', END_DATE:'1 October 2027', RECEIVED_DATE:'25 September 2026',
 AMOUNT:'100', MONTHLY_RENT:'900', SECURITY_DEPOSIT:'900', HOLDING_DEPOSIT:'100', FUNDS_ON_ACCOUNT:'100', BALANCE_DUE:'1700',
 INTRO_MESSAGE:'This is a visual test using fictional sample details. No action or payment is required.', REQUESTED_CHANGES:'Sample request: please review the fictional details.',
 BANK_NAME:'Example bank — TEST ONLY', ACCOUNT_NAME:'Example account — DO NOT PAY', SORT_CODE:'00-00-00', ACCOUNT_NUMBER:'00000000', PAYMENT_REFERENCE:'TEST ONLY', DELIVERY_DESCRIPTION:'This is a test of the signature request layout.',
};
const samples = emailTemplateLibrary().map(template => {
 const values = {...fixture};
 for (const key of template.fields) {
  if (/URL|LINK/.test(key)) values[key]='https://example.test/preview';
  if (!(key in values)) throw Error(`No sample value for ${key}`);
 }
 const html = fillEmailTemplate(template.html, values).replace(/href="https?:\/\/[^"]+"/g,'href="https://example.test/preview"');
 return {id:template.id, label:template.label, html:prepareEmailHtml(html)};
});
for (const signature of emailSignatures([{id:1,name:'Alex Example — Sample Property Manager',email:'alex@example.test',department:'Lettings Team',phone:'07700 900000',office_extension:'123'}],1)) {
 samples.push({id:'signature-'+signature.id+'.html',label:'Signature — '+signature.label,html:prepareEmailHtml('<p style="font-family:Arial;color:#1e1e1e">Signature layout test. Fictional details; no action is required.</p>'+signature.html)});
}
const receiptFile=path.join(folder,'receipts.json');
const receipts=fs.existsSync(receiptFile)?JSON.parse(fs.readFileSync(receiptFile,'utf8')):[];
(async()=>{
 for(const sample of samples){
  fs.writeFileSync(path.join(folder,sample.id),sample.html);
  if(process.argv.includes('--send')&&(!only||only.includes(sample.id))&&!receipts.some(r=>r.template===sample.id&&r.recipient===recipient&&r.success)){
   const result=await sendEmail({to:recipient,subject:`[CRM HTML TEST ${revision} ${samples.indexOf(sample)+1}/${samples.length}] ${sample.label}`,html:sample.html,idempotencyKey:'crm-html-qa-2026-09-25-'+revision+'-'+sample.id});
   receipts.push({template:sample.id,recipient,...result,submittedAt:new Date().toISOString()});
   fs.writeFileSync(receiptFile,JSON.stringify(receipts,null,2));
   if(!result.success)throw Error(`Sending failed for ${sample.id}: ${result.error}`);
   await new Promise(resolve=>setTimeout(resolve,600));
  }
 }
 fs.writeFileSync(path.join(folder,'index.html'),'<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email QA</title></head><body><h1>CRM email samples</h1><p>Fictional details. Desktop and mobile layout review.</p><ul>'+samples.map(s=>`<li><a href="${s.id}">${s.label}</a></li>`).join('')+'</ul></body></html>');
 console.log(JSON.stringify({samples:samples.length,accepted:receipts.filter(r=>r.success&&!r.simulated).length,folder}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
