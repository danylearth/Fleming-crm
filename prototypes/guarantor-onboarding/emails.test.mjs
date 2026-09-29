import test from 'node:test';
import assert from 'node:assert/strict';
import {emailContext,renderEmail} from './emails.mjs';
import {initialState,applyAction} from './model.mjs';
test('both supplied templates pluralise and include every applicant',()=>{
 const s=initialState();s.tenants.push({id:'85',name:'Alex Example',guarantorRequired:false});
 for(const kind of ['request','complete']){const html=renderEmail(kind,emailContext(s,s.guarantors[0]));assert.match(html,/>Tenants<\/div>/);assert.match(html,/Jamie Taylor, Casey Taylor and Alex Example/);assert.doesNotMatch(html,/Sam Fleming|FIRSTNAME|PROPERTYADDRESS|RENTAMOUNT|GUARANTOR_LINK/);assert.match(html,/email-assets\/guarantor-/);}
});
test('single applicant uses Tenant and has; names are escaped',()=>{
 const s=initialState();s.tenants=[{id:'83',name:'Jamie <script>',guarantorRequired:true}];
 const html=renderEmail('request',emailContext(s,s.guarantors[0]));assert.match(html,/>Tenant<\/div>/);assert.match(html,/Jamie &lt;script&gt; has/);assert.doesNotMatch(html,/<script>/);
});
test('request outbox keeps recipient identity, all record links and an immutable context',()=>{
 let s=applyAction(initialState(),{type:'requirement',tenantId:'83',required:true});s=applyAction(s,{type:'invite',g:'g1'},'admin');const m=s.emails[0];assert.equal(m.label,'Email to Guarantor');assert.equal(m.context.to,'robin.taylor@example.test');assert.deepEqual(m.linkedApplicantIds,['83','84']);assert.equal(m.status,'Test only — not sent');s.tenants[0].name='Changed later';assert.equal(m.context.applicants[0].name,'Jamie Taylor');assert.equal(s.emails.filter(m=>m.kind==='complete').length,0);
});
