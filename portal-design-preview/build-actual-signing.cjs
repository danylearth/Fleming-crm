const path=require('node:path');
const fs=require('node:fs');
const esbuild=require('../frontend/node_modules/esbuild');
const frontend=path.resolve(__dirname,'../frontend');
async function build() { await esbuild.build({entryPoints:[path.join(__dirname,'actual-signing-entry.jsx')],bundle:true,outfile:path.join(__dirname,'dist/actual-signing.js'),jsx:'automatic',define:{'import.meta.env.VITE_API_URL':'""','process.env.NODE_ENV':'"production"'},nodePaths:[path.join(frontend,'node_modules')],plugins:[{name:'test-signing-page',setup(build){build.onResolve({filter:/SignatureRequests$/},()=>({path:path.join(__dirname,'signing-page-shim.jsx')}));build.onResolve({filter:/utils\/documentViewer$/},()=>({path:path.join(__dirname,'document-viewer-shim.js')}));}}],loader:{'.png':'file','.svg':'file'},minify:true});
let email=fs.readFileSync(path.join(frontend,'../backend/src/email-templates/signature-request.html'),'utf8');
email=email.replaceAll('{{RECIPIENT_NAME}}','William').replaceAll('{{DOCUMENT_NAME}}','Inventory - 21a Northwood Park Road').replaceAll('{{MESSAGE}}','Please review your property inventory and complete the tenant signature and date fields on page 1.').replaceAll('{{SIGNING_URL}}','/request-signing.html').replaceAll('Review and sign document','Click to complete document').replaceAll('src="assets/','src="/email-assets/');
email=email.replace('<body bgcolor=', '<body data-preview="true" bgcolor=');
email=email.replace('<div style="margin:0; padding:0; background:#EEEEEE;">','<div style="padding:12px;background:#fff3cd;text-align:center;font:14px Arial">TEST EMAIL — not sent. Uses the CRM signature-request email template.</div><div style="margin:0; padding:0; background:#EEEEEE;">');
fs.writeFileSync(path.join(__dirname,'dist/request-email.html'),email);
console.log('Built actual CRM signing screen and signature-request email preview.');

} build().catch(e=>{console.error(e);process.exitCode=1;});


