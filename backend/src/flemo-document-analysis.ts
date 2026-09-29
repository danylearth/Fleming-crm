import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
const exec=promisify(execFile);
export async function readFlemoAttachment(filename:string,mime:string):Promise<{text:string;limitation:string}>{
 if(mime==='application/pdf')try{const result=await exec(process.env.PDFTOTEXT_PATH||'pdftotext',['-f','1','-l','12','-layout',filename,'-'],{timeout:10000,maxBuffer:512*1024});if(result.stdout.trim().length>80)return {text:result.stdout.slice(0,18000),limitation:'Text from up to 12 pages.'};}catch{/* Scan fallback. */}
 const temp=fs.mkdtempSync(path.join(path.dirname(filename),'read-'));
 try{let images:string[]=[];
  if(mime==='application/pdf'){await exec('pdftoppm',['-f','1','-l','3','-scale-to','2000','-png',filename,path.join(temp,'page')],{timeout:20000,maxBuffer:65536});images=fs.readdirSync(temp).filter(n=>n.endsWith('.png')).sort().map(n=>path.join(temp,n));}
  else{const image=path.join(temp,'image.png');await sharp(filename,{limitInputPixels:40000000}).rotate().resize({width:2200,height:2200,fit:'inside',withoutEnlargement:true}).png().toFile(image);images=[image];}
  const texts=[];for(const image of images){const result=await exec('tesseract',[image,'stdout','-l','eng'],{timeout:15000,maxBuffer:256*1024});texts.push(result.stdout);}
  return {text:texts.join('\n').slice(0,18000),limitation:'Scan recognition from up to 3 pages. Check names, addresses and dates against the source.'};
 }catch{return {text:'',limitation:'Text could not be read. Select the record and document category manually; no compliance date will be inferred.'};}
 finally{fs.rmSync(temp,{recursive:true,force:true});}
}
export const documentCategories=['Primary Identification','Secondary Identification','Proof of Income or Employment','Bank Statements','Right to Rent Share Code','EICR','EPC','Gas Safety Certificate','Electrical Installation Certificate','Inventory','Property Inspection Report','Signed Tenancy Agreement','Insurance','Invoice','Receipt','Quote','Photo','Report','Supporting Document','Other'];
export const complianceFields:Record<string,string>={'EICR':'eicr_expiry_date','EPC':'epc_expiry_date','Gas Safety Certificate':'gas_safety_expiry_date'};
export const validIsoDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function parseDocumentAnalysis(raw:string,ids:string[]){
 const parsed=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
 if(!Array.isArray(parsed.items))throw Error('Flemo did not return a document review. Please try again.');
 return ids.map(id=>{const item=parsed.items.find((i:any)=>i?.upload_id===id)||{};return {upload_id:id,target_key:typeof item.target_key==='string'?item.target_key:'',doc_type:documentCategories.includes(item.doc_type)?item.doc_type:'Other',summary:String(item.summary||'Review the original document.').slice(0,600),expiry_date:validIsoDate(item.expiry_date)?item.expiry_date:'',inspection_date:validIsoDate(item.inspection_date)?item.inspection_date:'',outcome:['satisfactory','unsatisfactory'].includes(item.outcome)?item.outcome:'unknown',date_evidence:String(item.date_evidence||'').slice(0,700),address_evidence:String(item.address_evidence||'').slice(0,700),outcome_evidence:String(item.outcome_evidence||'').slice(0,700)};});
}
export function checkComplianceUpdate(item:any,extracted:any,today:string){
 if(!item.update_compliance)return;
 if(!complianceFields[item.doc_type]||!String(item.target_key).startsWith('property:'))throw Error('Compliance dates require a matching property certificate.');
 if(item.doc_type!==extracted.doc_type)throw Error('Review this certificate in the property record before changing its type or compliance date.');
 if(extracted.outcome==='unsatisfactory')throw Error('An unsatisfactory report must be reviewed on the property record; its reminder will not be cleared here.');
 if(!validIsoDate(item.expiry_date)||item.expiry_date<=today)throw Error('Choose a future next-inspection or expiry date from the certificate.');
 if(extracted.inspection_date&&item.expiry_date<=extracted.inspection_date)throw Error('The next inspection must be after the report date.');
 if(extracted.inspection_date&&extracted.inspection_date>today)throw Error('The report date is in the future. Check the report before updating compliance.');
 if(item.doc_type==='EICR'&&extracted.outcome!=='satisfactory')throw Error('An unsatisfactory or unclear EICR must be reviewed on the property record; its reminder will not be cleared here.');
}
