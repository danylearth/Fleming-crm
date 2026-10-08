import {PDFDocument,rgb,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {pdfFontPath} from './pdf-fonts';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cropSignature} from './signature-image';
import type {SigningConsentSnapshot} from './signing-consent';

type CertificateSigner={name:string;email?:string;signed_at:string;signing_ip?:string|null;signature?:Buffer;opened_at?:string|null;consent_snapshot?:SigningConsentSnapshot|null};
export async function appendSigningCertificate(pdf:PDFDocument,recipients:CertificateSigner[],sourceHash:string,pageNumbers=false){
 pdf.setKeywords([...(pdf.getKeywords()?[pdf.getKeywords()!]:[]),'Source SHA-256: '+sourceHash]);
 if(!recipients.length||recipients.some(r=>!r.signed_at))throw Error('All recipients must sign before a certificate is created');
 pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(await fs.readFile(pdfFontPath()),{subset:false});
 const bold=await pdf.embedFont(await fs.readFile(pdfFontPath(true)),{subset:false});
 const header=await pdf.embedPng(await fs.readFile(path.join(__dirname,'agreement-assets/letterhead-header.png')));
 const footer=await pdf.embedPng(await fs.readFile(path.join(__dirname,'agreement-assets/letterhead-footer.png')));
 const ink=rgb(.15,.03,.23),pink=rgb(.86,0,.43),sheets:string[][]=[],certificatePages:PDFPage[]=[];
 let page:PDFPage,y=0,lines:string[];
 const newPage=()=>{
  page=pdf.addPage([595,842]);certificatePages.push(page);lines=[];sheets.push(lines);
  page.drawImage(header,{x:0,y:739.6,width:595,height:102.4});
  page.drawImage(footer,{x:0,y:0,width:595,height:77});
  page.drawText('Electronic Signature Certificate',{x:44,y:710,size:19,font:bold,color:ink});y=684;
 };
 const wrap=(text:string,width=507)=>{
  const result:string[]=[];let remaining=text.replace(/[\u0000-\u001f\u007f]/g,' ');
  do{let end=remaining.length;while(end>1&&font.widthOfTextAtSize(remaining.slice(0,end),10)>width)end--;
   if(end<remaining.length){const space=remaining.lastIndexOf(' ',end);if(space>0)end=space;}
   result.push(remaining.slice(0,end));remaining=remaining.slice(end).trimStart();
  }while(remaining);return result;
 };
 const space=(height:number)=>{if(y-height<105)newPage();};
 const text=(value:string,heading=false)=>{for(const line of wrap(value)){space(16);if(line)page.drawText(line,{x:44,y,size:10,font:heading?bold:font,color:ink});lines.push(line);y-=16;}};
 for(const [index,r] of recipients.entries()){
  newPage();text('This certificate forms part of the preceding completed document.');
  text('All requested recipients have signed.');y-=8;
  y-=12;
  const date=new Date(r.signed_at);
  text(`Signatory ${index+1}: ${r.name}`,true);text(`Email: ${r.email||'Not recorded'}`);
  if(r.opened_at)text(`Opened on: ${new Date(r.opened_at).toLocaleString('en-GB',{timeZone:'Europe/London',hour12:false})} (Europe/London)`);
  text(`Signed: ${date.toLocaleString('en-GB',{timeZone:'Europe/London',hour12:false})} (Europe/London)`);
  text(`Timestamp (UTC): ${date.toISOString()}`);text(`IP address: ${r.signing_ip||'Not recorded'}`);y-=14;
  if(r.consent_snapshot){
   text('Declarations agreed when signing',true);
   for(const statement of r.consent_snapshot.statements){
    const wrapped=wrap(statement.text,482);space(wrapped.length*15+12);
    page.drawRectangle({x:44,y:y-2,width:10,height:10,borderColor:pink,borderWidth:1});
    if(statement.accepted===true){page.drawLine({start:{x:46,y:y+3},end:{x:49,y:y},thickness:1.4,color:pink});page.drawLine({start:{x:49,y:y},end:{x:53,y:y+7},thickness:1.4,color:pink});}
    for(const line of wrapped){page.drawText(line,{x:62,y,size:10,font,color:ink});lines.push(line);y-=15;}y-=5;
   }

  }else{text('Individual declaration wording was not recorded for this signature.');}
  space(100);y-=10;text('Electronic signature',true);
  if(r.signature){const image=await pdf.embedPng(await cropSignature(r.signature));const fit=image.scaleToFit(220,65);page.drawImage(image,{x:44,y:y-fit.height,width:fit.width,height:fit.height});y-=75;}
  else{text('Signature image not available.');}
 }
 // Signing certificates intentionally have no visible page numbers or agreement references.
 return sheets;
}
