import {PDFDocument,rgb,pushGraphicsState,popGraphicsState,concatTransformationMatrix} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {cropSignature} from './signature-image';
import {appendSigningCertificate} from './signing-certificate';
import sanitizeHtml from 'sanitize-html';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {pathToFileURL} from 'node:url';
import {pdfFontPath} from './pdf-fonts';
const exec=promisify(execFile);
export type SignatureField={type?:'signature'|'initials'|'date';recipient_id:number;page:number;x:number;y:number;width:number;height:number};
export function validateSignatureFields(fields:any,pages:any[],recipients:any[],draft=false):SignatureField[]{
 if(!Array.isArray(fields)||(!draft&&!fields.length)||fields.length>100)throw Error('Place at least one signature field for each recipient');
 for(const f of fields){if(!f||!['signature','initials','date'].includes(f.type||'signature')||!recipients.some(r=>Number(r.id)===f.recipient_id)||!Number.isInteger(f.page)||f.page<0||f.page>=pages.length||![f.x,f.y,f.width,f.height].every(Number.isFinite)||f.x<0||f.y<0||f.width<.06||f.height<.025||f.x+f.width>1.001||f.y+f.height>1.001)throw Error('Signature fields must fit within the page and belong to a selected recipient');}
 if(!draft&&recipients.some(r=>!fields.some(f=>f.recipient_id===Number(r.id)&&(f.type||'signature')==='signature')))throw Error('Every recipient needs a signature field');
 return fields.map(({type,recipient_id,page,x,y,width,height})=>({...type?{type}:{},recipient_id,page,x,y,width,height}));
}
function displayedPage(page:any){
 const box=page.getCropBox(),rotation=((page.getRotation().angle%360)+360)%360;
 if(![0,90,180,270].includes(rotation))throw Error('Document page has an unsupported rotation');
 return {box,rotation,width:rotation%180?box.height:box.width,height:rotation%180?box.width:box.height};
}
export async function signingPdfPages(bytes:Buffer){
 const pdf=await PDFDocument.load(bytes);
 return pdf.getPages().map(p=>{const {width,height}=displayedPage(p);return {width,height};});
}
export async function prepareSigningPdf(input:Buffer,extension:string){
 let bytes=input;
 if(extension!=='.pdf'){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sign-upload-'));try{
 if(!['.html','.htm','.docx'].includes(extension))throw Error('Upload a PDF, Word DOCX or HTML document');
 if(extension!=='.docx'){const clean=sanitizeHtml(input.toString('utf8'),{allowedTags:['h1','h2','h3','p','br','div','span','strong','b','em','i','u','ol','ul','li','table','thead','tbody','tr','td','th'],allowedAttributes:{td:['colspan','rowspan'],th:['colspan','rowspan']}});bytes=Buffer.from('<html><head><meta charset="utf-8"></head><body>'+clean+'</body></html>');}
 const source=path.join(dir,'document'+extension);await fs.writeFile(source,bytes);
 await exec(process.env.LIBREOFFICE_PATH||'soffice',[`-env:UserInstallation=${pathToFileURL(path.join(dir,'profile')).href}`,'--headless','--convert-to','pdf','--outdir',dir,source],{timeout:60000,maxBuffer:1024*1024});bytes=await fs.readFile(path.join(dir,'document.pdf'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}}
 const pdf=await PDFDocument.load(bytes);if(pdf.getPageCount()>40)throw Error('Use a document of 40 pages or fewer');

 return {bytes,pages:pdf.getPages().map(p=>{const {width,height}=displayedPage(p);return {width,height};})};
}
export async function signingPagePng(bytes:Buffer,page:number){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sign-preview-'));try{await fs.writeFile(path.join(dir,'source.pdf'),bytes);await exec('pdftoppm',['-cropbox','-f',String(page+1),'-l',String(page+1),'-singlefile','-scale-to','1200','-png',path.join(dir,'source.pdf'),path.join(dir,'page')],{timeout:30000,maxBuffer:1024*1024});return await fs.readFile(path.join(dir,'page.png'));}finally{await fs.rm(dir,{recursive:true,force:true});}}
export async function completeSigningPdf(bytes:Buffer,fields:SignatureField[],recipients:any[],sourceHash:string,options:{includeCertificate?:boolean;certificatePageNumbers?:boolean}={}){
 const pdf=await PDFDocument.load(bytes);pdf.registerFontkit(fontkit);const font=await pdf.embedFont(await fs.readFile(pdfFontPath()),{subset:false});
 for(const r of recipients){
  const signature=await pdf.embedPng(await cropSignature(r.signature));
  const initials=fields.some(f=>f.recipient_id===Number(r.id)&&f.type==='initials')?await pdf.embedPng(await cropSignature(r.initials)):null;
  for(const f of fields.filter(f=>f.recipient_id===Number(r.id))){
   const p=pdf.getPage(f.page),{box,rotation,width:w,height:h}=displayedPage(p);
   const transform: [number,number,number,number,number,number]=rotation===90?[0,1,-1,0,box.x+box.width,box.y]:rotation===180?[-1,0,0,-1,box.x+box.width,box.y+box.height]:rotation===270?[0,-1,1,0,box.x,box.y+box.height]:[1,0,0,1,box.x,box.y];
   p.pushOperators(pushGraphicsState(),concatTransformationMatrix(...transform));
   if(f.type==='date'){
    const date=new Date(r.signed_at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}),size=Math.min(12,f.height*h*.65,(f.width*w)/font.widthOfTextAtSize(date,1));
    p.drawText(date,{x:f.x*w,y:h-(f.y+f.height)*h+(f.height*h-size)/2+size*.2,size,font,color:rgb(0,0,0)});
   }else{
    const image=f.type==='initials'?initials!:signature,legacy=!f.type,fit=image.scaleToFit(f.width*w,Math.max(8,f.height*h-(legacy?18:0)));
    p.drawImage(image,{x:f.x*w,y:h-f.y*h-fit.height,width:fit.width,height:fit.height});
    if(legacy){const label=(r.name+' - '+new Date(r.signed_at).toISOString().slice(0,10)).replace(/[^\x20-\x7e]/g,'?');p.drawText(label,{x:f.x*w,y:h-(f.y+f.height)*h+4,size:Math.min(7,(f.width*w)/Math.max(label.length*.52,1)),font,color:rgb(.3,.3,.3)});}
   }
   p.pushOperators(popGraphicsState());
  }
 }
 if(options.includeCertificate!==false)await appendSigningCertificate(pdf,recipients,sourceHash,options.certificatePageNumbers!==false);return Buffer.from(await pdf.save());
}
