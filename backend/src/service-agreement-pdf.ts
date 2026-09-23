import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import PizZip from 'pizzip';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
const exec=promisify(execFile);
export const serviceNames:Record<string,string>={let_only:'Let Only',rent_collection:'Rent Collection',full_management:'Full Management'};
const xmlText=(s:unknown)=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!));
export function fillServiceTemplate(xml:string,a:any):string {
 const d=a.details,b=a.bank_details;
 const values=[new Date(d.agreement_date).toLocaleDateString('en-GB'),d.landlord_name+(d.company_number?` (Company number ${d.company_number})`:''),d.landlord_address,d.landlord_email,d.landlord_phone,d.property_address,Number(d.asking_rent).toFixed(2),b.account_name,b.bank_name,b.sort_code,b.account_number,`${a.setup_fee}% of the first month's rent`,...(a.service_type==='let_only'?[]:[`${a.monthly_fee}% of monthly rent collected`]),d.landlord_name+(d.signatory_name?` — ${d.signatory_name}, signing on behalf of ${d.landlord_name}`:'')];
 let index=0;
 xml=xml.replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{
  const text=[...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(x=>x[1]).join('');
  if(!text.includes('#####'))return p;
  let filled='',cursor=0;for(const marker of text.matchAll(/#####/g)){if(marker.index!<cursor)continue;filled+=text.slice(cursor,marker.index);let end=marker.index!+5,at=end;while(/\s/.test(text[at]||'')&&at<text.length)at++;if(text[at]==='('){let depth=0;for(;at<text.length;at++){if(text[at]==='(')depth++;if(text[at]===')'&&--depth===0){end=at+1;break;}}}if(index>=values.length)throw Error('Unexpected service contract field');filled+=xmlText(values[index++]);cursor=end;}filled+=text.slice(cursor);
  return p.replace(/<w:r(?:\s[^>]*[^/])?>[\s\S]*?<\/w:r>/g,'').replace('</w:p>',`<w:r><w:t xml:space="preserve">${filled}</w:t></w:r></w:p>`);
 });
 if(index!==values.length||xml.includes('#####'))throw Error('Incomplete service contract');
 return xml.replace(/<w:highlight[^>]*\/>/g,'').replace(/<w:p(?:\s[^>]*[^/])?>[\s\S]*?<\/w:p>/g,p=>{if(!p.includes('<w:pPr>'))p=p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr></w:pPr>');return p.replace('<w:pPr>','<w:pPr><w:keepLines/>');});
}
let queue:Promise<unknown>=Promise.resolve();
export async function servicePdf(a:any,source?:Buffer):Promise<Buffer>{
 const work=queue.then(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fleming-service-'));try{
  const zip=new PizZip(source||await fs.readFile(path.join(__dirname,'agreement-assets',`service-${a.service_type}.docx`)));
  zip.file('word/document.xml',fillServiceTemplate(zip.file('word/document.xml')!.asText(),a));
  await fs.writeFile(path.join(dir,'service.docx'),zip.generate({type:'nodebuffer'}));
  await exec(process.env.LIBREOFFICE_PATH||'soffice',[`-env:UserInstallation=${pathToFileURL(path.join(dir,'profile')).href}`,'--headless','--convert-to','pdf:writer_pdf_Export','--outdir',dir,path.join(dir,'service.docx')],{timeout:60000,maxBuffer:1024*1024});
  return await fs.readFile(path.join(dir,'service.pdf'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}});queue=work.catch(()=>undefined);return work;
}
export async function signedServicePdf(bytes:Buffer,a:any,draft=false):Promise<Buffer>{
 const pdf=await PDFDocument.load(bytes),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const signatureImage=await pdf.embedPng(Buffer.from(a.signature.split(',')[1],'base64'));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'service-signature-'));try{
  const file=path.join(dir,'source.pdf');await fs.writeFile(file,bytes);const {stdout}=await exec('pdftotext',['-bbox',file,'-']);
  const pages=[...stdout.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)];
  for(let i=0;i<pages.length;i++){const words=[...pages[i][1].matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([^<]+)<\/word>/g)];const signatures=words.filter(w=>w[5]==='Signature:');if(signatures.length<2)continue;
   const target=pdf.getPage(i),slot=signatures[signatures.length-1],size=signatureImage.scaleToFit(155,32);target.drawImage(signatureImage,{x:Number(slot[1])+65,y:target.getHeight()-Number(slot[2])-size.height,width:size.width,height:size.height});
   const dates=words.filter(w=>w[5]==='Date:');for(let j=0;j<dates.length;j++){const date=dates[j];target.drawText(j===dates.length-1?new Date(a.signed_at).toLocaleDateString('en-GB'):new Date(a.details.agreement_date).toLocaleDateString('en-GB'),{x:Number(date[1])+65,y:target.getHeight()-Number(date[4]),font,size:9});}
  }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
 const page=pdf.addPage([595.28,841.89]);let y=790;
 const line=(text:string,strong=false)=>{for(let start=0;start<text.length;start+=86){page.drawText(text.slice(start,start+86).replace(/[^\x20-\x7e£]/g,'-'),{x:45,y,size:10,font:strong?bold:font,color:rgb(.12,.12,.12)});y-=17;}};
 line(draft?'DRAFT PREVIEW - Not yet signed':'Fleming Lettings - Electronic Signing Certificate',true);y-=15;
 line(`${serviceNames[a.service_type]} Service Agreement`,true);line(a.details.property_address);line(`Landlord: ${a.details.landlord_name}`);line(`${draft?'Proposed signer':'Signed by'}: ${a.signer_name}`);line(`${draft?'Preview generated':'Signed at'}: ${new Date(a.signed_at).toISOString()}`);line('The landlord accepted this agreement and the Landlord Terms of Business,');line('instructed immediate commencement, and confirmed the bank details below.');
 line(`Account name: ${a.bank_details.account_name}`);line(`Bank: ${a.bank_details.bank_name}`);line(`Sort code: ${a.bank_details.sort_code} - Account: ${a.bank_details.account_number}`);line(`Ongoing rent paid to: ${a.payment_route==='landlord'?'Landlord':'Fleming client account'}`);
 y-=15;const dim=signatureImage.scaleToFit(260,90);page.drawImage(signatureImage,{x:45,y:y-dim.height,width:dim.width,height:dim.height});y-=120;line(`Agreement reference: ${a.id}`);line(`Signing IP: ${a.signature_ip||'Unavailable'}`);line('This certificate forms part of the preceding agreement.');return Buffer.from(await pdf.save());
}
