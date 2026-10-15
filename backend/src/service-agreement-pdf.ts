import {appendSigningCertificate} from './signing-certificate';
import {createHash} from 'node:crypto';
import {cropSignature} from './signature-image';
import {formalAgreementDate} from './tenancy-template';
import {companyTemplateText,applyCompanyImages} from './company-document';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import PizZip from 'pizzip';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {pdfFontPath} from './pdf-fonts';
const exec=promisify(execFile);
export const serviceNames:Record<string,string>={let_only:'Let Only',rent_collection:'Rent Collection',full_management:'Full Management'};
const xmlText=(s:unknown)=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!));
export function formatAgreementDate(value:string):string {
 const date=new Date(value);if(Number.isNaN(date.getTime()))throw Error('Invalid agreement date');
 return formalAgreementDate(date);
}
export function fillServiceTemplate(xml:string,a:any):string {
 if(a.details.companySettings)xml=companyTemplateText(xml,a.details.companySettings,'service');
 const d=a.details,b=a.bank_details;
 const values=[formatAgreementDate(a.issued_at?new Date(a.issued_at).toLocaleDateString('en-CA',{timeZone:'Europe/London'}):d.agreement_date),d.landlord_name+(d.company_number?` (Company number ${d.company_number})`:''),d.landlord_address,d.landlord_email,d.landlord_phone,d.property_address,Number(d.asking_rent).toFixed(2),b.account_name,b.bank_name,b.sort_code,b.account_number,`${Number(a.setup_fee)}% of the first month's rent`,...(a.service_type==='let_only'?[]:[`${Number(a.monthly_fee)}% of monthly rent collected`]),(d.entity_type==='company'||(!d.entity_type&&d.company_number))&&d.signatory_name?`${d.signatory_name}, signing on behalf of ${d.landlord_name}`:d.landlord_name];
 let index=0,agentSection=false,agentDated=false;
 xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
  const text=[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(x=>x[1]).join('');
  if(text.includes('Between us, the Agent:'))agentSection=true;
  if(text.includes('And you, the Landlord:'))agentSection=false;
  if(agentSection&&!agentDated&&a.issued_at&&text.trim()==='Date:'){
   agentDated=true;return p.replace('</w:p>',`<w:r>${p.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0]||''}<w:t xml:space="preserve"> ${xmlText(formatAgreementDate(a.issued_at))}</w:t></w:r></w:p>`);
  }
  if(!text.includes('#####'))return p;
  let filled='',cursor=0;for(const marker of text.matchAll(/#####/g)){if(marker.index!<cursor)continue;filled+=text.slice(cursor,marker.index);let end=marker.index!+5,at=end;while(/\s/.test(text[at]||'')&&at<text.length)at++;if(text[at]==='('){let depth=0;for(;at<text.length;at++){if(text[at]==='(')depth++;if(text[at]===')'&&--depth===0){end=at+1;break;}}}if(index>=values.length)throw Error('Unexpected service contract field');filled+=xmlText(values[index++]);cursor=end;}filled+=text.slice(cursor);
  if(text.startsWith('This agreement is dated:'))filled=filled.replace(/:\s+/,': ');
  return p.replace(/<w:r(?:\s[^>]*[^/])?>[\s\S]*?<\/w:r>/g,'').replace('</w:p>',`<w:r>${p.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0]?.replace(/<w:shd[^>]*\/>/g,'')||''}<w:t xml:space="preserve">${filled.replace(/\t/g,'</w:t><w:tab/><w:t xml:space="preserve">')}</w:t></w:r></w:p>`);
 });
 if(index!==values.length||xml.includes('#####'))throw Error('Incomplete service contract');
 let signingRole='Agents';
 xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
  const value=[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('');
  if(value.includes('And you, the Landlord:'))signingRole='Landlords';
  return p.replace(/(<w:t(?:\s[^>]*)?>)Signature:(<\/w:t>)/g,`$1${signingRole} Signature:$2`).replace(/(<w:t(?:\s[^>]*)?>)Date:(<\/w:t>)/g,'$1Dated Signed:$2');
 });
 let signing=false,afterSignerHeading=false;
 return xml.replace(/<w:highlight[^>]*\/>/g,'').replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');const text=[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('');
 if(text==='Signed as an agreement')signing=true;
 if(signing){
  const space=(after:number)=>{p=p.replace(/<w:spacing[^>]*\/>/g,'').replace('<w:pPr>',`<w:pPr><w:spacing w:before="0" w:after="${after}" w:line="276" w:lineRule="auto"/>`);};
  if(afterSignerHeading){space(80);afterSignerHeading=false;}
  if(text==='Between us, the Agent:'||text==='And you, the Landlord:')afterSignerHeading=true;
  if(text==='Agents Signature:'||text==='Landlords Signature:')space(0);
  if(p.includes('<w:drawing')){space(160);p=p.replace(/<a:ln\b[^>]*>[\s\S]*?<\/a:ln>|<a:ln\b[^>]*\/>/g,'').replace('</pic:spPr>','<a:ln><a:noFill/></a:ln></pic:spPr>');}
  if(text.startsWith('Dated Signed:'))space(280);
  if(text==='Landlords Signature:')p+='<w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="160" w:line="868" w:lineRule="exact"/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>';
 }
 if(/^\d+\.\s/.test(text)){p=p.replace(/<w:keepNext[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:keepNext/>');}
 if(/^\d+\.\d+/.test(text)){p=p.replace(/<w:spacing[^>]*\/>/g,'').replace('<w:pPr>','<w:pPr><w:spacing w:before="0" w:after="140" w:line="276" w:lineRule="auto"/>');}
 return p.replace('<w:pPr>','<w:pPr><w:keepLines/>');});
}
let queue:Promise<unknown>=Promise.resolve();
export async function servicePdf(a:any,source?:Buffer):Promise<Buffer>{
 const work=queue.then(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fleming-service-'));try{
  const zip=new PizZip(source||await fs.readFile(path.join(__dirname,'agreement-assets',`service-${a.service_type}.docx`)));
  zip.file('word/document.xml',fillServiceTemplate(zip.file('word/document.xml')!.asText(),a));
  for(const entry of zip.file(/^word\/.*\.xml$/)){zip.file(entry.name,entry.asText().replace(/<w:u\b[^>]*\/>/g,''));}
  if(a.details.companySettings)await applyCompanyImages(zip,a.details.companySettings,true);
  await fs.writeFile(path.join(dir,'service.docx'),zip.generate({type:'nodebuffer'}));
  await exec(process.env.LIBREOFFICE_PATH||'soffice',[`-env:UserInstallation=${pathToFileURL(path.join(dir,'profile')).href}`,'--headless','--convert-to','pdf:writer_pdf_Export','--outdir',dir,path.join(dir,'service.docx')],{timeout:60000,maxBuffer:1024*1024});
  return await fs.readFile(path.join(dir,'service.pdf'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}});queue=work.catch(()=>undefined);return work;
}
export async function signedServicePdf(bytes:Buffer,a:any,draft=false):Promise<Buffer>{
 const pdf=await PDFDocument.load(bytes);pdf.registerFontkit(fontkit);
 const fontBytes=await fs.readFile(pdfFontPath()),metrics=fontkit.create(fontBytes) as {descent:number;unitsPerEm:number};
 const font=await pdf.embedFont(fontBytes,{subset:true}),bold=await pdf.embedFont(await fs.readFile(pdfFontPath(true)),{subset:true});
 const signatureImage=await pdf.embedPng(await cropSignature(Buffer.from(a.signature.split(',')[1],'base64')));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'service-signature-'));try{
  const file=path.join(dir,'source.pdf');await fs.writeFile(file,bytes);const {stdout}=await exec('pdftotext',['-bbox',file,'-']);
  const pages=[...stdout.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)];
  for(let i=0;i<pages.length;i++){const words=[...pages[i][1].matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([^<]+)<\/word>/g)];const signatures=words.filter(w=>w[5]==='Signature:');if(signatures.length<2)continue;
   const target=pdf.getPage(i),slot=signatures[signatures.length-1];
   const signingDate=words.filter(w=>w[5]==='Signed:'||w[5]==='Date:').slice(-1)[0];
   const height=signingDate?Math.max(8,Math.min(43.4,Number(signingDate[2])-Number(slot[2])-15-16)):24;
   const size=signatureImage.scaleToFit(200,height);
   const label=words.find(w=>w[5]==='Landlords'&&Math.abs(Number(w[2])-Number(slot[2]))<.5);
   target.drawImage(signatureImage,{x:Number(label?.[1]||slot[1]),y:signingDate?target.getHeight()-Number(signingDate[2])+16:target.getHeight()-Number(slot[2])-15-24,width:size.width,height:size.height});
   const dates=words.filter(w=>w[5]==='Signed:'||w[5]==='Date:');const agentDate=dates[0];const agentValue=agentDate&&words.find(w=>Math.abs(Number(w[2])-Number(agentDate[2]))<0.5&&Number(w[1])>Number(agentDate[3]));
   // Match the date already typeset beside the agent signature, including its space and font size.
   const dateSize=agentValue?(Number(agentValue[3])-Number(agentValue[1]))/font.widthOfTextAtSize(agentValue[5],1):10;
   const dateGap=agentValue?Number(agentValue[1])-Number(agentDate[3]):font.widthOfTextAtSize(' ',dateSize);
   for(const date of dates.slice(-1)){target.drawText(formatAgreementDate(a.signed_at),{x:Number(date[3])+dateGap,y:target.getHeight()-Number(date[4])+Math.abs(metrics.descent)/metrics.unitsPerEm*dateSize,font,size:dateSize});}
  }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
 if(!draft){await appendSigningCertificate(pdf,[{name:'Landlord: '+a.signer_name,email:a.details.landlord_email,signed_at:a.signed_at,signing_ip:a.signature_ip,opened_at:a.opened_at,signature:Buffer.from(a.signature.split(',')[1],'base64'),consent_snapshot:a.details.signingConsent||null}],createHash('sha256').update(bytes).digest('hex'),false);return Buffer.from(await pdf.save());}
 const page=pdf.addPage([595.28,841.89]);let y=710;
 const header=await pdf.embedPng(await fs.readFile(path.join(__dirname,'agreement-assets/letterhead-header.png'))),footer=await pdf.embedPng(await fs.readFile(path.join(__dirname,'agreement-assets/letterhead-footer.png')));
 page.drawImage(header,{x:0,y:739.6,width:595.28,height:102.29});page.drawImage(footer,{x:0,y:0,width:595.28,height:77});
 const line=(text:string,strong=false)=>{for(let start=0;start<text.length;start+=86){page.drawText(text.slice(start,start+86).replace(/[^\x20-\x7e£]/g,'-'),{x:45,y,size:10,font:strong?bold:font,color:rgb(.12,.12,.12)});y-=17;}};
 line(draft?'DRAFT PREVIEW - Not yet signed':'Fleming Lettings - Electronic Signing Certificate',true);y-=15;
 line(`${serviceNames[a.service_type]} Service Agreement`,true);line(a.details.property_address);line(`Landlord: ${a.details.landlord_name}`);line(`${draft?'Proposed signer':'Signed by'}: ${a.signer_name}`);line(`${draft?'Preview generated':'Signed at'}: ${new Date(a.signed_at).toISOString()}`);if(draft){line('Draft signature and bank details for review only.');line('No acceptance, bank confirmation or submission has been recorded.');}else{line('The landlord accepted this agreement and the Landlord Terms of Business,');line('instructed immediate commencement, and confirmed the bank details below.');}
 line(`Account name: ${a.bank_details.account_name}`);line(`Bank: ${a.bank_details.bank_name}`);line(`Sort code: ${a.bank_details.sort_code} - Account: ${a.bank_details.account_number}`);line(`Ongoing rent paid to: ${a.payment_route==='landlord'?'Landlord':'Fleming client account'}`);
 y-=15;const dim=signatureImage.scaleToFit(155,45);page.drawImage(signatureImage,{x:45,y:y-dim.height,width:dim.width,height:dim.height});y-=dim.height+22;line(`Signing IP: ${a.signature_ip||'Unavailable'}`);line('This certificate forms part of the preceding agreement.');return Buffer.from(await pdf.save());
}
