import {readFileSync} from 'node:fs';
const templates=Object.fromEntries(['request','complete'].map(kind=>[kind,readFileSync(new URL(`./email-templates/fleming-guarantor-${kind}-email.html`,import.meta.url),'utf8')]));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function emailContext(state,g){return {guarantorId:g.id,guarantorName:g.details.name,to:g.details.email,applicants:state.tenants.map(t=>({id:t.id,name:t.name})),supportedApplicant:state.tenants.find(t=>t.id===g.tenantId)?.name,property:{...state.property},token:g.invitation?.token||'',revision:g.revision};}
export function renderEmail(kind,context,origin='http://127.0.0.1:8921'){
 if(!templates[kind])throw Error('Unknown guarantor email');
 const applicants=[...new Map(context.applicants.map(t=>[String(t.id),t])).values()];
 if(!applicants.length||applicants.some(t=>!t.name?.trim()))throw Error('All applicant names are required');
 const names=new Intl.ListFormat('en-GB',{style:'long',type:'conjunction'}).format(applicants.map(t=>t.name));
 const plural=applicants.length>1;
 let html=templates[kind].replaceAll('Sam Fleming has',escape(names)+(plural?' have':' has')).replaceAll('Sam Fleming',escape(names)).replaceAll('>Tenant</div>',`>${plural?'Tenants':'Tenant'}</div>`);
 html=html.replaceAll('FIRSTNAME',escape(context.guarantorName.trim().split(/\s+/)[0])).replaceAll('PROPERTYADDRESS',escape([context.property.address,context.property.city,context.property.postcode].filter(Boolean).join(', '))).replaceAll('RENTAMOUNT',escape(new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(context.property.rent)));
 html=html.replace('As a guarantor, you agree to cover the rent and any other costs due under the tenancy if the tenant is unable to pay. Before you continue, please make sure you are happy to take on this responsibility.',`As a proposed guarantor, you may be asked to cover rent or other obligations within the limits of a separate guarantee if ${plural?'the tenants are':'the tenant is'} unable to pay. You will receive the proposed terms to read before signing. This request relates to your proposed support for ${escape(context.supportedApplicant)}; listing all applicants does not extend the scope of your guarantee.`);
 html=html.replace('a guarantor agreement is a legally binding agreement. Completing this step', 'a signed guarantor agreement can create a legally binding financial commitment. Completing this application does not sign that agreement. Completing this step');
 html=html.replaceAll('GUARANTOR_LINK',escape(`${origin}/apply?g=${encodeURIComponent(context.guarantorId)}&token=${encodeURIComponent(context.token)}`));
 html=html.replace(/src="([\w-]+\.png)"/g,(_,name)=>`src="${origin}/email-assets/${name}"`);
 // Unconfigured social / unsubscribe destinations must not become invented live links.
 html=html.replace(/href="(X_LINK|LINKEDIN_LINK|YOUTUBE_LINK|UNSUBSCRIBE_LINK)"/g,'aria-disabled="true" title="Preview only — destination not configured"');
 html=html.replace('style="width:600px; max-width:600px; background:#ffffff;"','style="width:100%; max-width:600px; background:#ffffff;"');
 html=html.replace('</style>','@media only screen and (max-width:620px){td[width="180"]{width:135px!important}td[width="180"] img{width:120px!important;height:auto!important}td[width="130"]{width:80px!important}td[width="130"] img{width:80px!important;height:auto!important}}\n</style>');
 return html;
}
