import PDFKit from 'pdfkit';
import {PDFDocument} from 'pdf-lib';
import path from 'node:path';
import {pdfFontPath} from './pdf-fonts';
import type {SignatureField} from './document-signing-pdf';
import {executionHash} from './guarantor-execution-rules';

export interface GuaranteeParticulars {
 tenantNames:string[];
 landlord:string;
 landlordType:string;
 landlordAddress:string;
 serviceType:string;
 officeAddress:string;
 propertyAddress:string;
 startDate:string;
 monthlyRent:number;
 deposit:number;
}
const decode=(text:string)=>text.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(amp|lt|gt|quot|#39|apos);/g,(_all,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'",apos:"'"}[key]!));

/** One server-generated source pack is frozen before either signature is accepted. */
export async function generateGuarantorDeed(form:Record<string,any>,tenancy:GuaranteeParticulars,unsignedTenancy:Buffer){
 const template=require(path.join(__dirname,'agreement-assets/guarantor-deed.mjs'));
 const money=(value:number)=>value.toLocaleString('en-GB',{style:'currency',currency:'GBP'});
 const html=template.deed({form,contact:{name:form.name,email:form.email}},{...tenancy,tenants:tenancy.tenantNames.join(' and '),property:tenancy.propertyAddress,start:tenancy.startDate,rent:money(tenancy.monthlyRent),deposit:money(tenancy.deposit)});
 const body=html.split('<div class="deed-content">')[1]?.split('<h2>Execution by the Guarantor</h2>')[0];
 if(!body||/review copy|No legal guarantee is created/.test(body))throw Error('The final deed template is unavailable');
 const fields:SignatureField[]=[],width=507,left=44;
 const doc=new PDFKit({size:'A4',margins:{left,right:44,top:125,bottom:90},bufferPages:true,autoFirstPage:false});
 doc.registerFont('body',pdfFontPath());doc.registerFont('bold',pdfFontPath(true));
 const chunks:Buffer[]=[];const finished=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 let pageIndex=-1;
 const page=()=>{doc.addPage();pageIndex++;doc.image(path.join(__dirname,'agreement-assets/letterhead-header.png'),0,0,{width:595.28,height:102.4});doc.image(path.join(__dirname,'agreement-assets/letterhead-footer.png'),0,765,{width:595.28,height:77});doc.font('body').fontSize(10).fillColor('#222222');doc.x=left;doc.y=124;};
 const room=(height:number)=>{if(doc.y+height>746)page();};
 const text=(value:string,bold=false,size=10.5,after=7)=>{
  doc.font(bold?'bold':'body').fontSize(size);const lines=value.split('\n');
  for(const line of lines){
   const lineHeight=size+3;let remainder=line;
   while(remainder){let end=remainder.length;while(end>1&&doc.widthOfString(remainder.slice(0,end))>width)end--;if(end<remainder.length){const space=remainder.lastIndexOf(' ',end);if(space>0)end=space;}
    room(lineHeight);doc.font(bold?'bold':'body').fontSize(size).text(remainder.slice(0,end),left,doc.y,{lineBreak:false});doc.y+=lineHeight;remainder=remainder.slice(end).trimStart();
   }
  }
  doc.y+=after;
 };
 page();
 for(const match of body.matchAll(/<(h1|h2|p|table)\b[^>]*>([\s\S]*?)<\/\1>/g)){
  const tag=match[1],value=match[2];
  if(tag==='table'){
   for(const row of value.matchAll(/<tr>([\s\S]*?)<\/tr>/g)){
    const cells=[...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(cell=>decode(cell[1]));
    if(cells.length!==2)throw Error('Invalid deed particulars row');
    doc.font('bold').fontSize(9.5);const labelHeight=doc.heightOfString(cells[0],{width:169});doc.font('body');const valueHeight=doc.heightOfString(cells[1],{width:310});const h=Math.max(labelHeight,valueHeight)+14;
    room(h);const y=doc.y;doc.lineWidth(.4).strokeColor('#d6cfda').rect(left,y,width,h).stroke().moveTo(left+183,y).lineTo(left+183,y+h).stroke();
    doc.font('bold').fontSize(9.5).text(cells[0],left+7,y+7,{width:169});doc.font('body').text(cells[1],left+190,y+7,{width:310});doc.y=y+h;
   }
   doc.y+=12;
  }else if(tag==='h1'){room(36);text(decode(value),true,17,12);}
  else if(tag==='h2'){room(75);doc.y+=4;text(decode(value),true,11.5,6);}
  else text(decode(value));
 }
 room(288);
 const signingBlock=(role:'guarantor'|'witness',recipient_id:number)=>{
  room(140);text(role==='guarantor'?'Execution by the Guarantor':'Witness Attestation',true,12,6);
  text(role==='guarantor'?`Signed as a deed by ${form.name} in the physical presence of ${form.witnessName}.`:`I was physically present and saw the guarantor apply the signature recorded above. Witness: ${form.witnessName}. Address: ${form.witnessAddress}.`,false,10,6);
  const y=doc.y;doc.strokeColor('#b6a7c3').lineWidth(.6).rect(left,y,260,44).stroke();
  fields.push({type:'signature',recipient_id,page:pageIndex,x:left/595.28,y:y/841.89,width:260/595.28,height:44/841.89});
  doc.y=y+51;doc.font('body').fontSize(10).text('Dated Signed:',left,doc.y,{lineBreak:false});
  fields.push({type:'date',recipient_id,page:pageIndex,x:(left+72)/595.28,y:(y+50)/841.89,width:178/595.28,height:18/841.89});
  doc.y=y+77;
 };
 signingBlock('guarantor',1);signingBlock('witness',2);
 doc.end();const deedBytes=await finished,pdf=await PDFDocument.load(deedBytes),attachment=await PDFDocument.load(unsignedTenancy);
 if(attachment.getPageCount()>40)throw Error('The attached tenancy agreement is too large');
 for(const copied of await pdf.copyPages(attachment,attachment.getPageIndices()))pdf.addPage(copied);
 pdf.setTitle('Deed of Guarantee');
 pdf.setSubject('Deed version: '+template.version+'; attached tenancy agreement SHA-256: '+executionHash(unsignedTenancy));
 return {pdf:Buffer.from(await pdf.save()),fields,html,version:template.version,tenancyHash:executionHash(unsignedTenancy)};
}

export async function markUnsignedTenancy(bytes:Buffer){return Buffer.from(bytes);}
