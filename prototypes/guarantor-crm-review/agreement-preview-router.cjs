const fs=require('fs'),path=require('path');
require('../../backend/node_modules/tsx/dist/cjs/index.cjs');
process.env.LIBREOFFICE_PATH=path.resolve('.local/tools/libreoffice/program/soffice.exe');
process.env.PATH=path.resolve('.local/tools/poppler-26.09.0/Library/bin')+path.delimiter+process.env.PATH;
process.env.PDF_ARIAL_REGULAR='C:/Windows/Fonts/arial.ttf';process.env.PDF_ARIAL_BOLD='C:/Windows/Fonts/arialbd.ttf';
const express=require('../../backend/node_modules/express'),{generateSourceTenancyPdf}=require('../../backend/src/tenancy-template.ts'),{stampAgreementSignatures}=require('../../backend/src/agreement-signatures.ts'),{appendSigningCertificate}=require('../../backend/src/signing-certificate.ts'),{PDFDocument,StandardFonts,rgb}=require('../../backend/node_modules/pdf-lib');
const router=express();
// Multiple open preview tabs may request a new PDF together; prepare them in order.
let sourceQueue=Promise.resolve();
const generatePreviewSource=input=>{const work=sourceQueue.then(()=>generateSourceTenancyPdf(input));sourceQueue=work.catch(()=>{});return work;};
router.post('/preview-agreement-email',express.json(),(req,res)=>{const {tenancyAgreementEmail}=require('../../backend/src/email.ts');res.json(tenancyAgreementEmail(req.body));});
router.post('/preview-agreement-notice',express.json(),(req,res)=>{const {revisedAgreementNotice}=require('../../backend/src/email.ts');const message=revisedAgreementNotice(req.body.name,req.body.address,req.body.url,!!req.body.waitingForLandlord);res.json({...message,body_html:message.html,simulated:true});});
router.post('/preview-agreement-render',express.json({limit:'12mb'}),async(req,res)=>{
 let temp;
 try{
  const input=req.body.input;input.agreementDate=new Date(input.agreementDate);input.tenancyStartDate=new Date(input.tenancyStartDate);
  const bytes=req.body.source?Buffer.from(req.body.source,'base64'):await generatePreviewSource(input);
  const pdf=await PDFDocument.load(bytes),font=await pdf.embedFont(StandardFonts.Helvetica);
  const signers={...(req.body.signers||{})};
  if(input.agreementType==='internal'&&(!req.body.source||req.body.completed)){const signer=require('../../backend/src/company-settings-values.ts').defaultCompanySettings().signer;signers.landlord={name:signer.name,at:input.agreementDate.toISOString(),image:signer.signature};}
  const toSigner=role=>signers[role]?{name:signers[role].name,date:signers[role].at,image:Buffer.from(signers[role].image.split(',')[1],'base64')}:null;
  if(Object.keys(signers).length){temp=await fs.promises.mkdtemp(path.join(require('os').tmpdir(),'apt-preview-'));const source=path.join(temp,'source.pdf');await fs.promises.writeFile(source,bytes);await stampAgreementSignatures(pdf,source,font,[toSigner('tenant'),...(input.tenants.length>1?[toSigner('joint_tenant')]:[])],input.agreementType==='internal'&&req.body.source?null:toSigner('landlord'));
   if(req.body.completed)await appendSigningCertificate(pdf,Object.values(signers).map(s=>({name:s.name,email:'test@example.test',signed_at:s.at,signing_ip:'TEST ONLY',signature:Buffer.from(s.image.split(',')[1],'base64')})),require('crypto').createHash('sha256').update(bytes).digest('hex'));
  }
  if(!req.body.source||req.body.completed)for(const page of pdf.getPages())page.drawText('TEST ONLY - Fictional records and simulated signatures',{x:36,y:12,size:7,font,color:rgb(.55,.15,.35)});
  res.set('Cache-Control','no-store').type('pdf').send(Buffer.from(await pdf.save()));
 }catch(e){console.error(e);res.status(400).json({error:e.message});}finally{if(temp)await fs.promises.rm(temp,{recursive:true,force:true});}
});
router.get('/guarantor/agreement-test.html',(req,res)=>{
 const html=require('./agreement-signing-page.cjs')();
 res.set('Cache-Control','no-store').type('html').send(html);
});
for(const route of ['/signing-layout.css','/form-typography.css','/signature-controls.css','/signature-editor.js','/logo-white.png'])router.get(route,(req,res)=>res.sendFile(path.resolve('tenants-subdomain'+req.path)));
router.use('/vendor',express.static(path.resolve('tenants-subdomain/vendor')));
module.exports=router;

